import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CustomerAccountStatus,
  DomainEventType,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import type {
  OutboxHandler,
  OutboxHandlerOutcome,
} from '../outbox/outbox.types';
import { PlatformOnboardingService } from './platform-onboarding.service';

/**
 * Provision the workspace a confirmed payment paid for.
 *
 * **The consumer that was missing.** `openOnboarding` has emitted
 * `PROVISIONING_REQUESTED` since TASK-0007 WP-07, and until now nothing
 * subscribed to it: the event was written, delivered, and dropped. Automatic
 * provisioning never ran. Nobody noticed because the checkout path created a
 * tenant *before* payment (BUG-0077), so a workspace existed either way — at an
 * address nobody chose, owned by a second CustomerAccount.
 *
 * With that block removed, this is the only thing that creates a self-service
 * tenant, which is why the two changes had to land together.
 *
 * Idempotency is layered, as it is for `PaymentConfirmedHandler`. The dispatcher
 * will not re-run a consumer that already succeeded; on top of that this checks
 * whether the order already points at a tenant, because a redelivery after a
 * crash *between* provisioning and settling the outbox row is exactly the case
 * a dispatcher guarantee cannot cover.
 */
@Injectable()
export class ProvisioningRequestedHandler
  implements OutboxHandler, OnModuleInit
{
  readonly consumerKey = 'billing.provisioning-requested.provision-tenant';
  readonly handles = [DomainEventType.PROVISIONING_REQUESTED];

  private readonly logger = new Logger(ProvisioningRequestedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: PlatformOnboardingService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register(this);
  }

  async handle(
    event: OutboxEvent,
    payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome> {
    const orderId = readOrderId(payload);
    if (!orderId) {
      /*
       * Not retryable: a payload without an order id will never gain one. Failing
       * loudly rather than retrying forever keeps a malformed event out of the
       * dispatcher's backlog.
       */
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: 'Event payload carries no subscriptionOrderId.',
      };
    }

    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        tenantId: true,
        customerAccountId: true,
        planId: true,
        planPriceId: true,
        billingCycle: true,
        currency: true,
        requestedSeats: true,
        requestedSlug: true,
        subscription: { select: { stripeSubscriptionId: true } },
        customer: {
          select: {
            companyName: true,
            contactEmail: true,
            primaryContactFirstName: true,
            primaryContactLastName: true,
            primaryContactEmail: true,
          },
        },
      },
    });

    if (!order) {
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: `Order ${orderId} no longer exists.`,
      };
    }

    // Already provisioned. A redelivery, or an operator who provisioned by hand
    // before the event was processed.
    if (order.tenantId) {
      return {
        status: 'PROCESSED',
        detail: `Order ${order.orderNumber} already has tenant ${order.tenantId}.`,
      };
    }

    if (!order.planId) {
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: `Order ${order.orderNumber} has no plan to provision against.`,
      };
    }

    const ownerEmail =
      order.customer.primaryContactEmail ?? order.customer.contactEmail;
    if (!ownerEmail) {
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: `Order ${order.orderNumber} has no owner email.`,
      };
    }

    /*
     * The reserved address is preferred and re-checked, never assumed. The hold
     * on the order guards against other *orders*; `Tenant.slug` is the permanent
     * authority, and a tenant could have taken the name by another route since
     * checkout. A paid customer gets a workspace either way.
     */
    const slug = await this.onboarding.resolveWorkspaceSlug(
      order.requestedSlug,
      order.customer.companyName,
    );

    if (order.requestedSlug && slug !== order.requestedSlug) {
      this.logger.warn(
        `Order ${order.orderNumber} reserved "${order.requestedSlug}" but it was taken; provisioned as "${slug}".`,
      );
    }

    const result = await this.onboarding.provisionTenantForCustomer({
      customerAccountId: order.customerAccountId,
      companyName: order.customer.companyName,
      slug,
      contactEmail: order.customer.contactEmail,
      owner: {
        firstName: order.customer.primaryContactFirstName ?? 'Workspace',
        lastName: order.customer.primaryContactLastName ?? 'Owner',
        email: ownerEmail,
      },
      // ACTIVE, not ONBOARDING: this workspace is paid for, and the customer is
      // about to be told it is ready.
      tenantStatus: TenantStatus.ACTIVE,
      // No human triggered this. See ProvisionTenantForCustomerInput.actorUserId.
      actorUserId: null,
      subscription: {
        planId: order.planId,
        planPriceId: order.planPriceId,
        billingCycle: order.billingCycle,
        status: SubscriptionStatus.ACTIVE,
        currency: order.currency,
        purchasedSeats: order.requestedSeats,
        stripeSubscriptionId: order.subscription?.stripeSubscriptionId ?? null,
        autoRenew: true,
      },
      // Stripe has already invoiced and will keep invoicing. A second internal
      // invoice for the same period would double-count revenue.
      generateInitialInvoice: false,
      note: `Workspace provisioned automatically from order ${order.orderNumber}.`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          tenantId: result.tenantId,
          activatedAt: new Date(),
          // The hold has served its purpose: Tenant.slug now owns the name, and
          // holding it here as well would block nothing and confuse a reader.
          requestedSlug: null,
        },
      });

      await tx.customerAccount.update({
        where: { id: order.customerAccountId },
        data: {
          status: CustomerAccountStatus.ACTIVE,
          subStatus: 'Workspace provisioned',
        },
      });

      await tx.customerOnboarding.updateMany({
        where: { customerId: order.customerAccountId, tenantId: null },
        data: { tenantId: result.tenantId, tenantCreated: true },
      });
    });

    this.logger.log(
      `Provisioned tenant ${result.tenantId} (${slug}) for order ${order.orderNumber}.`,
    );

    return {
      status: 'PROCESSED',
      detail: `Provisioned tenant ${result.tenantId} at ${slug}.`,
    };
  }
}

/** The order id, from a payload shape the emitter controls but TypeScript cannot. */
function readOrderId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).subscriptionOrderId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
