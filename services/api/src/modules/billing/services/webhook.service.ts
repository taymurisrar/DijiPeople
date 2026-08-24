import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BillingCycle,
  BillingModel,
  CustomerAccountStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PlatformEventResult,
  PlatformEventSource,
  Prisma,
  SubscriptionStatus,
  TenantStatus,
  WebhookProcessingStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PlatformEventsService } from '../../platform-events/platform-events.service';
import type { StripeClient, StripeEvent } from '../constants/stripe.constants';
import { StripeBillingService } from './stripe-billing.service';
import { OrderActivationService } from './order-activation.service';

type PrismaTx = Prisma.TransactionClient;
type StripeMetadata = Record<string, string | undefined>;
type StripeCheckoutSession = ReturnType<
  StripeClient['webhooks']['constructEvent']
>['data']['object'] & {
  id: string;
  mode?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string; status?: string } | null;
  payment_status?: string | null;
  currency?: string | null;
  metadata?: StripeMetadata | null;
};
type StripeSubscriptionObject = {
  id: string;
  customer?: string | { id: string } | null;
  status?: string | null;
  metadata?: StripeMetadata | null;
  latest_invoice?: string | { id: string } | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  items?: {
    data?: Array<{
      id?: string;
      quantity?: number | null;
      price?: {
        id?: string;
        currency?: string | null;
        recurring?: { interval?: string | null } | null;
      } | null;
    }>;
  };
};
/**
 * BUG-1128 — the invoice object carries its subscription in two different
 * places depending on the API version the event was rendered at.
 *
 * Up to `2026-02-25.clover` it is a flat `invoice.subscription`, and the
 * invoice's own `metadata` carries the checkout context. From
 * `2026-07-29.dahlia` both moved to `invoice.parent.subscription_details`, and
 * the top-level `metadata` arrives empty.
 *
 * Both shapes are declared and both are read, because **the version a webhook
 * arrives at is not the version this service pins**. `STRIPE_API_VERSION`
 * governs outbound calls only; Stripe renders events at the version configured
 * on the endpoint. Reading only one shape means the handler works until
 * somebody changes a dropdown in a dashboard, which is exactly how BUG-1128
 * reached production and rejected a real PKR 12,000 payment.
 */
type StripeInvoiceParent = {
  type?: string | null;
  subscription_details?: {
    subscription?: string | { id: string } | null;
    metadata?: StripeMetadata | null;
  } | null;
} | null;

