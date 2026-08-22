import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  DomainEventType,
  SubscriptionOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';

/**
 * The payment → onboarding → provisioning chain.
 *
 * This is what the webhook could not do before: it recorded the provider event
 * and updated the subscription, and nothing downstream ever happened. An
 * activated subscription produced no onboarding case and no provisioning
 * request, so somebody had to notice a payment and act on it by hand.
 *
 * Every transition here is idempotent by construction, because Stripe delivers
 * webhooks more than once and a retried activation must not produce a second
 * onboarding, a second provisioning request or a second tenant. The idempotency
 * is in the database — a unique outbox key and an existence check inside the
 * same transaction — not in a "have I done this" flag somebody could forget to
 * read.
 */
@Injectable()
export class OrderActivationService {
  private readonly logger = new Logger(OrderActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Mark an order paid and request onboarding.
   *
   * Called from the Stripe webhook once payment is confirmed. Safe to call
   * repeatedly with the same checkout session: the second call finds the order
   * already PAID and returns without emitting anything new.
   */
  async confirmPayment(input: {
    stripeCheckoutSessionId: string;
    stripeSubscriptionId?: string | null;
    correlationId?: string | null;
  }): Promise<{ orderId: string | null; alreadyConfirmed: boolean }> {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
      select: {
        id: true,
        status: true,
        customerAccountId: true,
        tenantId: true,
        requestedSeats: true,
        planId: true,
        currency: true,
        totalAmount: true,
      },
    });

    if (!order) {
      // A checkout session with no order is a session this platform did not
      // create — an older flow, or another environment sharing the account.
      // Not an error here; the webhook still records the provider event.
      this.logger.warn(
        `No SubscriptionOrder for checkout session ${input.stripeCheckoutSessionId}; nothing to activate.`,
      );
      return { orderId: null, alreadyConfirmed: false };
    }

    if (
      order.status === SubscriptionOrderStatus.PAID ||
      order.status === SubscriptionOrderStatus.ACTIVATED
    ) {
      // The redelivery case. Returning quietly is correct: the caller asked for
      // the payment to be confirmed and it is.
      return { orderId: order.id, alreadyConfirmed: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          status: SubscriptionOrderStatus.PAID,
          paidAt: new Date(),
          // The hash is released here too: the order is no longer the open one
          // for that submission, and the customer may legitimately buy again.
          submissionHash: null,
        },
      });

      // A paying customer is no longer a prospect.
      await tx.customerAccount.update({
        where: { id: order.customerAccountId },
        data: {
          status: CustomerAccountStatus.ACTIVE,
          subStatus: 'Payment confirmed',
        },
      });

      await this.outbox.emit(tx, {
        eventType: DomainEventType.PAYMENT_CONFIRMED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.PAYMENT_CONFIRMED,
          order.id,
        ),
        aggregateType: 'SubscriptionOrder',
        aggregateId: order.id,
        tenantId: order.tenantId,
        customerAccountId: order.customerAccountId,
        correlationId: input.correlationId ?? null,
        payload: {
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
          stripeSubscriptionId: input.stripeSubscriptionId ?? null,
          currency: order.currency,
          totalAmount: order.totalAmount.toString(),
          requestedSeats: order.requestedSeats,
        },
      });
    });

    return { orderId: order.id, alreadyConfirmed: false };
  }

  /**
   * Create the onboarding case for a paid order, and request provisioning.
   *
   * This is the consumer of `PAYMENT_CONFIRMED`. It is separated from
   * `confirmPayment` on purpose: the webhook must acknowledge Stripe quickly,
   * and provisioning a tenant is slow, fallible work that has to be retryable
   * without re-confirming a payment.
   */
  async openOnboarding(orderId: string): Promise<{
    onboardingId: string;
    created: boolean;
  }> {
    const order = await this.prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        customerAccountId: true,
        tenantId: true,
        planId: true,
        billingCycle: true,
        requestedSeats: true,
        totalAmount: true,
        leadId: true,
        customer: {
          select: {
            primaryContactFirstName: true,
            primaryContactLastName: true,
            primaryContactEmail: true,
            primaryContactPhone: true,
            companyName: true,
          },
        },
      },
    });

    // One onboarding per customer per order. Checked inside the transaction so
    // two concurrent deliveries of the same event cannot both create one.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerOnboarding.findFirst({
        where: { customerId: order.customerAccountId },
        select: { id: true },
      });

      if (existing) {
        return { onboardingId: existing.id, created: false };
      }

      const contact = order.customer;
      const onboarding = await tx.customerOnboarding.create({
        data: {
          customerId: order.customerAccountId,
          leadId: order.leadId,
          tenantId: order.tenantId,
          selectedPlanId: order.planId,
          billingCycle: order.billingCycle,
          agreedPrice: order.totalAmount,
          agreedSeats: order.requestedSeats,
          primaryOwnerFirstName: contact.primaryContactFirstName ?? 'Owner',
          primaryOwnerLastName: contact.primaryContactLastName ?? '',
          primaryOwnerWorkEmail:
            contact.primaryContactEmail ?? `owner@${order.customerAccountId}`,
          primaryOwnerPhone: contact.primaryContactPhone,
          paymentConfirmed: true,
          status: CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
          subStatus: 'Payment confirmed, awaiting provisioning',
        },
        select: { id: true },
      });

      await this.outbox.emit(tx, {
        eventType: DomainEventType.PROVISIONING_REQUESTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.PROVISIONING_REQUESTED,
          order.id,
        ),
        aggregateType: 'CustomerOnboarding',
        aggregateId: onboarding.id,
        tenantId: order.tenantId,
        customerAccountId: order.customerAccountId,
        payload: {
          subscriptionOrderId: order.id,
          onboardingId: onboarding.id,
          requestedSeats: order.requestedSeats,
        },
      });

      return { onboardingId: onboarding.id, created: true };
    });
  }

  /**
   * Record that the workspace is usable.
   *
   * Readiness is deliberately separate from onboarding completion: a tenant is
   * READY when its blocking provisioning steps are done, even while a
   * historical import or a custom domain is still outstanding. Withholding a
   * paid-for product until every optional task finishes is not a safety
   * measure, it is a delay nobody asked for.
   */
  async markTenantReady(input: {
    tenantId: string;
    orderId?: string | null;
    partial?: boolean;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: input.tenantId },
        data: {
          readinessStatus: input.partial ? 'PARTIALLY_READY' : 'READY',
          readyAt: new Date(),
        },
      });

      if (input.orderId) {
        await tx.subscriptionOrder.update({
          where: { id: input.orderId },
          data: {
            status: SubscriptionOrderStatus.ACTIVATED,
            activatedAt: new Date(),
            tenantId: input.tenantId,
          },
        });
      }

      await this.outbox.emit(tx, {
        eventType: DomainEventType.TENANT_READY,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.TENANT_READY,
          input.tenantId,
        ),
        aggregateType: 'Tenant',
        aggregateId: input.tenantId,
        tenantId: input.tenantId,
        payload: { partial: Boolean(input.partial) },
      });
    });
  }
}
