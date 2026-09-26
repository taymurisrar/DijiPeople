import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CustomerAccountStatus,
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  PlanChangeStatus,
  PlatformEventResult,
  PlatformEventSource,
  Prisma,
  RefundReasonCode,
  RefundStatus,
  SubscriptionOrderStatus,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isSubscriptionLive } from '../../../common/security/tenant-entitlement.rule';
import { AuditService } from '../../audit/audit.service';
import { PlatformEventsService } from '../../platform-events/platform-events.service';
import { resolveBillableSeats } from '../billing-seat-pricing';
import {
  addBillingInterval,
  parseInvoicePurpose,
  renewalPeriod,
  settlementMismatch,
  type InvoicePurpose,
} from '../managed-billing.rules';
import type {
  ProviderPaymentState,
  ProviderWebhookEvent,
} from '../providers/payment-gateway';
import { PaymentGateways } from '../providers/payment-gateways';
import { OrderActivationService } from './order-activation.service';

type PrismaTx = Prisma.TransactionClient;

const PAYABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAYMENT_FAILED,
];

/** Who asked for a settlement — recorded on every audit entry it writes. */
export type SettlementSource = 'WEBHOOK' | 'RETURN' | 'SWEEP' | 'OPERATOR';

/**
 * Settles payments DijiPeople priced and a provider other than Stripe executed.
 *
 * **The provider's API is the only evidence.** A browser returning to the
 * success URL proves nothing, and a webhook body is only a hint that something
 * changed: every path here — webhook, the buyer's status poll, the sweeper, an
 * operator — re-reads the payment from the provider and acts on that answer.
 * Which of them arrives first does not matter, because they all converge on
 * the same conditional update: exactly one moves a payment out of PENDING, and
 * the rest find it settled.
 *
 * A confirmed payment is then checked against what DijiPeople asked for. A
 * different amount or currency is never credited — it is recorded as failed
 * and raised for a human, because money moved that does not match an invoice.
 *
 * Money that arrives for something already paid, voided or cancelled is not
 * silently kept: it becomes a `RefundRequest` for an operator.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGateways,
    private readonly orderActivation: OrderActivationService,
    private readonly audit: AuditService,
    @Optional() private readonly platformEvents?: PlatformEventsService,
  ) {}

  /** Re-read a tenant payment from its provider and apply the answer. */
  async settlePayment(
    paymentId: string,
    source: SettlementSource,
  ): Promise<PaymentStatus | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        amount: true,
        currency: true,
        paymentProvider: true,
        providerPaymentId: true,
        failureCode: true,
      },
    });

    if (
      !payment ||
      !payment.paymentProvider ||
      !this.gateways.isManaged(payment.paymentProvider) ||
      !payment.providerPaymentId
    ) {
      return payment?.status ?? null;
    }

    // Settled payments are only revisited for news of a refund, which only a
    // webhook brings. A status poll must not call the provider for nothing,
    // and a mismatch already raised for a human is not raised again.
    if (
      payment.status === PaymentStatus.REFUNDED ||
      (payment.status === PaymentStatus.SUCCEEDED && source !== 'WEBHOOK') ||
      payment.failureCode?.endsWith('_MISMATCH')
    ) {
      return payment.status;
    }

    const state = await this.gateways
      .get(payment.paymentProvider)
      .fetchPayment(payment.providerPaymentId);

    switch (state.status) {
      case 'PENDING':
        return payment.status;
      case 'FAILED':
        return this.markFailed(payment, state, source);
      case 'REFUNDED':
        return this.markRefunded(payment, source);
      case 'PAID': {
        const mismatch = settlementMismatch(payment, state);
        if (mismatch) {
          return this.rejectMismatch(payment, state, mismatch, source);
        }
        await this.credit(payment.id, payment.paymentProvider, state, source);
        return PaymentStatus.SUCCEEDED;
      }
    }
  }

  /**
   * Re-read a public signup order's payment and, if it is paid, hand it to the
   * same `confirmPayment` the Stripe webhook uses — so onboarding and
   * provisioning follow exactly as they do for a Stripe buyer.
   *
   * `tracker` names a checkout other than the order's current one: a buyer who
   * reopened the wizard gets a fresh tracker, and the old one can still be paid.
   */
  async settleOrder(
    orderId: string,
    source: SettlementSource,
    tracker?: string,
  ): Promise<SubscriptionOrderStatus | null> {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerAccountId: true,
        totalAmount: true,
        currency: true,
        paymentProvider: true,
        providerPaymentId: true,
      },
    });
    if (
      !order?.paymentProvider ||
      !this.gateways.isManaged(order.paymentProvider)
    ) {
      return order?.status ?? null;
    }
    // Only an order still awaiting payment is worth asking about. An ABANDONED
    // one is included because the buyer may have paid on a page they still had
    // open; a FAILED one has already been raised for a human and must not be
    // re-raised on every poll.
    if (
      order.status !== SubscriptionOrderStatus.DRAFT &&
      order.status !== SubscriptionOrderStatus.PENDING_PAYMENT &&
      order.status !== SubscriptionOrderStatus.ABANDONED
    ) {
      // A second checkout for an order already paid through another one — a
      // buyer who reopened the wizard and paid both pages. The money is real
      // and must not vanish: it is raised for a refund.
      if (
        tracker &&
        tracker !== order.providerPaymentId &&
        (order.status === SubscriptionOrderStatus.PAID ||
          order.status === SubscriptionOrderStatus.ACTIVATED)
      ) {
        await this.raiseOrderDuplicate(order, tracker, source);
      }
      return order.status;
    }

    const providerPaymentId = tracker ?? order.providerPaymentId;
    if (!providerPaymentId) return order.status;

    const state = await this.gateways
      .get(order.paymentProvider)
      .fetchPayment(providerPaymentId);
    if (state.status !== 'PAID') return order.status;

    const mismatch = settlementMismatch(
      { amount: order.totalAmount, currency: order.currency },
      state,
    );
    if (mismatch) {
      await this.prisma.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          status: SubscriptionOrderStatus.FAILED,
          failureReason: `${order.paymentProvider}_${mismatch}: provider reported ${state.amount ?? '?'} ${state.currency ?? '?'}, order total ${order.totalAmount.toString()} ${order.currency}.`,
        },
      });
      await this.recordEvent('BILLING_PAYMENT_MISMATCH', 'CRITICAL', {
        customerAccountId: order.customerAccountId,
        entityType: 'SubscriptionOrder',
        entityId: order.id,
        metadata: {
          provider: order.paymentProvider,
          providerPaymentId,
          mismatch,
          reportedAmount: state.amount,
          reportedCurrency: state.currency,
          source,
        },
      });
      return SubscriptionOrderStatus.FAILED;
    }

    // Paid on a tracker the order no longer points at: move the pointer, so
    // the order records the checkout that actually took the money.
    if (tracker && tracker !== order.providerPaymentId) {
      await this.prisma.subscriptionOrder.update({
        where: { id: order.id },
        data: { providerPaymentId: tracker },
      });
    }

    await this.orderActivation.confirmPayment({
      orderId: order.id,
      correlationId: providerPaymentId,
    });
    await this.recordEvent('BILLING_PAYMENT_CONFIRMED', 'INFO', {
      customerAccountId: order.customerAccountId,
      entityType: 'SubscriptionOrder',
      entityId: order.id,
      metadata: {
        provider: order.paymentProvider,
        providerPaymentId,
        orderNumber: order.orderNumber,
        source,
      },
    });
    return SubscriptionOrderStatus.PAID;
  }

  /**
   * Route a verified webhook to whatever it is about. Only identifies the
   * record; what happened is re-read from the provider by the settle calls.
   */
  async handleProviderEvent(
    provider: PaymentProvider,
    event: ProviderWebhookEvent,
  ): Promise<'PROCESSED' | 'IGNORED'> {
    const tracker = event.providerPaymentId;
    if (!tracker) return 'IGNORED';

    const payment = await this.prisma.payment.findUnique({
      where: {
        paymentProvider_providerPaymentId: {
          paymentProvider: provider,
          providerPaymentId: tracker,
        },
      },
      select: { id: true },
    });
    if (payment) {
      await this.settlePayment(payment.id, 'WEBHOOK');
      return 'PROCESSED';
    }

    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { providerPaymentId: tracker },
      select: { id: true },
    });
    if (order) {
      await this.settleOrder(order.id, 'WEBHOOK');
      return 'PROCESSED';
    }

    // A tracker we no longer point at. Its own metadata carries the order id
    // it was opened for — read from the provider, not from the webhook body.
    const state = await this.gateways.get(provider).fetchPayment(tracker);
    const replaced = state.reference
      ? await this.prisma.subscriptionOrder.findFirst({
          where: { id: state.reference, paymentProvider: provider },
          select: { id: true },
        })
      : null;
    if (replaced) {
      await this.settleOrder(replaced.id, 'WEBHOOK', tracker);
      return 'PROCESSED';
    }

    await this.recordEvent('BILLING_PAYMENT_UNMATCHED', 'WARNING', {
      entityType: 'PaymentProviderEvent',
      entityId: event.externalEventId,
      metadata: { provider, providerPaymentId: tracker, state: state.status },
    });
    return 'IGNORED';
  }

  /**
   * Record the first payment of a public signup once provisioning has created
   * the tenant it paid for. Before this point no tenant exists to own an
   * invoice, which is why the order carried the money until now.
   */
  async recordOrderPayment(orderId: string): Promise<void> {
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        tenantId: true,
        paymentProvider: true,
        providerPaymentId: true,
        currency: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAt: true,
        planId: true,
        planPriceId: true,
        requestedSeats: true,
        promotionId: true,
      },
    });
    if (
      !order?.tenantId ||
      !order.paymentProvider ||
      !this.gateways.isManaged(order.paymentProvider) ||
      !order.providerPaymentId ||
      !order.planId ||
      !order.planPriceId
    ) {
      return;
    }
    const {
      tenantId,
      paymentProvider,
      providerPaymentId,
      planId,
      planPriceId,
    } = order;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: {
          paymentProvider_providerPaymentId: {
            paymentProvider,
            providerPaymentId,
          },
        },
        select: { id: true },
      });
      if (existing) return;

      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { tenantId },
        select: { id: true, currentPeriodStart: true, currentPeriodEnd: true },
      });
      const paidAt = order.paidAt ?? new Date();
      const purpose: InvoicePurpose = {
        kind: 'INITIAL',
        planId,
        planPriceId,
        seats: order.requestedSeats,
        promotionId: order.promotionId,
      };
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          invoiceNumber: buildInvoiceNumber(paidAt),
          amount: order.totalAmount,
          currency: order.currency,
          issueDate: paidAt,
          dueDate: paidAt,
          status: InvoiceStatus.PAID,
          subtotal: order.subtotalAmount,
          tax: order.taxAmount,
          total: order.totalAmount,
          amountPaid: order.totalAmount,
          amountDue: 0,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          paidAt,
          metadataJson: {
            ...purpose,
            orderNumber: order.orderNumber,
            discountAmount: order.discountAmount.toString(),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.payment.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          amount: order.totalAmount,
          currency: order.currency,
          paymentMethod: 'CARD',
          status: PaymentStatus.SUCCEEDED,
          paymentProvider,
          providerPaymentId,
          paidAt,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { paymentProvider },
      });
    });
  }

  /**
   * An operator refunding a captured payment through its provider. Recorded as
   * a `RefundRequest` either way, so "was this refunded, and who decided" has a
   * row behind it — including when the provider refused.
   */
  async refundPayment(input: {
    paymentId: string;
    reasonCode: RefundReasonCode;
    reason: string;
    platformUserId: string | null;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        id: true,
        tenantId: true,
        invoiceId: true,
        status: true,
        amount: true,
        currency: true,
        paymentProvider: true,
        providerPaymentId: true,
        tenant: { select: { customerAccountId: true } },
      },
    });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND');
    if (
      payment.status !== PaymentStatus.SUCCEEDED ||
      !payment.paymentProvider ||
      !this.gateways.isManaged(payment.paymentProvider) ||
      !payment.providerPaymentId
    ) {
      throw new AppError('BILLING_INVOICE_NOT_PAYABLE', {
        message:
          'Only a captured payment made through a DijiPeople-billed provider can be refunded here.',
      });
    }
    const gateway = this.gateways.require(payment.paymentProvider);
    if (!gateway.refund) {
      throw new AppError('PAYMENT_PROVIDER_NOT_CONFIGURED', {
        message: `${payment.paymentProvider} refunds are made in the provider dashboard.`,
      });
    }

    /*
     * Claim the refund before calling the provider, under a lock per payment:
     * two operators clicking at once must not send two refunds. APPROVED is
     * the in-flight state; a second claimant finds it and is refused.
     * An open REQUESTED row — the one a duplicate payment raised — is reused
     * rather than recording the same refund twice.
     */
    const request = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`billing-refund:${payment.id}`}))`,
      );
      const inFlight = await tx.refundRequest.findFirst({
        where: {
          paymentId: payment.id,
          status: { in: [RefundStatus.APPROVED, RefundStatus.PROCESSED] },
        },
        select: { id: true },
      });
      if (inFlight) {
        throw new AppError('BILLING_INVOICE_NOT_PAYABLE', {
          message: 'A refund for this payment is already in progress or done.',
        });
      }
      const open = await tx.refundRequest.findFirst({
        where: { paymentId: payment.id, status: RefundStatus.REQUESTED },
        select: { id: true },
      });
      return open
        ? tx.refundRequest.update({
            where: { id: open.id },
            data: {
              status: RefundStatus.APPROVED,
              approvedByPlatformUser: input.platformUserId,
              approvedAt: new Date(),
            },
            select: { id: true },
          })
        : tx.refundRequest.create({
            data: {
              tenantId: payment.tenantId,
              customerAccountId: payment.tenant.customerAccountId,
              paymentId: payment.id,
              invoiceId: payment.invoiceId,
              amount: payment.amount,
              currency: payment.currency,
              reasonCode: input.reasonCode,
              reason: input.reason,
              status: RefundStatus.APPROVED,
              requestedByPlatformUser: input.platformUserId,
              approvedByPlatformUser: input.platformUserId,
              approvedAt: new Date(),
            },
            select: { id: true },
          });
    });

    const result = await gateway.refund({
      providerPaymentId: payment.providerPaymentId,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      reason: input.reason,
    });
    const processed = result.status === 'PROCESSED';

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: request.id },
        data: {
          status: processed ? RefundStatus.PROCESSED : RefundStatus.FAILED,
          processedAt: processed ? new Date() : null,
          providerRefundId: result.providerRefundId,
          failureReason: result.failureMessage,
        },
      });
      if (processed) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
      await this.audit.log(
        {
          tenantId: payment.tenantId,
          action: processed ? 'PAYMENT_REFUNDED' : 'PAYMENT_REFUND_FAILED',
          entityType: 'Payment',
          entityId: payment.id,
          sourceModule: 'billing',
          beforeSnapshot: { status: payment.status },
          afterSnapshot: {
            refundRequestId: request.id,
            provider: payment.paymentProvider,
            providerRefundId: result.providerRefundId,
            failureReason: result.failureMessage,
            platformUserId: input.platformUserId,
          },
        },
        tx,
      );
    });

    return {
      refundRequestId: request.id,
      status: processed ? RefundStatus.PROCESSED : RefundStatus.FAILED,
      failureReason: result.failureMessage,
    };
  }

  private async markFailed(
    payment: { id: string; tenantId: string; status: PaymentStatus },
    state: ProviderPaymentState,
    source: SettlementSource,
  ): Promise<PaymentStatus> {
    if (payment.status !== PaymentStatus.PENDING) return payment.status;

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          failureCode: state.failureCode,
          failureMessage: state.failureMessage,
        },
      });
      if (moved.count === 0) return;
      await tx.invoice.updateMany({
        where: {
          payments: { some: { id: payment.id } },
          status: InvoiceStatus.ISSUED,
        },
        data: { status: InvoiceStatus.PAYMENT_FAILED },
      });
      await this.audit.log(
        {
          tenantId: payment.tenantId,
          action: 'PAYMENT_FAILED',
          entityType: 'Payment',
          entityId: payment.id,
          sourceModule: 'billing',
          afterSnapshot: {
            failureCode: state.failureCode,
            providerPaymentId: state.providerPaymentId,
            source,
          },
        },
        tx,
      );
    });
    return PaymentStatus.FAILED;
  }

  private async markRefunded(
    payment: { id: string; tenantId: string; status: PaymentStatus },
    source: SettlementSource,
  ): Promise<PaymentStatus> {
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { not: PaymentStatus.REFUNDED } },
      data: { status: PaymentStatus.REFUNDED },
    });
    await this.audit.log({
      tenantId: payment.tenantId,
      action: 'PAYMENT_REFUNDED_AT_PROVIDER',
      entityType: 'Payment',
      entityId: payment.id,
      sourceModule: 'billing',
      beforeSnapshot: { status: payment.status },
      afterSnapshot: { status: PaymentStatus.REFUNDED, source },
    });
    return PaymentStatus.REFUNDED;
  }

  private async rejectMismatch(
    payment: {
      id: string;
      tenantId: string;
      status: PaymentStatus;
      amount: Prisma.Decimal;
      currency: string;
      paymentProvider: PaymentProvider | null;
    },
    state: ProviderPaymentState,
    mismatch: 'CURRENCY_MISMATCH' | 'AMOUNT_MISMATCH',
    source: SettlementSource,
  ): Promise<PaymentStatus> {
    if (payment.status === PaymentStatus.SUCCEEDED) return payment.status;

    const failureCode = `${payment.paymentProvider}_${mismatch}`;
    await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureCode,
        failureMessage: `Provider confirmed ${state.amount ?? '?'} ${state.currency ?? '?'}; the invoice is ${payment.amount.toString()} ${payment.currency}. Not credited — review and refund.`,
      },
    });
    await this.audit.log({
      tenantId: payment.tenantId,
      action: 'PAYMENT_REJECTED_MISMATCH',
      entityType: 'Payment',
      entityId: payment.id,
      sourceModule: 'billing',
      afterSnapshot: {
        failureCode,
        expected: {
          amount: payment.amount.toString(),
          currency: payment.currency,
        },
        reported: { amount: state.amount, currency: state.currency },
        source,
      },
    });
    await this.recordEvent('BILLING_PAYMENT_MISMATCH', 'CRITICAL', {
      tenantId: payment.tenantId,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        provider: payment.paymentProvider,
        providerPaymentId: state.providerPaymentId,
        mismatch,
        source,
      },
    });
    return PaymentStatus.FAILED;
  }

  /**
   * Credit a verified payment: payment, invoice and subscription move together
   * or not at all.
   */
  private async credit(
    paymentId: string,
    provider: PaymentProvider,
    state: ProviderPaymentState,
    source: SettlementSource,
  ): Promise<void> {
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const won = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: now,
          providerReference: state.providerReference,
          failureCode: null,
          failureMessage: null,
        },
      });
      // Another caller credited it between our read and this write.
      if (won.count === 0) return null;

      /*
       * Serialise every credit against one subscription. Two DIFFERENT
       * payments — a second tracker on the same invoice, or two initial
       * checkouts — each win their own row above; without this lock both
       * would read the invoice as open and the subscription as not yet live,
       * and both would be credited. Everything below is read after the lock.
       */
      const { subscriptionId } = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { subscriptionId: true },
      });
      await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: {
          invoice: true,
          subscription: true,
          tenant: { select: { customerAccountId: true, status: true } },
        },
      });
      const invoice = payment.invoice;
      const purpose = parseInvoicePurpose(invoice?.metadataJson);

      // Claimed conditionally: an invoice already paid or withdrawn by the
      // time this payment arrived is not paid a second time.
      const claimed = invoice
        ? await tx.invoice.updateMany({
            where: { id: invoice.id, status: { in: PAYABLE_INVOICE_STATUSES } },
            data: {
              status: InvoiceStatus.PAID,
              amountPaid: payment.amount,
              amountDue: 0,
              paidAt: now,
            },
          })
        : { count: 0 };
      if (!invoice || claimed.count === 0) {
        await this.raiseRefund(
          tx,
          payment,
          'The invoice was already settled or withdrawn when this payment arrived.',
        );
        return 'DUPLICATE' as const;
      }

      if (!purpose) return 'INVOICE_PAID' as const;

      const result =
        purpose.kind === 'INITIAL'
          ? await this.activate(tx, payment, invoice.id, purpose, provider, now)
          : await this.renew(tx, payment, invoice, purpose, now);

      if (result === 'DUPLICATE') {
        await this.raiseRefund(
          tx,
          payment,
          purpose.kind === 'INITIAL'
            ? 'The subscription was already active from another payment.'
            : 'The subscription was cancelled, or already paid through this period, when this renewal arrived.',
        );
        return result;
      }

      if (payment.tenant.status === TenantStatus.INACTIVE) {
        await tx.tenant.update({
          where: { id: payment.tenantId },
          data: {
            status: TenantStatus.ACTIVE,
            subStatus: 'Activated by payment',
          },
        });
        await tx.customerAccount.update({
          where: { id: payment.tenant.customerAccountId },
          data: { status: CustomerAccountStatus.ACTIVE, subStatus: 'Live' },
        });
      }

      await this.audit.log(
        {
          tenantId: payment.tenantId,
          action:
            result === 'ACTIVATED'
              ? 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT'
              : 'SUBSCRIPTION_RENEWED_BY_PAYMENT',
          entityType: 'Subscription',
          entityId: payment.subscriptionId,
          sourceModule: 'billing',
          beforeSnapshot: {
            status: payment.subscription.status,
            currentPeriodEnd: payment.subscription.currentPeriodEnd,
          },
          afterSnapshot: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            provider,
            providerPaymentId: state.providerPaymentId,
            source,
          },
        },
        tx,
      );
      return result;
    });

    if (outcome) {
      await this.recordEvent(
        outcome === 'DUPLICATE'
          ? 'BILLING_PAYMENT_DUPLICATE'
          : 'BILLING_PAYMENT_CONFIRMED',
        outcome === 'DUPLICATE' ? 'WARNING' : 'INFO',
        {
          entityType: 'Payment',
          entityId: paymentId,
          metadata: {
            provider,
            providerPaymentId: state.providerPaymentId,
            outcome,
            source,
          },
        },
      );
    }
  }

  private async activate(
    tx: PrismaTx,
    payment: {
      id: string;
      subscriptionId: string;
      subscription: {
        status: SubscriptionStatus;
        gracePeriodEndsAt: Date | null;
      };
    },
    invoiceId: string,
    purpose: InvoicePurpose,
    provider: PaymentProvider,
    now: Date,
  ): Promise<'ACTIVATED' | 'DUPLICATE'> {
    if (
      isSubscriptionLive(
        payment.subscription.status,
        payment.subscription.gracePeriodEndsAt,
        now,
      )
    ) {
      return 'DUPLICATE';
    }

    const planPrice = await tx.planPrice.findUniqueOrThrow({
      where: { id: purpose.planPriceId },
    });
    const periodEnd = addBillingInterval(now, planPrice.billingInterval);

    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        planId: purpose.planId,
        planPriceId: planPrice.id,
        billingCycle: planPrice.billingCycle,
        basePrice: planPrice.unitAmount,
        finalPrice: planPrice.unitAmount.mul(
          resolveBillableSeats(planPrice, purpose.seats),
        ),
        currency: planPrice.currency,
        purchasedSeats: purpose.seats,
        status: SubscriptionStatus.ACTIVE,
        paymentProvider: provider,
        startDate: now,
        endDate: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        renewalDate: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        gracePeriodEndsAt: null,
        autoRenew: true,
      },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { periodStart: now, periodEnd },
    });
    // Any other open invoice for this subscription — a superseded checkout, a
    // renewal from before it lapsed — is withdrawn, so paying it later becomes
    // a refund instead of moving the period backwards.
    await tx.invoice.updateMany({
      where: {
        subscriptionId: payment.subscriptionId,
        id: { not: invoiceId },
        status: { in: PAYABLE_INVOICE_STATUSES },
      },
      data: { status: InvoiceStatus.VOIDED, voidedAt: now },
    });

    if (purpose.promotionId) {
      await this.redeemPromotion(
        tx,
        purpose.promotionId,
        payment.subscriptionId,
      );
    }
    return 'ACTIVATED';
  }

  private async renew(
    tx: PrismaTx,
    payment: {
      subscriptionId: string;
      subscription: {
        status: SubscriptionStatus;
        planPriceId: string | null;
        currentPeriodEnd: Date | null;
      };
    },
    invoice: { id: string; periodStart: Date | null; periodEnd: Date | null },
    purpose: InvoicePurpose,
    now: Date,
  ): Promise<'RENEWED' | 'DUPLICATE'> {
    const status = payment.subscription.status;
    if (
      status === SubscriptionStatus.CANCELED ||
      status === SubscriptionStatus.CANCELLED
    ) {
      return 'DUPLICATE';
    }

    const planPrice = await tx.planPrice.findUniqueOrThrow({
      where: { id: purpose.planPriceId },
    });
    const period = renewalPeriod(
      invoice,
      status,
      planPrice.billingInterval,
      now,
    );

    // A renewal never moves the paid-through date backwards. One that would
    // is for a period the subscription already covers — a stale invoice paid
    // after the tenant re-subscribed — and is refunded, not applied.
    const paidThrough = payment.subscription.currentPeriodEnd;
    if (paidThrough && period.end <= paidThrough) {
      return 'DUPLICATE';
    }

    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        planId: purpose.planId,
        planPriceId: planPrice.id,
        purchasedSeats: purpose.seats,
        // Paid ahead of the boundary: the current period keeps its start and
        // the paid-through date moves out.
        currentPeriodStart: period.start > now ? undefined : period.start,
        currentPeriodEnd: period.end,
        renewalDate: period.end,
        gracePeriodEndsAt: null,
        endDate: null,
        // Paying a renewal is a decision to keep the subscription: renewals
        // resume, including after a lapse that had switched them off.
        autoRenew: true,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });

    // A plan change scheduled for this boundary took effect with this
    // payment — the invoice was priced at it. Changes on a subscription
    // DijiPeople bills are applied here, never by the renewal-date sweep.
    await tx.planChangeRequest.updateMany({
      where: {
        subscriptionId: payment.subscriptionId,
        status: PlanChangeStatus.SCHEDULED,
        effectiveAt: { lte: period.start },
        toPlanPriceId: planPrice.id,
      },
      data: { status: PlanChangeStatus.APPLIED, appliedAt: now },
    });
    if (
      period.start.getTime() !== invoice.periodStart?.getTime() ||
      period.end.getTime() !== invoice.periodEnd?.getTime()
    ) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { periodStart: period.start, periodEnd: period.end },
      });
    }
    return 'RENEWED';
  }

  /**
   * Count the redemption now that it has been paid for. Conditional on the
   * cap, so two buyers finishing together cannot both take the last one
   * unnoticed. Checkout already refuses a code whose cap is spoken for by paid
   * and in-flight payments; a payment that still lands over the cap has been
   * charged the discounted price, so it is honoured and flagged, not reversed.
   */
  private async redeemPromotion(
    tx: PrismaTx,
    promotionId: string,
    subscriptionId: string,
  ) {
    const counted = await tx.$executeRaw`
      UPDATE "Promotion"
         SET "redemptionCount" = "redemptionCount" + 1, "updatedAt" = NOW()
       WHERE "id" = ${promotionId}
         AND ("maximumRedemptions" IS NULL OR "redemptionCount" < "maximumRedemptions")`;

    if (counted === 0) {
      const overCap = await tx.$executeRaw`
        UPDATE "Promotion"
           SET "redemptionCount" = "redemptionCount" + 1, "updatedAt" = NOW()
         WHERE "id" = ${promotionId}`;
      if (overCap === 0) return;
      this.logger.warn(
        JSON.stringify({
          event: 'billing.promotion.over_redeemed',
          promotionId,
          subscriptionId,
        }),
      );
    }

    await tx.subscriptionPromotion.upsert({
      where: { subscriptionId_promotionId: { subscriptionId, promotionId } },
      create: { subscriptionId, promotionId },
      update: { isActive: true, removedAt: null },
    });
  }

  private async raiseOrderDuplicate(
    order: {
      id: string;
      orderNumber: string;
      customerAccountId: string;
      paymentProvider: PaymentProvider | null;
    },
    tracker: string,
    source: SettlementSource,
  ) {
    if (!order.paymentProvider) return;
    const state = await this.gateways
      .get(order.paymentProvider)
      .fetchPayment(tracker);
    if (state.status !== 'PAID' || !state.amount || !state.currency) return;

    // One request per tracker, however many deliveries report it.
    const reason = `Second payment ${tracker} for order ${order.orderNumber}, already paid through another checkout.`;
    const existing = await this.prisma.refundRequest.findFirst({
      where: { customerAccountId: order.customerAccountId, reason },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.refundRequest.create({
      data: {
        customerAccountId: order.customerAccountId,
        amount: new Prisma.Decimal(state.amount),
        currency: state.currency,
        reasonCode: RefundReasonCode.DUPLICATE_PAYMENT,
        reason,
        status: RefundStatus.REQUESTED,
      },
    });
    await this.recordEvent('BILLING_PAYMENT_DUPLICATE', 'CRITICAL', {
      customerAccountId: order.customerAccountId,
      entityType: 'SubscriptionOrder',
      entityId: order.id,
      metadata: {
        provider: order.paymentProvider,
        providerPaymentId: tracker,
        amount: state.amount,
        currency: state.currency,
        source,
      },
    });
  }

  private async raiseRefund(
    tx: PrismaTx,
    payment: {
      id: string;
      tenantId: string;
      invoiceId: string | null;
      amount: Prisma.Decimal;
      currency: string;
      tenant: { customerAccountId: string };
    },
    reason: string,
  ) {
    await tx.refundRequest.create({
      data: {
        tenantId: payment.tenantId,
        customerAccountId: payment.tenant.customerAccountId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        currency: payment.currency,
        reasonCode: RefundReasonCode.DUPLICATE_PAYMENT,
        reason,
        status: RefundStatus.REQUESTED,
      },
    });
  }

  private async recordEvent(
    eventCode: string,
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
    input: {
      tenantId?: string;
      customerAccountId?: string;
      entityType: string;
      entityId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.platformEvents?.record({
      eventCode,
      source: PlatformEventSource.INTEGRATION,
      result:
        severity === 'INFO'
          ? PlatformEventResult.SUCCEEDED
          : PlatformEventResult.FAILED,
      severity,
      tenantId: input.tenantId ?? null,
      customerAccountId: input.customerAccountId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    });
  }
}

/**
 * Invoice numbers are unique per tenant; a random suffix keeps two invoices
 * issued the same day from colliding without a counter to contend on.
 */
export function buildInvoiceNumber(date: Date): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
