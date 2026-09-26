import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SubscriptionOrderStatus,
  SubscriptionStatus,
  type Market,
  type Plan,
  type PlanPrice,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { resolveBillableSeats } from '../billing-seat-pricing';
import {
  checkoutBlockReason,
  parseInvoicePurpose,
  type InvoicePurpose,
} from '../managed-billing.rules';
import { evaluatePromotion } from '../promotion-pricing';
import type { PaymentGateway } from '../providers/payment-gateway';
import { PaymentGateways } from '../providers/payment-gateways';
import {
  buildInvoiceNumber,
  PaymentSettlementService,
} from './payment-settlement.service';
import { TaxBasisService } from './tax-basis.service';

type PrismaTx = Prisma.TransactionClient;

/**
 * How long a hosted checkout is handed back to a repeated click instead of a
 * new one being opened. Safepay's checkout token lives one hour; half of that
 * leaves the buyer time to finish on the page they were given.
 */
const CHECKOUT_REUSE_WINDOW_MS = 30 * 60 * 1000;

/** A checkout row with no provider page yet is still being opened. */
const CHECKOUT_PREPARING_MS = 60 * 1000;

const PAYABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAYMENT_FAILED,
];

export type ReturnUrls = (paymentId: string) => {
  successUrl: string;
  cancelUrl: string;
};

export type ManagedCheckoutResult = {
  id: string;
  paymentId: string;
  provider: PaymentProvider;
  url: string;
  reused: boolean;
  amount: number;
  currency: string;
};

/**
 * Opens checkouts for payments DijiPeople prices itself and a provider such as
 * Safepay executes.
 *
 * The browser sends a price id, a seat count and optionally a code; every
 * figure charged is computed here — base, discount, tax, total — and the
 * provider is told only the total. An invoice and a PENDING payment exist
 * before the provider is called, so every provider checkout maps back to a
 * tenant, an invoice, a payment and a subscription.
 *
 * Nothing here activates anything. That happens only in
 * `PaymentSettlementService`, on the provider's own confirmation.
 */