type StripeInvoiceObject = {
  id: string;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  parent?: StripeInvoiceParent;
  number?: string | null;
  currency?: string | null;
  status?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  payment_intent?: string | { id: string } | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  created?: number | null;
  due_date?: number | null;
  status_transitions?: {
    paid_at?: number | null;
    voided_at?: number | null;
  } | null;
  period_start?: number | null;
  period_end?: number | null;
  metadata?: StripeMetadata | null;
  lines?: {
    data?: Array<{
      period?: { start?: number | null; end?: number | null } | null;
    }>;
  };
};
type StripePaymentIntentObject = {
  id: string;
  customer?: string | { id: string } | null;
  invoice?: string | { id: string } | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  latest_charge?: string | { id: string } | null;
  payment_method_types?: string[] | null;
  metadata?: StripeMetadata | null;
  last_payment_error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeBillingService: StripeBillingService,
    private readonly orderActivation: OrderActivationService,
    @Optional() private readonly platformEvents?: PlatformEventsService,
  ) {}

  async processStripeEvent(event: StripeEvent) {
    const record = await this.ensureWebhookEventRecord(event);

    if (
      record.processingStatus === WebhookProcessingStatus.PROCESSED ||
      record.processingStatus === WebhookProcessingStatus.IGNORED
    ) {
      await this.recordWebhookEvent(event, PlatformEventResult.IGNORED, {
        duplicate: true,
        processingStatus: record.processingStatus,
      });
      return {
        duplicate: true,
        id: record.id,
        stripeEventId: record.stripeEventId,
        status: record.processingStatus,
      };
    }

    try {
      const handled = await this.dispatchStripeEvent(event);
      const processingStatus = handled
        ? WebhookProcessingStatus.PROCESSED
        : WebhookProcessingStatus.IGNORED;

      const updated = await this.prisma.stripeWebhookEvent.update({
        where: { id: record.id },
        data: {
          processingStatus,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      await this.recordWebhookEvent(
        event,
        handled ? PlatformEventResult.SUCCEEDED : PlatformEventResult.IGNORED,
        { duplicate: false, processingStatus },
      );

      return {
        duplicate: false,
        id: updated.id,
        stripeEventId: updated.stripeEventId,
        status: updated.processingStatus,
      };
    } catch (error) {
      await this.prisma.stripeWebhookEvent.update({
        where: { id: record.id },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          errorMessage: getSafeErrorMessage(error),
        },
      });

      await this.recordWebhookEvent(event, PlatformEventResult.FAILED, {
        duplicate: false,
        processingStatus: WebhookProcessingStatus.FAILED,
        error: getSafeErrorMessage(error),
      });

      throw error;
    }
  }

  private async recordWebhookEvent(
    event: StripeEvent,
    result: PlatformEventResult,
    metadata: Record<string, unknown>,
  ) {
    await this.platformEvents?.record({
      eventCode: 'STRIPE_WEBHOOK_PROCESSED',
      source: PlatformEventSource.STRIPE,
      result,
      severity: result === PlatformEventResult.FAILED ? 'ERROR' : 'INFO',
      correlationId: event.id,
      entityType: 'StripeWebhookEvent',
      entityId: event.id,
      route: '/billing/webhooks/stripe',
      metadata: {
        stripeEventType: event.type,
        livemode: event.livemode,
        ...metadata,
      },
    });
  }

  async retryStoredEvent(eventRecordId: string) {
    const record = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: eventRecordId },
    });

    if (!record) {
      throw new NotFoundException('Stripe webhook event not found.');
    }

    if (record.processingStatus !== WebhookProcessingStatus.FAILED) {
      throw new ConflictException('Only failed webhook events can be retried.');
    }

    const event = record.payloadJson as unknown as StripeEvent;
    if (!event?.id || event.id !== record.stripeEventId || !event.type) {
      throw new BadRequestException(
        'Stored Stripe webhook payload is not retryable.',
      );
    }

    await this.prisma.stripeWebhookEvent.update({
      where: { id: record.id },
      data: {
        processingStatus: WebhookProcessingStatus.RECEIVED,
        errorMessage: null,
        processedAt: null,
      },
    });

    return this.processStripeEvent(event);
  }

  private async dispatchStripeEvent(event: StripeEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutSessionCompleted(
          event.data.object as StripeCheckoutSession,
          event.created,
        );
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpsert(
          event.data.object as StripeSubscriptionObject,
          event.created,
        );
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(
          event.data.object as StripeSubscriptionObject,
          event.created,
        );
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        return this.handleInvoiceEvent(
          event.type,
          event.data.object as StripeInvoiceObject,
        );
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        return this.handlePaymentIntentEvent(
          event.type,
          event.data.object as StripePaymentIntentObject,
        );
      default:
        return false;
    }
  }

  private async handleCheckoutSessionCompleted(
    session: StripeCheckoutSession,
    eventCreated?: number,
  ) {
    if (session.mode !== 'subscription') {
      return false;
    }

    const stripeSubscriptionId = getStripeId(session.subscription);
    const stripeCustomerId = getStripeId(session.customer);

    if (!stripeSubscriptionId || !stripeCustomerId) {
      throw new BadRequestException(
        'Checkout session is missing Stripe customer or subscription.',
      );
    }

    /*
     * Two metadata shapes reach this handler, and the branch is on which one.
     *
     * A **tenant-initiated** checkout — an existing workspace changing plan or
     * seat count — names its tenant, and everything below runs as it always has.
     *
     * A **public self-service** checkout cannot name one: no tenant exists until
     * this payment authorises provisioning to create it (BUG-0077). Those
     * sessions carry `subscriptionOrderId`, and their Subscription is created by
     * provisioning alongside the tenant rather than upserted here against a
     * tenant id that resolves to nothing.
     *
     * Branching on the *shape* rather than on a version flag or a deploy date is
     * deliberate. A checkout started before that change and paid after it still
     * carries a `tenantId` and a real pre-created tenant, and still has to
     * complete — so there is no cutover moment to get wrong and no window in
     * which a paying customer falls between the two paths.
     */
    if (!session.metadata?.tenantId) {
      if (session.payment_status === 'paid') {
        await this.orderActivation.confirmPayment({
          stripeCheckoutSessionId: session.id,
          stripeSubscriptionId,
        });
      }
      return true;
    }

    const metadata = requireBillingMetadata(session.metadata);

    const stripeSubscription =
      (await this.stripeBillingService.client.subscriptions.retrieve(
        stripeSubscriptionId,
      )) as unknown as StripeSubscriptionObject;

    await this.prisma.$transaction(async (tx) => {
      const incomingEventAt = fromUnix(eventCreated);
      const existingSubscription = await tx.subscription.findUnique({
        where: { tenantId: metadata.tenantId },
        select: { lastStripeEventCreatedAt: true },
      });
      if (
        incomingEventAt &&
        existingSubscription?.lastStripeEventCreatedAt &&
        incomingEventAt <= existingSubscription.lastStripeEventCreatedAt
      ) {
        return;
      }
      const planPrice = await this.assertPlanPriceForTenantMetadata(
        tx,
        metadata,
      );
      const internalStatus =
        session.payment_status === 'paid' &&
        ['active', 'trialing'].includes(stripeSubscription.status ?? '')
          ? mapStripeSubscriptionStatus(stripeSubscription.status)
          : SubscriptionStatus.INCOMPLETE;
      const seatState = subscriptionSeatState(stripeSubscription, metadata);
      const finalPrice =
        planPrice.billingModel === BillingModel.PER_SEAT
          ? Number(planPrice.unitAmount) * seatState.purchasedSeats
          : Number(planPrice.unitAmount);

      const subscription = await tx.subscription.upsert({
        where: { tenantId: metadata.tenantId },
        create: {
          tenantId: metadata.tenantId,
          planId: metadata.planId,
          planPriceId: metadata.planPriceId,
          billingCycle: planPrice.billingCycle,
          basePrice: planPrice.unitAmount,
          finalPrice,
          currency: planPrice.currency,
          purchasedSeats: seatState.purchasedSeats,
          stripeQuantity: seatState.stripeQuantity,
          stripeSubscriptionItemId: seatState.subscriptionItemId,
          seatsLastReconciledAt: new Date(),
          lastStripeEventCreatedAt: incomingEventAt,
          status: internalStatus,
          startDate: new Date(),
          stripeCustomerId,
          stripeSubscriptionId,
          stripeCheckoutSessionId: session.id,
          stripeStatus: stripeSubscription.status ?? null,
          stripeLatestInvoiceId: getStripeId(stripeSubscription.latest_invoice),
          currentPeriodStart: fromUnix(stripeSubscription.current_period_start),
          currentPeriodEnd: fromUnix(stripeSubscription.current_period_end),
          cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
          canceledAt: fromUnix(stripeSubscription.canceled_at),
          trialStart: fromUnix(stripeSubscription.trial_start),
          trialEnd: fromUnix(stripeSubscription.trial_end),
          createdById: metadata.userId,
          updatedById: metadata.userId,
        },
        update: {
          planId: metadata.planId,
          planPriceId: metadata.planPriceId,
          billingCycle: planPrice.billingCycle,
          basePrice: planPrice.unitAmount,
          finalPrice,
          currency: planPrice.currency,
          purchasedSeats: seatState.purchasedSeats,
          stripeQuantity: seatState.stripeQuantity,
          stripeSubscriptionItemId: seatState.subscriptionItemId,
          seatsLastReconciledAt: new Date(),
          lastStripeEventCreatedAt: incomingEventAt,
          status: internalStatus,
          stripeCustomerId,
          stripeSubscriptionId,
          stripeCheckoutSessionId: session.id,
          stripeStatus: stripeSubscription.status ?? null,
          stripeLatestInvoiceId: getStripeId(stripeSubscription.latest_invoice),
          currentPeriodStart: fromUnix(stripeSubscription.current_period_start),
          currentPeriodEnd: fromUnix(stripeSubscription.current_period_end),
          cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
          canceledAt: fromUnix(stripeSubscription.canceled_at),
          trialStart: fromUnix(stripeSubscription.trial_start),
          trialEnd: fromUnix(stripeSubscription.trial_end),
          updatedById: metadata.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: metadata.tenantId,
          action: 'STRIPE_CHECKOUT_COMPLETED',
          entityType: 'Subscription',
          entityId: subscription.id,
          sourceModule: 'stripe-webhook',
          afterSnapshot: toPrismaJson({
            checkoutSessionId: session.id,
            stripeSubscriptionId,
            stripeCustomerId,
            paymentStatus: session.payment_status,
            internalStatus,
          }),
        },
      });
    });

    /*
     * The chain that did not exist before WP-07. The provider event was
     * recorded and the subscription updated, and then nothing happened —
     * no onboarding case, no provisioning request, so a human had to notice
     * the payment. confirmPayment marks the order paid and emits
     * PAYMENT_CONFIRMED in one transaction; the outbox consumer opens the
     * onboarding and requests provisioning.
     *
     * Outside the transaction above on purpose: Stripe redelivers, and this
     * is idempotent on the order status, so a second delivery is a no-op
     * rather than a second onboarding.
     */
    if (session.payment_status === 'paid') {
      await this.orderActivation.confirmPayment({
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId,
      });
    }

    return true;
  }

  private async handleSubscriptionUpsert(
    subscription: StripeSubscriptionObject,
    eventCreated?: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.upsertSubscriptionFromStripe(tx, subscription, eventCreated);
    });

    return true;
  }

  private async handleSubscriptionDeleted(
    subscription: StripeSubscriptionObject,
    eventCreated?: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.upsertSubscriptionFromStripe(
        tx,
        { ...subscription, status: 'canceled' },
        eventCreated,
      );
    });

    return true;
  }

  private async handleInvoiceEvent(type: string, invoice: StripeInvoiceObject) {
    await this.prisma.$transaction(async (tx) => {
      const context = await this.resolveInvoiceContext(tx, invoice);
      const status = mapStripeInvoiceStatus(type, invoice.status);
      const paidAt =
        type === 'invoice.paid'
          ? (fromUnix(invoice.status_transitions?.paid_at) ?? new Date())
          : fromUnix(invoice.status_transitions?.paid_at);
      const voidedAt =
        type === 'invoice.voided'
          ? (fromUnix(invoice.status_transitions?.voided_at) ?? new Date())
          : fromUnix(invoice.status_transitions?.voided_at);

      const internalInvoice = await tx.invoice.upsert({
        where: { stripeInvoiceId: invoice.id },
        create: {
          tenantId: context.tenantId,
          subscriptionId: context.subscription.id,
          invoiceNumber: invoice.number ?? invoice.id,
          amount: minorToMajorRequired(
            invoice.total ?? invoice.amount_due ?? 0,
          ),
          currency: normalizeCurrency(
            invoice.currency ?? context.subscription.currency,
          ),
          issueDate: fromUnix(invoice.created) ?? new Date(),
          dueDate:
            fromUnix(invoice.due_date) ??
            fromUnix(invoice.created) ??
            new Date(),
          status,
          stripeInvoiceId: invoice.id,
          stripeHostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          stripeInvoicePdfUrl: invoice.invoice_pdf ?? null,
          stripePaymentIntentId: getStripeId(invoice.payment_intent),
          subtotal: minorToMajor(invoice.subtotal),
          tax: minorToMajor(invoice.tax),
          total: minorToMajor(invoice.total),
          amountPaid: minorToMajor(invoice.amount_paid),
          amountDue: minorToMajor(invoice.amount_due),
          periodStart: resolveInvoicePeriodStart(invoice),
          periodEnd: resolveInvoicePeriodEnd(invoice),
          paidAt,
          voidedAt,
          metadataJson: toPrismaJson(invoice),
        },
        update: {
          subscriptionId: context.subscription.id,
          invoiceNumber: invoice.number ?? invoice.id,
          amount: minorToMajorRequired(
            invoice.total ?? invoice.amount_due ?? 0,
          ),
          currency: normalizeCurrency(
            invoice.currency ?? context.subscription.currency,
          ),
          status,
          stripeHostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          stripeInvoicePdfUrl: invoice.invoice_pdf ?? null,
          stripePaymentIntentId: getStripeId(invoice.payment_intent),
          subtotal: minorToMajor(invoice.subtotal),
          tax: minorToMajor(invoice.tax),
          total: minorToMajor(invoice.total),
          amountPaid: minorToMajor(invoice.amount_paid),
          amountDue: minorToMajor(invoice.amount_due),
          periodStart: resolveInvoicePeriodStart(invoice),
          periodEnd: resolveInvoicePeriodEnd(invoice),
          paidAt,
          voidedAt,
          metadataJson: toPrismaJson(invoice),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          action: `STRIPE_${type.toUpperCase().replace(/\./g, '_')}`,
          entityType: 'Invoice',
          entityId: internalInvoice.id,
          sourceModule: 'stripe-webhook',
          afterSnapshot: toPrismaJson({
            stripeInvoiceId: invoice.id,
            status,
            amountPaid: invoice.amount_paid ?? null,
            amountDue: invoice.amount_due ?? null,
          }),
        },
      });

      if (type === 'invoice.paid') {
        await tx.subscription.update({
          where: { id: context.subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            stripeLatestInvoiceId: invoice.id,
            currentPeriodStart: resolveInvoicePeriodStart(invoice),
            currentPeriodEnd: resolveInvoicePeriodEnd(invoice),
            renewalDate: resolveInvoicePeriodEnd(invoice),
            updatedAt: new Date(),
          },
        });

        const tenant = await tx.tenant.findUnique({
          where: { id: context.tenantId },
          select: { id: true, status: true, customerAccountId: true },
        });

        if (tenant?.status === TenantStatus.INACTIVE) {
          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              status: TenantStatus.ACTIVE,
              subStatus: 'Activated by Stripe payment',
            },
          });

          await tx.customerAccount.update({
            where: { id: tenant.customerAccountId },
            data: {
              status: CustomerAccountStatus.ACTIVE,
              subStatus: 'Live',
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId: tenant.id,
              action: 'TENANT_STATUS_CHANGED_BY_STRIPE_PAYMENT',
              entityType: 'Tenant',
              entityId: tenant.id,
              sourceModule: 'stripe-webhook',
              beforeSnapshot: toPrismaJson({ status: TenantStatus.INACTIVE }),
              afterSnapshot: toPrismaJson({ status: TenantStatus.ACTIVE }),
            },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            action: 'SUBSCRIPTION_ACTIVATED_BY_INVOICE_PAID',
            entityType: 'Subscription',
            entityId: context.subscription.id,
            sourceModule: 'stripe-webhook',
            afterSnapshot: toPrismaJson({
              stripeInvoiceId: invoice.id,
              periodStart: resolveInvoicePeriodStart(invoice),
              periodEnd: resolveInvoicePeriodEnd(invoice),
            }),
          },
        });

        await this.upsertPaymentFromInvoice(tx, {
          invoice,
          internalInvoiceId: internalInvoice.id,
          subscriptionId: context.subscription.id,
          tenantId: context.tenantId,
          status: PaymentStatus.SUCCEEDED,
        });
      }

      if (type === 'invoice.payment_failed') {
        await tx.subscription.update({
          where: { id: context.subscription.id },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            stripeLatestInvoiceId: invoice.id,
            updatedAt: new Date(),
          },
        });

        await this.upsertPaymentFromInvoice(tx, {
          invoice,
          internalInvoiceId: internalInvoice.id,
          subscriptionId: context.subscription.id,
          tenantId: context.tenantId,
          status: PaymentStatus.FAILED,
        });

        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            action: 'PAYMENT_FAILED_BY_STRIPE_INVOICE',
            entityType: 'Invoice',
            entityId: internalInvoice.id,
            sourceModule: 'stripe-webhook',
            afterSnapshot: toPrismaJson({
              stripeInvoiceId: invoice.id,
              stripePaymentIntentId: getStripeId(invoice.payment_intent),
            }),
          },
        });
      }
    });

    return true;
  }

  private async handlePaymentIntentEvent(
    type: string,
    paymentIntent: StripePaymentIntentObject,
  ) {
    const status =
      type === 'payment_intent.succeeded'
        ? PaymentStatus.SUCCEEDED
        : PaymentStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.findInvoiceForPaymentIntent(tx, paymentIntent);
      if (!invoice) {
        return;
      }

      const stripePaymentIntentId = paymentIntent.id;
      const existingPayment = await tx.payment.findUnique({
        where: { stripePaymentIntentId },
      });
      const amount =
        typeof paymentIntent.amount === 'number'
          ? minorToMajorRequired(paymentIntent.amount)
          : invoice.amount;

      const data = {
        tenantId: invoice.tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        amount,
        currency: normalizeCurrency(paymentIntent.currency ?? invoice.currency),
        paymentMethod: inferPaymentMethod(paymentIntent.payment_method_types),
        status,
        stripeChargeId: getStripeId(paymentIntent.latest_charge),
        stripeFailureCode: paymentIntent.last_payment_error?.code ?? null,
        stripeFailureMessage: sanitizeFailureMessage(
          paymentIntent.last_payment_error?.message,
        ),
        paidAt: status === PaymentStatus.SUCCEEDED ? new Date() : null,
      };

      if (existingPayment) {
        const payment = await tx.payment.update({
          where: { id: existingPayment.id },
          data,
        });
        await logPaymentIntentAudit(
          tx,
          payment.id,
          invoice.tenantId,
          type,
          paymentIntent,
        );
        return;
      }

      const payment = await tx.payment.create({
        data: {
          ...data,
          stripePaymentIntentId,
        },
      });
      await logPaymentIntentAudit(
        tx,
        payment.id,
        invoice.tenantId,
        type,
        paymentIntent,
      );
    });

    return true;
  }

  private async upsertSubscriptionFromStripe(
    tx: PrismaTx,
    subscription: StripeSubscriptionObject,
    eventCreated?: number,
  ) {
    const context = await this.resolveSubscriptionContext(tx, subscription);
    const planPrice = await this.resolvePlanPriceForSubscription(
      tx,
      subscription,
      context,
    );
    const status = mapStripeSubscriptionStatus(subscription.status);
    const incomingEventAt = fromUnix(eventCreated);
    if (
      incomingEventAt &&
      context.existingSubscription?.lastStripeEventCreatedAt &&
      incomingEventAt <= context.existingSubscription.lastStripeEventCreatedAt
    ) {
      return context.existingSubscription;
    }
    const seatState = subscriptionSeatState(
      subscription,
      subscription.metadata,
    );
    const finalPrice =
      planPrice.billingModel === BillingModel.PER_SEAT
        ? Number(planPrice.unitAmount) * seatState.purchasedSeats
        : Number(planPrice.unitAmount);

    return tx.subscription.upsert({
      where: { tenantId: context.tenantId },
      create: {
        tenantId: context.tenantId,
        planId: planPrice.planId,
        planPriceId: planPrice.id,
        billingCycle: planPrice.billingCycle,
        basePrice: planPrice.unitAmount,
        finalPrice,
        currency: planPrice.currency,
        purchasedSeats: seatState.purchasedSeats,
        stripeQuantity: seatState.stripeQuantity,
        stripeSubscriptionItemId: seatState.subscriptionItemId,
        seatsLastReconciledAt: new Date(),
        lastStripeEventCreatedAt: incomingEventAt,
        status,
        startDate: new Date(),
        stripeCustomerId: context.stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        stripeStatus: subscription.status ?? null,
        stripeLatestInvoiceId: getStripeId(subscription.latest_invoice),
        currentPeriodStart: fromUnix(subscription.current_period_start),
        currentPeriodEnd: fromUnix(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        canceledAt: fromUnix(subscription.canceled_at),
        trialStart: fromUnix(subscription.trial_start),
        trialEnd: fromUnix(subscription.trial_end),
      },
      update: {
        planId: planPrice.planId,
        planPriceId: planPrice.id,
        billingCycle: planPrice.billingCycle,
        basePrice: planPrice.unitAmount,
        finalPrice,
        currency: planPrice.currency,
        purchasedSeats: seatState.purchasedSeats,
        stripeQuantity: seatState.stripeQuantity,
        stripeSubscriptionItemId: seatState.subscriptionItemId,
        seatsLastReconciledAt: new Date(),
        lastStripeEventCreatedAt: incomingEventAt,
        status,
        stripeCustomerId: context.stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        stripeStatus: subscription.status ?? null,
        stripeLatestInvoiceId: getStripeId(subscription.latest_invoice),
        currentPeriodStart: fromUnix(subscription.current_period_start),
        currentPeriodEnd: fromUnix(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        canceledAt: fromUnix(subscription.canceled_at),
        trialStart: fromUnix(subscription.trial_start),
        trialEnd: fromUnix(subscription.trial_end),
      },
    });
  }

  private async resolveSubscriptionContext(
    tx: PrismaTx,
    subscription: StripeSubscriptionObject,
  ) {
    const metadata = subscription.metadata ?? {};
    const metadataTenantId = metadata.tenantId;
    const stripeCustomerId = getStripeId(subscription.customer);

    if (metadataTenantId) {
      const tenant = await tx.tenant.findUnique({
        where: { id: metadataTenantId },
        include: { customerAccount: true, subscription: true },
      });

      if (!tenant) {
        throw new BadRequestException('Stripe subscription tenant not found.');
      }

      if (
        metadata.customerAccountId &&
        tenant.customerAccountId !== metadata.customerAccountId
      ) {
        throw new BadRequestException(
          'Stripe subscription customer account metadata does not match tenant.',
        );
      }

      return {
        tenantId: tenant.id,
        stripeCustomerId:
          stripeCustomerId ?? tenant.customerAccount.stripeCustomerId ?? null,
        existingSubscription: tenant.subscription,
      };
    }

    const existingSubscription = await tx.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (existingSubscription) {
      return {
        tenantId: existingSubscription.tenantId,
        stripeCustomerId:
          stripeCustomerId ?? existingSubscription.stripeCustomerId,
        existingSubscription,
      };
    }

    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Stripe subscription cannot be resolved without customer metadata.',
      );
    }

    const customerAccount = await tx.customerAccount.findFirst({
      where: { stripeCustomerId },
      include: {
        tenants: {
          include: { subscription: true },
        },
      },
    });

    if (!customerAccount || customerAccount.tenants.length !== 1) {
      throw new BadRequestException(
        'Stripe subscription customer could not be resolved to one tenant.',
      );
    }

    return {
      tenantId: customerAccount.tenants[0].id,
      stripeCustomerId,
      existingSubscription: customerAccount.tenants[0].subscription,
    };
  }

  private async resolvePlanPriceForSubscription(
    tx: PrismaTx,
    subscription: StripeSubscriptionObject,
    context: Awaited<ReturnType<WebhookService['resolveSubscriptionContext']>>,
  ) {
    const metadata = subscription.metadata ?? {};
    if (metadata.planPriceId) {
      const planPrice = await tx.planPrice.findUnique({
        where: { id: metadata.planPriceId },
      });
      if (planPrice) return planPrice;
    }

    const stripePriceId = subscription.items?.data?.[0]?.price?.id;
    if (stripePriceId) {
      const planPrice = await tx.planPrice.findUnique({
        where: { stripePriceId },
      });
      if (planPrice) return planPrice;
    }

    if (context.existingSubscription?.planPriceId) {
      const planPrice = await tx.planPrice.findUnique({
        where: { id: context.existingSubscription.planPriceId },
      });
      if (planPrice) return planPrice;
    }

    if (metadata.planId) {
      const billingCycle = inferBillingCycle(subscription);
      const currency = normalizeCurrency(
        subscription.items?.data?.[0]?.price?.currency ??
          context.existingSubscription?.currency ??
          'USD',
      );
      const planPrice = await tx.planPrice.findFirst({
        where: {
          planId: metadata.planId,
          billingCycle,
          currency,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (planPrice) return planPrice;
    }

    throw new BadRequestException(
      'Stripe subscription could not be mapped to a DijiPeople plan price.',
    );
  }

  private async resolveInvoiceContext(
    tx: PrismaTx,
    invoice: StripeInvoiceObject,
  ) {
    /*
     * BUG-1128 — read both shapes. The newer location wins where both are
     * present, because an event rendered at a version that populates `parent`
     * is the authority on its own contents; the flat field is the fallback for
     * older versions, not a second opinion.
     */
    const metadata = invoiceMetadata(invoice);
    const stripeSubscriptionId = invoiceSubscriptionId(invoice);
    const stripeCustomerId = getStripeId(invoice.customer);

    let subscription = stripeSubscriptionId
      ? await tx.subscription.findFirst({
          where: { stripeSubscriptionId },
        })
      : null;

    if (!subscription && stripeSubscriptionId) {
      const stripeSubscription =
        (await this.stripeBillingService.client.subscriptions.retrieve(
          stripeSubscriptionId,
        )) as unknown as StripeSubscriptionObject;
      subscription = await this.upsertSubscriptionFromStripe(
        tx,
        stripeSubscription,
      );
    }

    if (!subscription && metadata.tenantId) {
      subscription = await tx.subscription.findUnique({
        where: { tenantId: metadata.tenantId },
      });
    }

    if (!subscription && stripeCustomerId) {
      const customerAccount = await tx.customerAccount.findFirst({
        where: { stripeCustomerId },
        include: { tenants: { include: { subscription: true } } },
      });
      const tenantSubscriptions =
        customerAccount?.tenants
          .map((tenant) => tenant.subscription)
          .filter((item): item is NonNullable<typeof item> => Boolean(item)) ??
        [];
      if (tenantSubscriptions.length === 1) {
        subscription = tenantSubscriptions[0];
      }
    }

    if (!subscription) {
      throw new BadRequestException(
        'Stripe invoice could not be mapped to a DijiPeople subscription.',
      );
    }

    if (metadata.tenantId && subscription.tenantId !== metadata.tenantId) {
      throw new BadRequestException(
        'Stripe invoice metadata does not match subscription tenant.',
      );
    }

    return {
      tenantId: subscription.tenantId,
      subscription,
    };
  }

  private async upsertPaymentFromInvoice(
    tx: PrismaTx,
    input: {
      invoice: StripeInvoiceObject;
      internalInvoiceId: string;
      subscriptionId: string;
      tenantId: string;
      status: PaymentStatus;
    },
  ) {
    const stripePaymentIntentId = getStripeId(input.invoice.payment_intent);
    const amount =
      input.status === PaymentStatus.SUCCEEDED
        ? minorToMajorRequired(
            input.invoice.amount_paid ?? input.invoice.total ?? 0,
          )
        : minorToMajorRequired(
            input.invoice.amount_due ?? input.invoice.total ?? 0,
          );

    if (stripePaymentIntentId) {
      const existing = await tx.payment.findUnique({
        where: { stripePaymentIntentId },
      });

      const data = {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        invoiceId: input.internalInvoiceId,
        amount,
        currency: normalizeCurrency(input.invoice.currency),
        paymentMethod: PaymentMethod.CARD,
        status: input.status,
        paidAt: input.status === PaymentStatus.SUCCEEDED ? new Date() : null,
      };

      if (existing) {
        return tx.payment.update({
          where: { id: existing.id },
          data,
        });
      }

      return tx.payment.create({
        data: {
          ...data,
          stripePaymentIntentId,
        },
      });
    }

    const existingForInvoice = await tx.payment.findFirst({
      where: {
        invoiceId: input.internalInvoiceId,
        status: input.status,
      },
    });

    if (existingForInvoice) {
      return tx.payment.update({
        where: { id: existingForInvoice.id },
        data: {
          amount,
          currency: normalizeCurrency(input.invoice.currency),
          status: input.status,
          paidAt: input.status === PaymentStatus.SUCCEEDED ? new Date() : null,
        },
      });
    }

    return tx.payment.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        invoiceId: input.internalInvoiceId,
        amount,
        currency: normalizeCurrency(input.invoice.currency),
        paymentMethod: PaymentMethod.CARD,
        status: input.status,
        paidAt: input.status === PaymentStatus.SUCCEEDED ? new Date() : null,
      },
    });
  }

  private async findInvoiceForPaymentIntent(
    tx: PrismaTx,
    paymentIntent: StripePaymentIntentObject,
  ) {
    const invoiceId = getStripeId(paymentIntent.invoice);
    if (invoiceId) {
      const invoice = await tx.invoice.findFirst({
        where: { stripeInvoiceId: invoiceId },
      });
      if (invoice) return invoice;
    }

    return tx.invoice.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
  }

  private async assertPlanPriceForTenantMetadata(
    tx: PrismaTx,
    metadata: BillingMetadata,
  ) {
    const tenant = await tx.tenant.findUnique({
      where: { id: metadata.tenantId },
      select: { customerAccountId: true },
    });

    if (!tenant) {
      throw new BadRequestException('Checkout tenant metadata is invalid.');
    }

    if (tenant.customerAccountId !== metadata.customerAccountId) {
      throw new BadRequestException(
        'Checkout customer account metadata does not match tenant.',
      );
    }

    const planPrice = await tx.planPrice.findFirst({
      where: {
        id: metadata.planPriceId,
        planId: metadata.planId,
      },
    });

    if (!planPrice) {
      throw new BadRequestException('Checkout plan price metadata is invalid.');
    }

    return planPrice;
  }

  private async ensureWebhookEventRecord(event: StripeEvent) {
    try {
      return await this.prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          apiVersion: event.api_version ?? null,
          livemode: event.livemode,
          pendingWebhooks: event.pending_webhooks,
          processingStatus: WebhookProcessingStatus.RECEIVED,
          payloadJson: toPrismaJson(event),
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.prisma.stripeWebhookEvent.findUnique({
        where: { stripeEventId: event.id },
      });

      if (!existing) {
        throw error;
      }

      return existing;
    }
  }
}

