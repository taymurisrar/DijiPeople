import {
  BillingInterval,
  BillingModel,
  DiscountType,
  PromotionDuration,
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

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