@Injectable()
export class ManagedCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGateways,
    private readonly taxBasis: TaxBasisService,
    private readonly settlement: PaymentSettlementService,
    private readonly audit: AuditService,
  ) {}

  async startSubscriptionCheckout(input: {
    tenantId: string;
    userId: string;
    provider: PaymentProvider;
    planPrice: PlanPrice & { plan: Plan; market: Market | null };
    seats: number;
    promotionCode?: string | null;
    returnUrls: ReturnUrls;
  }): Promise<ManagedCheckoutResult> {
    const gateway = this.gateways.require(input.provider);
    const { planPrice } = input;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
        customerAccountId: true,
        customerAccount: { select: { country: true } },
        subscription: { select: { id: true, status: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const blocked = checkoutBlockReason(tenant.subscription?.status);
    if (blocked === 'ALREADY_ACTIVE') {
      throw new ConflictException(
        'This tenant already has an active subscription. Use billing management to change it.',
      );
    }
    if (blocked === 'PAYMENT_OUTSTANDING') {
      throw new ConflictException(
        'This subscription has an unpaid invoice. Pay it from billing history.',
      );
    }

    const subtotal = planPrice.unitAmount.mul(
      resolveBillableSeats(planPrice, input.seats),
    );
    const promotion = input.promotionCode?.trim()
      ? await this.resolvePromotion(input.promotionCode.trim(), {
          planId: planPrice.planId,
          planPriceId: planPrice.id,
          customerAccountId: tenant.customerAccountId,
          currency: planPrice.currency,
          subtotal,
        })
      : null;
    const tax = this.taxBasis.resolve({
      subtotalAmount: subtotal,
      discountAmount: new Prisma.Decimal(promotion?.discount ?? 0),
      currency: planPrice.currency,
      country: tenant.customerAccount.country,
      marketCode: planPrice.market?.code ?? null,
      taxProfileRef: planPrice.market?.taxProfileRef ?? null,
    });
    if (!tax.totalAmount.greaterThan(0)) {
      // A provider cannot take a zero payment, and activating without one
      // would be activation without payment. A full discount is applied by
      // an operator on the subscription instead.
      throw new BadRequestException(
        'This checkout would charge nothing. Contact support to apply a full discount.',
      );
    }

    const purpose: InvoicePurpose = {
      kind: 'INITIAL',
      planId: planPrice.planId,
      planPriceId: planPrice.id,
      seats: input.seats,
      promotionId: promotion?.id ?? null,
    };

    const prepared = await this.prisma.$transaction(async (tx) => {
      // Serialise checkouts per tenant, so a double click cannot open two
      // chargeable provider pages for one subscription.
      await advisoryLock(tx, `billing-checkout:${input.tenantId}`);

      const previous = await tx.payment.findFirst({
        where: {
          tenantId: input.tenantId,
          paymentProvider: input.provider,
          status: PaymentStatus.PENDING,
          createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_WINDOW_MS) },
          invoice: { is: { status: InvoiceStatus.ISSUED } },
        },
        orderBy: { createdAt: 'desc' },
        include: { invoice: true },
      });

      if (previous?.invoice) {
        const previousPurpose = parseInvoicePurpose(
          previous.invoice.metadataJson,
        );
        const same =
          previousPurpose?.kind === 'INITIAL' &&
          previousPurpose.planPriceId === purpose.planPriceId &&
          previousPurpose.seats === purpose.seats &&
          previousPurpose.promotionId === purpose.promotionId &&
          previous.amount.equals(tax.totalAmount);

        if (same && previous.providerCheckoutUrl) {
          return { reused: true as const, payment: previous };
        }
        if (
          same &&
          Date.now() - previous.createdAt.getTime() < CHECKOUT_PREPARING_MS
        ) {
          throw new AppError('BILLING_CHECKOUT_IN_PROGRESS');
        }
        // A different selection supersedes it. The invoice is withdrawn, so a
        // late payment on the old page is caught as a duplicate and refunded
        // rather than activating a plan the buyer moved away from.
        if (previousPurpose?.kind === 'INITIAL') {
          await tx.invoice.update({
            where: { id: previous.invoice.id },
            data: { status: InvoiceStatus.VOIDED, voidedAt: new Date() },
          });
        }
      }

      if (promotion) await this.holdPromotion(tx, promotion.id);

      const subscriptionId =
        tenant.subscription?.id ??
        (
          await tx.subscription.create({
            data: {
              tenantId: input.tenantId,
              planId: planPrice.planId,
              planPriceId: planPrice.id,
              billingCycle: planPrice.billingCycle,
              basePrice: planPrice.unitAmount,
              finalPrice: subtotal,
              currency: planPrice.currency,
              status: SubscriptionStatus.INCOMPLETE,
              startDate: new Date(),
              purchasedSeats: input.seats,
              paymentProvider: input.provider,
              createdById: input.userId,
              updatedById: input.userId,
            },
            select: { id: true },
          })
        ).id;
      if (tenant.subscription) {
        // A lapsed or incomplete subscription — possibly left by an abandoned
        // Stripe checkout — is now billed through this provider; without this
        // its invoice would not be payable here.
        await tx.subscription.update({
          where: { id: tenant.subscription.id },
          data: { paymentProvider: input.provider },
        });
      }

      const created = await this.createInvoiceAndPayment(tx, {
        tenantId: input.tenantId,
        subscriptionId,
        userId: input.userId,
        provider: input.provider,
        currency: planPrice.currency,
        subtotal,
        tax: tax.taxAmount,
        total: tax.totalAmount,
        purpose,
      });
      return { reused: false as const, payment: created };
    });

    if (prepared.reused) {
      return toResult(prepared.payment, input.provider, true);
    }

    return this.openHostedCheckout(
      gateway,
      prepared.payment,
      input.returnUrls,
      input.userId,
    );
  }

  /**
   * Pay an open invoice — a renewal DijiPeople issued, or an initial checkout
   * whose first attempt failed. The amount is the invoice's, never the
   * caller's.
   */
  async startInvoicePayment(input: {
    tenantId: string;
    userId: string;
    invoiceId: string;
    returnUrls: ReturnUrls;
  }): Promise<ManagedCheckoutResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: input.tenantId },
      include: { subscription: { select: { paymentProvider: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    const provider = invoice.subscription.paymentProvider;
    const amount = invoice.amountDue ?? invoice.amount;
    if (
      !provider ||
      !this.gateways.isManaged(provider) ||
      !PAYABLE_INVOICE_STATUSES.includes(invoice.status) ||
      !parseInvoicePurpose(invoice.metadataJson) ||
      !amount.greaterThan(0)
    ) {
      throw new AppError('BILLING_INVOICE_NOT_PAYABLE');
    }
    const gateway = this.gateways.require(provider);

    const prepared = await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `billing-invoice:${invoice.id}`);

      const previous = await tx.payment.findFirst({
        where: {
          invoiceId: invoice.id,
          status: PaymentStatus.PENDING,
          createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (previous?.providerCheckoutUrl && previous.amount.equals(amount)) {
        return { reused: true as const, payment: previous };
      }
      if (
        previous &&
        Date.now() - previous.createdAt.getTime() < CHECKOUT_PREPARING_MS
      ) {
        throw new AppError('BILLING_CHECKOUT_IN_PROGRESS');
      }

      const created = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          amount,
          currency: invoice.currency,
          paymentMethod: PaymentMethod.OTHER,
          status: PaymentStatus.PENDING,
          paymentProvider: provider,
          createdById: input.userId,
          updatedById: input.userId,
        },
      });
      return { reused: false as const, payment: created };
    });

    if (prepared.reused) {
      return toResult(prepared.payment, provider, true);
    }
    return this.openHostedCheckout(
      gateway,
      prepared.payment,
      input.returnUrls,
      input.userId,
    );
  }

  /**
   * The public signup path. No tenant exists before payment (BUG-0077), so the
   * order — already priced server-side by `SubscriptionOrderService` — is what
   * the provider checkout is attached to. Provisioning records the invoice and
   * payment once the tenant exists.
   */
  async startOrderCheckout(input: {
    orderId: string;
    provider: PaymentProvider;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; reused: boolean }> {
    const gateway = this.gateways.require(input.provider);
    const order = await this.prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: input.orderId },
      select: {
        id: true,
        totalAmount: true,
        currency: true,
        paymentProvider: true,
        providerCheckoutUrl: true,
        updatedAt: true,
      },
    });

    if (
      order.paymentProvider === input.provider &&
      order.providerCheckoutUrl &&
      Date.now() - order.updatedAt.getTime() < CHECKOUT_REUSE_WINDOW_MS
    ) {
      return { url: order.providerCheckoutUrl, reused: true };
    }
    if (!order.totalAmount.greaterThan(0)) {
      throw new BadRequestException('This order has nothing to charge.');
    }

    const hosted = await gateway.createCheckout({
      reference: order.id,
      amount: order.totalAmount.toFixed(2),
      currency: order.currency,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    await this.prisma.subscriptionOrder.update({
      where: { id: order.id },
      data: {
        paymentProvider: input.provider,
        providerPaymentId: hosted.providerPaymentId,
        providerCheckoutUrl: hosted.checkoutUrl,
        // Gaining a provider checkout is the transition out of DRAFT, exactly
        // as `attachCheckoutSession` records for a Stripe session.
        status: SubscriptionOrderStatus.PENDING_PAYMENT,
      },
    });
    return { url: hosted.checkoutUrl, reused: false };
  }

  /**
   * The authoritative state of a tenant's payment, for the page a buyer lands
   * on after the provider. A pending payment is re-verified with the provider
   * first, so the answer never depends on whether the webhook has arrived.
   */
  async getTenantPayment(tenantId: string, paymentId: string) {
    const load = () =>
      this.prisma.payment.findFirst({
        where: { id: paymentId, tenantId },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          paymentProvider: true,
          invoiceId: true,
          paidAt: true,
          failureCode: true,
          createdAt: true,
          subscription: {
            select: { status: true, currentPeriodEnd: true },
          },
        },
      });

    let payment = await load();
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND');

    let verificationDelayed = false;
    if (payment.status === PaymentStatus.PENDING) {
      try {
        await this.settlement.settlePayment(payment.id, 'RETURN');
        payment = (await load()) ?? payment;
      } catch {
        // The provider could not be reached. The sweeper and the webhook will
        // still settle it; the buyer is told it is being confirmed.
        verificationDelayed = true;
      }
    }

    return {
      id: payment.id,
      status: payment.status,
      provider: payment.paymentProvider,
      amount: Number(payment.amount),
      currency: payment.currency,
      invoiceId: payment.invoiceId,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      // A category the buyer can act on — never the provider's own wording,
      // which can describe a mismatch meant for an operator.
      failureReason:
        payment.status === PaymentStatus.FAILED
          ? payment.failureCode?.endsWith('_MISMATCH')
            ? 'UNDER_REVIEW'
            : 'NOT_COMPLETED'
          : null,
      verificationDelayed,
      subscription: payment.subscription,
    };
  }

  private async openHostedCheckout(
    gateway: PaymentGateway,
    payment: {
      id: string;
      tenantId: string;
      invoiceId: string | null;
      amount: Prisma.Decimal;
      currency: string;
      paymentProvider: PaymentProvider | null;
    },
    returnUrls: ReturnUrls,
    userId: string,
  ): Promise<ManagedCheckoutResult> {
    let hosted: Awaited<ReturnType<PaymentGateway['createCheckout']>>;
    try {
      hosted = await gateway.createCheckout({
        reference: payment.id,
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        ...returnUrls(payment.id),
      });
    } catch (error) {
      // No provider page exists, so nothing can be paid on this attempt.
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureCode: 'PROVIDER_CHECKOUT_FAILED',
          failureMessage:
            error instanceof Error ? error.message.slice(0, 500) : null,
        },
      });
      throw error;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: hosted.providerPaymentId,
        providerCheckoutUrl: hosted.checkoutUrl,
      },
    });

    await this.audit.log({
      tenantId: payment.tenantId,
      actorUserId: userId,
      action: 'CHECKOUT_STARTED',
      entityType: 'Payment',
      entityId: payment.id,
      sourceModule: 'billing',
      afterSnapshot: {
        provider: gateway.provider,
        providerPaymentId: hosted.providerPaymentId,
        invoiceId: payment.invoiceId,
        amount: payment.amount.toString(),
        currency: payment.currency,
      },
    });

    return toResult(updated, gateway.provider, false);
  }

  private async createInvoiceAndPayment(
    tx: PrismaTx,
    input: {
      tenantId: string;
      subscriptionId: string;
      userId: string;
      provider: PaymentProvider;
      currency: string;
      subtotal: Prisma.Decimal;
      tax: Prisma.Decimal;
      total: Prisma.Decimal;
      purpose: InvoicePurpose;
    },
  ) {
    const now = new Date();
    const invoice = await tx.invoice.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        invoiceNumber: buildInvoiceNumber(now),
        amount: input.total,
        currency: input.currency,
        issueDate: now,
        dueDate: now,
        status: InvoiceStatus.ISSUED,
        subtotal: input.subtotal,
        tax: input.tax,
        total: input.total,
        amountPaid: 0,
        amountDue: input.total,
        metadataJson: input.purpose as unknown as Prisma.InputJsonValue,
        createdById: input.userId,
        updatedById: input.userId,
      },
      select: { id: true },
    });
    return tx.payment.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        invoiceId: invoice.id,
        amount: input.total,
        currency: input.currency,
        paymentMethod: PaymentMethod.OTHER,
        status: PaymentStatus.PENDING,
        paymentProvider: input.provider,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });
  }

  /**
   * Find a code and decide whether it applies. Every refusal is the same error
   * with the reason in `details`, so the buyer is told the code does not apply
   * and support can see why.
   */
  private async resolvePromotion(
    code: string,
    purchase: {
      planId: string;
      planPriceId: string;
      customerAccountId: string;
      currency: string;
      subtotal: Prisma.Decimal;
    },
  ) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!promotion) {
      throw new AppError('BILLING_PROMOTION_INVALID', {
        details: { reason: 'NOT_FOUND' },
      });
    }

    const verdict = evaluatePromotion(promotion, {
      ...purchase,
      subtotal: purchase.subtotal.toNumber(),
    });
    if (!verdict.ok) {
      throw new AppError('BILLING_PROMOTION_INVALID', {
        details: { reason: verdict.reason },
      });
    }
    return {
      id: promotion.id,
      discount: verdict.discount,
    };
  }

  /**
   * Refuse a capped code whose remaining redemptions are already spoken for.
   *
   * The count only moves when a payment succeeds, so "in flight" is counted as
   * well: recent pending payments carrying the code. Taken under a lock per
   * promotion, so two buyers cannot both be told the last redemption is free.
   */
  private async holdPromotion(tx: PrismaTx, promotionId: string) {
    await advisoryLock(tx, `billing-promotion:${promotionId}`);
    const promotion = await tx.promotion.findUniqueOrThrow({
      where: { id: promotionId },
      select: { maximumRedemptions: true, redemptionCount: true },
    });
    if (promotion.maximumRedemptions === null) return;

    const inFlight = await tx.payment.count({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_WINDOW_MS) },
        invoice: {
          is: {
            status: InvoiceStatus.ISSUED,
            metadataJson: { path: ['promotionId'], equals: promotionId },
          },
        },
      },
    });
    if (promotion.redemptionCount + inFlight >= promotion.maximumRedemptions) {
      throw new AppError('BILLING_PROMOTION_INVALID', {
        details: { reason: 'EXHAUSTED' },
      });
    }
  }
}

async function advisoryLock(tx: PrismaTx, key: string) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`,
  );
}

function toResult(
  payment: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    providerCheckoutUrl: string | null;
  },
  provider: PaymentProvider,
  reused: boolean,
): ManagedCheckoutResult {
  if (!payment.providerCheckoutUrl) {
    throw new AppError('BILLING_CHECKOUT_IN_PROGRESS');
  }
  return {
    id: payment.id,
    paymentId: payment.id,
    provider,
    url: payment.providerCheckoutUrl,
    reused,
    amount: Number(payment.amount),
    currency: payment.currency,
  };
}