type BillingMetadata = {
  tenantId: string;
  customerAccountId: string;
  planId: string;
  planPriceId: string;
  userId?: string;
  seatQuantity?: string;
};

function subscriptionSeatState(
  subscription: StripeSubscriptionObject,
  metadata?: StripeMetadata | null,
) {
  const item = subscription.items?.data?.[0];
  const metadataQuantity = Number(metadata?.seatQuantity);
  const quantity =
    typeof item?.quantity === 'number' && item.quantity > 0
      ? item.quantity
      : Number.isInteger(metadataQuantity) && metadataQuantity > 0
        ? metadataQuantity
        : 1;
  return {
    purchasedSeats: quantity,
    stripeQuantity: quantity,
    subscriptionItemId: item?.id ?? null,
  };
}

function requireBillingMetadata(metadata: StripeMetadata | null | undefined) {
  const tenantId = metadata?.tenantId;
  const customerAccountId = metadata?.customerAccountId;
  const planId = metadata?.planId;
  const planPriceId = metadata?.planPriceId;

  if (!tenantId || !customerAccountId || !planId || !planPriceId) {
    throw new BadRequestException(
      'Stripe event is missing required billing metadata.',
    );
  }

  return {
    tenantId,
    customerAccountId,
    planId,
    planPriceId,
    userId: metadata?.userId,
  };
}

