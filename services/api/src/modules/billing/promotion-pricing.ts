import {
  BillingInterval,
  BillingModel,
  DiscountType,
  PromotionDuration,
  PromotionScope,
} from '@prisma/client';

export type PromotionTerms = {
  discountType: DiscountType;
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  duration: PromotionDuration;
  durationMonths?: number | null;
};

export function validatePromotionTerms(terms: PromotionTerms) {
  if (terms.discountType === DiscountType.NONE)
    throw new Error('Promotion discount type cannot be NONE.');
  if (
    terms.discountType === DiscountType.PERCENTAGE &&
    (!terms.percentOff || terms.percentOff <= 0 || terms.percentOff > 100)
  )
    throw new Error('Percentage discount must be between 0 and 100.');
  if (
    terms.discountType === DiscountType.FLAT &&
    (!terms.amountOff || terms.amountOff <= 0 || !terms.currency)
  )
    throw new Error('Fixed discounts require an amount and currency.');
  if (
    terms.duration === PromotionDuration.REPEATING &&
    (!terms.durationMonths || terms.durationMonths < 1)
  )
    throw new Error('Repeating discounts require duration months.');
}

export function calculatePromotionPreview(
  input: PromotionTerms & {
    unitAmount: number;
    purchasedSeats: number;
    billingModel: BillingModel;
    billingInterval: BillingInterval;
  },
) {
  validatePromotionTerms(input);
  const quantity =
    input.billingModel === BillingModel.PER_SEAT ? input.purchasedSeats : 1;
  const regularInvoice = round(input.unitAmount * quantity);
  const discount = round(
    input.discountType === DiscountType.PERCENTAGE
      ? regularInvoice * ((input.percentOff ?? 0) / 100)
      : Math.min(input.amountOff ?? 0, regularInvoice),
  );
  return {
    quantity,
    regularInvoice,
    discount,
    firstInvoice: round(regularInvoice - discount),
    afterPromotion: regularInvoice,
    interval: input.billingInterval,
    durationLabel:
      input.duration === PromotionDuration.ONCE
        ? 'First invoice'
        : input.duration === PromotionDuration.FOREVER
          ? 'Every invoice'
          : input.billingInterval === BillingInterval.YEAR
            ? `${input.durationMonths} calendar months; applied to the annual invoice, not monthly instalments`
            : `First ${input.durationMonths} months`,
  };
}

export type PromotionRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'NOT_ELIGIBLE'
  | 'CURRENCY_MISMATCH';

/**
 * Whether a promotion applies to a purchase, and what it takes off.
 *
 * For purchases DijiPeople prices itself — any provider other than Stripe,
 * which applies its own coupons. The provider is told the final amount and
 * never sees the promotion.
 *
 * A fixed discount only applies in its own currency: PKR 5,000 off must never
 * reach a USD invoice as 5,000 dollars. The discount is capped at the subtotal
 * so the amount charged cannot go negative.
 *
 * The redemption cap is checked here against the committed count only; the
 * count is incremented when the payment succeeds, by a conditional update that
 * is the real guard against two buyers taking the last redemption.
 */
export function evaluatePromotion(
  promotion: {
    isActive: boolean;
    discountType: DiscountType;
    percentOff: { toString(): string } | number | null;
    amountOff: { toString(): string } | number | null;
    currency: string | null;
    scope: PromotionScope;
    planId: string | null;
    planPriceId: string | null;
    customerAccountId: string | null;
    startsAt: Date;
    redeemBy: Date | null;
    maximumRedemptions: number | null;
    redemptionCount: number;
  },
  purchase: {
    planId: string;
    planPriceId: string;
    customerAccountId: string | null;
    currency: string;
    subtotal: number;
    now?: Date;
  },
): { ok: true; discount: number } | { ok: false; reason: PromotionRejection } {
  const now = purchase.now ?? new Date();

  if (!promotion.isActive || promotion.discountType === DiscountType.NONE) {
    return { ok: false, reason: 'INACTIVE' };
  }
  if (promotion.startsAt > now) return { ok: false, reason: 'NOT_STARTED' };
  if (promotion.redeemBy && promotion.redeemBy <= now) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (
    promotion.maximumRedemptions !== null &&
    promotion.redemptionCount >= promotion.maximumRedemptions
  ) {
    return { ok: false, reason: 'EXHAUSTED' };
  }

  const eligible =
    promotion.scope === PromotionScope.GLOBAL ||
    (promotion.scope === PromotionScope.PLAN &&
      promotion.planId === purchase.planId) ||
    (promotion.scope === PromotionScope.PRICE &&
      promotion.planPriceId === purchase.planPriceId) ||
    (promotion.scope === PromotionScope.CUSTOMER &&
      promotion.customerAccountId !== null &&
      promotion.customerAccountId === purchase.customerAccountId);
  if (!eligible) return { ok: false, reason: 'NOT_ELIGIBLE' };

  if (promotion.discountType === DiscountType.PERCENTAGE) {
    const percent = Number(promotion.percentOff ?? 0);
    if (!(percent > 0 && percent <= 100)) {
      return { ok: false, reason: 'INACTIVE' };
    }
    return { ok: true, discount: round(purchase.subtotal * (percent / 100)) };
  }

  if (
    !promotion.currency ||
    promotion.currency.trim().toUpperCase() !==
      purchase.currency.trim().toUpperCase()
  ) {
    return { ok: false, reason: 'CURRENCY_MISMATCH' };
  }
  const amountOff = Number(promotion.amountOff ?? 0);
  if (!(amountOff > 0)) return { ok: false, reason: 'INACTIVE' };
  return { ok: true, discount: round(Math.min(amountOff, purchase.subtotal)) };
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
