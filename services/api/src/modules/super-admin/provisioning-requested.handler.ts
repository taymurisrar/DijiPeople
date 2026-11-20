import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CustomerAccountStatus,
  DomainEventType,
  PaymentProvider,
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
import { OrderActivationService } from '../billing/services/order-activation.service';
import { PaymentSettlementService } from '../billing/services/payment-settlement.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { storedPersonName } from '../../common/utils/person-name';
import { AuditService } from '../audit/audit.service';
import { TenantProvisioningRunService } from '../tenant-control-plane/tenant-provisioning-run.service';

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
    private readonly activation: OrderActivationService,
    private readonly settlement: PaymentSettlementService,
    private readonly runs: TenantProvisioningRunService,
    private readonly audit: AuditService,
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
        paymentProvider: true,
        stripeCheckoutSessionId: true,
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
      /*
       * The tenant exists, so it is never created again. The order is linked to
       * it in the same transaction that creates it, which means reaching here on
       * a retry is how a failure *after* creation shows up (the invitation, the
       * hostname). Provisioning is skipped, and the idempotent closing steps run
       * so the order, the onboarding record and the tenant's readiness are not
       * left half-finished. BUG-4467: this used to return here without finishing,
       * and before the link was atomic a retry created a second tenant.
       */
      await this.completeProvisioning(order, order.tenantId);
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

    const result = await this.onboarding.createWorkspace({
      customerAccountId: order.customerAccountId,
      subscriptionOrderId: order.id,
      companyName: order.customer.companyName,
      slug,
      contactEmail: order.customer.contactEmail,
      // What the customer entered, never a placeholder (BUG-4111).
      owner: {
        ...storedPersonName({
          firstName: order.customer.primaryContactFirstName,
          lastName: order.customer.primaryContactLastName,
          email: ownerEmail,
        }),
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
        // Orders opened before the column existed all went to Stripe.
        paymentProvider:
          order.paymentProvider ??
          (order.stripeCheckoutSessionId ? PaymentProvider.STRIPE : null),
        autoRenew: true,
      },
      // Never a generic "amount due" invoice: Stripe has already invoiced and
      // will keep invoicing, and a Safepay payment is recorded below as the
      // paid invoice it is. Either way a second invoice would double-count.
      generateInitialInvoice: false,
      note: `Workspace provisioned automatically from order ${order.orderNumber}.`,
    });

    await this.completeProvisioning(order, result.tenantId);

    this.logger.log(
      `Provisioned tenant ${result.tenantId} (${slug}) for order ${order.orderNumber}.`,
    );

    return {
      status: 'PROCESSED',
      detail: `Provisioned tenant ${result.tenantId} at ${slug}.`,
    };
  }
  /**
   * Everything that follows the tenant's creation, recorded as a provisioning
   * run so Platform Admin -> Operations -> Provisioning can show it.
   *
   * Self-service provisioning wrote no run at all, so a paid customer whose
   * workspace was half-built was invisible to operators (BUG-4484). The run is
   * keyed on the order, so every redelivery of the event resumes the same row
   * (attempt + 1) rather than adding another. A failure is recorded on the run
   * and then rethrown, so the outbox still retries.
   *
   * A failure before the tenant exists leaves nothing to attach a run to (a run
   * belongs to a tenant), and the creating transaction has rolled back anyway;
   * that case stays visible in the outbox, not here.
   */
  private async completeProvisioning(
    order: { id: string; customerAccountId: string },
    tenantId: string,
  ) {
    const run = await this.runs.startOrResumeForOrder({
      tenantId,
      subscriptionOrderId: order.id,
      customerAccountId: order.customerAccountId,
      correlationId: order.id,
    });
    await this.auditTransition(
      run?.resumed
        ? 'TENANT_PROVISIONING_RESUMED'
        : 'TENANT_PROVISIONING_STARTED',
      tenantId,
      order.id,
      run,
    );

    let step = 'tenant-record';
    try {
      if (run && !run.resumed) {
        // Committed together by createWorkspace's transaction, so by the time a
        // run exists they are all true.
        await this.runs.stepSucceeded(
          run.id,
          'tenant-record',
          'Tenant created.',
        );
        await this.runs.stepSucceeded(run.id, 'workspace-slug-reserved');
        await this.runs.stepSucceeded(run.id, 'rbac-defaults');
        await this.runs.stepSucceeded(run.id, 'identities-and-billing');
        await this.runs.stepSkipped(
          run.id,
          'customization-defaults',
          'Not performed by self-service provisioning.',
        );
      }

      step = 'workspace-domain';
      await this.runs.stepStarted(run?.id, step);
      await this.onboarding.ensureSystemDomain(tenantId, null);
      await this.runs.stepSucceeded(run?.id, step);

      step = 'invitations';
      await this.runs.stepStarted(run?.id, step);
      await this.onboarding.ensureOwnerInvitations(tenantId, null);
      await this.runs.stepSucceeded(run?.id, step);

      // Activation and readiness are the last statement that the workspace is
      // usable, which is what this step verifies.
      step = 'workspace-routing-verified';
      await this.runs.stepStarted(run?.id, step);
      await this.finalize(order, tenantId);
      await this.runs.stepSucceeded(run?.id, step);

      await this.runs.finish(run?.id, { status: 'SUCCEEDED' });
      await this.auditTransition(
        'TENANT_PROVISIONING_SUCCEEDED',
        tenantId,
        order.id,
        run,
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Provisioning step failed.';
      await this.runs.stepFailed(run?.id, step, detail);
      await this.runs.finish(run?.id, {
        status: 'FAILED',
        failedStepKey: step,
        message: detail,
      });
      await this.auditTransition(
        'TENANT_PROVISIONING_FAILED',
        tenantId,
        order.id,
        run,
        {
          failedStepKey: step,
          message: detail,
        },
      );
      throw error;
    }
  }

  /**
   * Audit a lifecycle transition. Routed to the platform log with a null actor:
   * the system did this, and these are operator-facing facts. Telemetry never
   * fails the provisioning it describes.
   */
  private async auditTransition(
    action: string,
    tenantId: string,
    orderId: string,
    run: { id: string; attempt: number } | null,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await this.audit.log({
        tenantId: 'platform',
        actorUserId: null,
        action,
        entityType: 'TenantProvisioningRun',
        entityId: run?.id ?? orderId,
        sourceModule: 'super-admin',
        afterSnapshot: {
          tenantId,
          subscriptionOrderId: orderId,
          attempt: run?.attempt ?? null,
          ...extra,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to audit ${action} for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * The closing steps. Each is idempotent, so a retry can run it again after a
   * failure part-way through.
   */
  private async finalize(
    order: { id: string; customerAccountId: string },
    tenantId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          tenantId,
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
        data: { tenantId, tenantCreated: true },
      });
    });

    // A Safepay order's payment has no tenant to belong to until now. Idempotent
    // on the tracker, and a no-op for Stripe orders, whose invoices arrive by
    // webhook.
    await this.settlement.recordOrderPayment(order.id);

    /*
     * Say that the workspace is usable — the step this handler's own comment
     * above promises ("the customer is about to be told it is ready") and which
     * nothing performed.
     *
     * `markTenantReady` existed, was correct, and had **no caller anywhere in
     * the repository**, so `Tenant.readinessStatus` stayed NOT_READY for every
     * tenant ever provisioned. `getOnboardingStatus` derives both the final
     * "Finishing setup" step and the workspace link from that field, so a paying
     * customer watched a progress page that could never finish and was never
     * given the address of the workspace they had bought. The same shape as the
     * missing consumer described at the top of this file: the work was done, and
     * the last statement of it was not.
     *
     * After the transaction rather than inside it: this is a separate,
     * idempotent state change, and `markTenantReady` opens its own transaction.
     */
    await this.activation.markTenantReady({
      tenantId,
      orderId: order.id,
    });
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