function mapStripeSubscriptionStatus(
  status: string | null | undefined,
): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELED;
    case 'unpaid':
      return SubscriptionStatus.UNPAID;
    case 'incomplete':
      return SubscriptionStatus.INCOMPLETE;
    case 'incomplete_expired':
      return SubscriptionStatus.EXPIRED;
    case 'paused':
      return SubscriptionStatus.PAUSED;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

function mapStripeInvoiceStatus(
  type: string,
  status: string | null | undefined,
) {
  if (type === 'invoice.paid' || status === 'paid') {
    return InvoiceStatus.PAID;
  }

  if (type === 'invoice.payment_failed') {
    return InvoiceStatus.PAYMENT_FAILED;
  }

  if (type === 'invoice.voided' || status === 'void') {
    return InvoiceStatus.VOIDED;
  }

  if (type === 'invoice.marked_uncollectible' || status === 'uncollectible') {
    return InvoiceStatus.UNCOLLECTIBLE;
  }

  if (type === 'invoice.finalized' || status === 'open') {
    return InvoiceStatus.ISSUED;
  }

  return InvoiceStatus.DRAFT;
}

function inferBillingCycle(subscription: StripeSubscriptionObject) {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'year' ? BillingCycle.ANNUAL : BillingCycle.MONTHLY;
}

