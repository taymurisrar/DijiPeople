import {
  BillingInterval,
  DiscountType,
  Prisma,
  PromotionDuration,
  SubscriptionStatus,
} from '@prisma/client';

/*
 * The rules of DijiPeople-billed subscriptions — those a provider other than
 * Stripe collects. Pure functions, so every transition is testable without a
 * database and the state machine is written down in one place:
 *
 *   (none) ──checkout──▶ INCOMPLETE ──verified payment──▶ ACTIVE
 *   ACTIVE ──period ends, renewal paid in advance──▶ ACTIVE (next period)
 *   ACTIVE ──period ends, cancelAtPeriodEnd──▶ CANCELED
 *   ACTIVE ──period ends, renewal unpaid──▶ PAST_DUE (+ grace; still live)
 *   PAST_DUE ──renewal paid──▶ ACTIVE
 *   PAST_DUE ──grace ends──▶ EXPIRED (not live)
 *   EXPIRED ──renewal paid──▶ ACTIVE (new period from the payment)
 *
 * Nothing here reads a provider's status. The provider says whether money
 * moved; these rules say what that means for access.
 */

export type InvoicePurpose = {
  /** INITIAL starts or restarts a subscription; RENEWAL extends one. */
  kind: 'INITIAL' | 'RENEWAL';
  planId: string;
  planPriceId: string;
  seats: number;
  promotionId: string | null;
};

/** The purchase an invoice settles, as written when it was issued. */
export function parseInvoicePurpose(
  value: Prisma.JsonValue | null | undefined,
): InvoicePurpose | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'INITIAL' && record.kind !== 'RENEWAL') return null;
  if (typeof record.planId !== 'string') return null;
  if (typeof record.planPriceId !== 'string') return null;
  if (typeof record.seats !== 'number' || !Number.isInteger(record.seats)) {
    return null;
  }
  return {
    kind: record.kind,
    planId: record.planId,
    planPriceId: record.planPriceId,
    seats: record.seats,
    promotionId:
      typeof record.promotionId === 'string' ? record.promotionId : null,
  };
}

/**
 * One billing interval after `start`, in UTC. A month is a calendar month, and
 * a day that does not exist in the target month clamps to its last day, so a
 * period starting 31 January ends 28 or 29 February rather than 3 March.
 */
export function addBillingInterval(
  start: Date,
  interval: BillingInterval,
): Date {
  const months = interval === BillingInterval.YEAR ? 12 : 1;
  const result = new Date(start.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Why a provider-confirmed payment cannot settle the invoice it names, or null
 * when it can. Compared in minor units so `25000` and `"25000.00"` agree.
 */
export function settlementMismatch(
  expected: { amount: Prisma.Decimal | string; currency: string },
  reported: { amount: string | null; currency: string | null },
): 'CURRENCY_MISMATCH' | 'AMOUNT_MISMATCH' | null {
  if (
    !reported.currency ||
    reported.currency.trim().toUpperCase() !==
      expected.currency.trim().toUpperCase()
  ) {
    return 'CURRENCY_MISMATCH';
  }
  if (
    reported.amount === null ||
    !new Prisma.Decimal(reported.amount).equals(
      new Prisma.Decimal(expected.amount.toString()),
    )
  ) {
    return 'AMOUNT_MISMATCH';
  }
  return null;
}

/**
 * Whether a tenant may open a new subscription checkout. The same rule the
 * Stripe path applies in `BillingService.resolveCheckoutState`: a live
 * subscription changes plan through plan changes, and one in arrears pays its
 * invoice rather than buying a second subscription.
 */
export function checkoutBlockReason(
  status: SubscriptionStatus | null | undefined,
): 'ALREADY_ACTIVE' | 'PAYMENT_OUTSTANDING' | null {
  if (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING
  ) {
    return 'ALREADY_ACTIVE';
  }
  if (
    status === SubscriptionStatus.PAST_DUE ||
    status === SubscriptionStatus.UNPAID
  ) {
    return 'PAYMENT_OUTSTANDING';
  }
  return null;
}

/**
 * The transition a DijiPeople-billed subscription takes when the clock passes
 * one of its boundaries, or null when none is due.
 */
export function periodBoundaryTransition(
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    gracePeriodEndsAt: Date | null;
  },
  now: Date,
  graceDays: number,
):
  | { status: typeof SubscriptionStatus.CANCELED; endDate: Date }
  | { status: typeof SubscriptionStatus.PAST_DUE; gracePeriodEndsAt: Date }
  | { status: typeof SubscriptionStatus.EXPIRED; endDate: Date }
  | null {
  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd <= now
  ) {
    if (subscription.cancelAtPeriodEnd) {
      return {
        status: SubscriptionStatus.CANCELED,
        endDate: subscription.currentPeriodEnd,
      };
    }
    return {
      status: SubscriptionStatus.PAST_DUE,
      gracePeriodEndsAt: addDays(subscription.currentPeriodEnd, graceDays),
    };
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.gracePeriodEndsAt &&
    subscription.gracePeriodEndsAt <= now
  ) {
    return {
      status: SubscriptionStatus.EXPIRED,
      endDate: subscription.gracePeriodEndsAt,
    };
  }

  return null;
}

/**
 * The period a paid renewal buys. Normally the one printed on the invoice; if
 * the subscription lapsed before the customer paid, the paid period starts at
 * the payment instead, so a late payer is not sold days that already passed.
 */
export function renewalPeriod(
  invoice: { periodStart: Date | null; periodEnd: Date | null },
  subscriptionStatus: SubscriptionStatus,
  interval: BillingInterval,
  paidAt: Date,
): { start: Date; end: Date } {
  if (
    subscriptionStatus !== SubscriptionStatus.EXPIRED &&
    invoice.periodStart &&
    invoice.periodEnd
  ) {
    return { start: invoice.periodStart, end: invoice.periodEnd };
  }
  return { start: paidAt, end: addBillingInterval(paidAt, interval) };
}

/**
 * What an already-redeemed promotion takes off a renewal. `ONCE` is the first
 * payment only; `REPEATING` lasts `durationMonths` from when it was applied;
 * `FOREVER` lasts as long as the subscription. A fixed discount applies only
 * in its own currency, and never below zero.
 */
export function renewalDiscount(
  promotion: {
    discountType: DiscountType;
    percentOff: { toString(): string } | number | null;
    amountOff: { toString(): string } | number | null;
    currency: string | null;
    duration: PromotionDuration;
    durationMonths: number | null;
  },
  appliedAt: Date,
  periodStart: Date,
  subtotal: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  const zero = new Prisma.Decimal(0);
  if (promotion.duration === PromotionDuration.ONCE) return zero;
  if (promotion.duration === PromotionDuration.REPEATING) {
    let endsAt = appliedAt;
    for (let month = 0; month < (promotion.durationMonths ?? 0); month += 1) {
      endsAt = addBillingInterval(endsAt, BillingInterval.MONTH);
    }
    if (periodStart >= endsAt) return zero;
  }

  if (promotion.discountType === DiscountType.PERCENTAGE) {
    const percent = new Prisma.Decimal((promotion.percentOff ?? 0).toString());
    return subtotal.mul(percent).div(100).toDecimalPlaces(2);
  }
  if (
    promotion.discountType === DiscountType.FLAT &&
    promotion.currency?.trim().toUpperCase() === currency.trim().toUpperCase()
  ) {
    const amountOff = new Prisma.Decimal((promotion.amountOff ?? 0).toString());
    return Prisma.Decimal.min(amountOff, subtotal);
  }
  return zero;
}