function inferPaymentMethod(
  paymentMethodTypes: string[] | null | undefined,
): PaymentMethod {
  const primary = paymentMethodTypes?.[0];
  if (primary === 'card') return PaymentMethod.CARD;
  if (primary === 'us_bank_account' || primary === 'bank_transfer') {
    return PaymentMethod.BANK;
  }
  return PaymentMethod.OTHER;
}

function minorToMajor(value: number | Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  return new Prisma.Decimal(numeric).div(100).toDecimalPlaces(2);
}

function minorToMajorRequired(value: number | Prisma.Decimal) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return new Prisma.Decimal(numeric).div(100).toDecimalPlaces(2);
}

function normalizeCurrency(value: string | null | undefined) {
  return (value ?? 'USD').toUpperCase();
}

function getStripeId(value: unknown) {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return null;
}

/**
 * BUG-1128 — the subscription an invoice belongs to, from either API shape.
 *
 * `invoice.parent.subscription_details.subscription` from `2026-07-29.dahlia`
 * onwards; the flat `invoice.subscription` before it. Newer wins, and neither
 * is assumed: an invoice with no subscription at all is legitimate — a one-off
 * invoice has no parent of this type — so the answer is nullable and callers
 * must keep handling null.
 */
export function invoiceSubscriptionId(invoice: {
  subscription?: string | { id: string } | null;
  parent?: StripeInvoiceParent;
}) {
  const fromParent =
    invoice.parent?.subscription_details?.subscription ?? undefined;
  return getStripeId(fromParent) ?? getStripeId(invoice.subscription);
}

/**
 * BUG-1128 — the checkout context an invoice carries, from either API shape.
 *
 * The two are merged rather than one replacing the other, because they are not
 * alternatives in principle: an invoice may carry its own metadata *and* belong
 * to a subscription that carries more. The subscription's wins on conflict, for
 * the same reason as above — it is the one the newer payload populates and the
 * one the checkout actually stamps.
 */
export function invoiceMetadata(invoice: {
  metadata?: StripeMetadata | null;
  parent?: StripeInvoiceParent;
}): StripeMetadata {
  return {
    ...(invoice.metadata ?? {}),
    ...(invoice.parent?.subscription_details?.metadata ?? {}),
  };
}

function fromUnix(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function resolveInvoicePeriodStart(invoice: StripeInvoiceObject) {
  return (
    fromUnix(invoice.period_start) ??
    fromUnix(invoice.lines?.data?.[0]?.period?.start)
  );
}

function resolveInvoicePeriodEnd(invoice: StripeInvoiceObject) {
  return (
    fromUnix(invoice.period_end) ??
    fromUnix(invoice.lines?.data?.[0]?.period?.end)
  );
}

function sanitizeFailureMessage(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 500);
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 1000);
  }

  return 'Stripe webhook processing failed.';
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function logPaymentIntentAudit(
  tx: PrismaTx,
  paymentId: string,
  tenantId: string,
  type: string,
  paymentIntent: StripePaymentIntentObject,
) {
  await tx.auditLog.create({
    data: {
      tenantId,
      action: `STRIPE_${type.toUpperCase().replace(/\./g, '_')}`,
      entityType: 'Payment',
      entityId: paymentId,
      sourceModule: 'stripe-webhook',
      afterSnapshot: toPrismaJson({
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: getStripeId(paymentIntent.latest_charge),
        status: paymentIntent.status ?? null,
        failureCode: paymentIntent.last_payment_error?.code ?? null,
      }),
    },
  });
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
