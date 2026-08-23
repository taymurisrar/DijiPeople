import {
  BillingInterval,
  BillingModel,
  StripeEnvironment,
  StripeSyncStatus,
} from '@prisma/client';

export type SeatPriceContract = {
  billingModel: BillingModel;
  billingInterval: BillingInterval;
  unitAmount: number;
  currency: string;
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
};

export type CheckoutPriceContract = SeatPriceContract & {
  isActive: boolean;
  effectiveFrom: Date;
  stripeProductId: string | null;
  stripePriceId: string | null;
  stripeEnvironment: StripeEnvironment | null;
  stripeSyncStatus: StripeSyncStatus;
  stripeActive: boolean;
  stripeUsageType: string | null;
  stripeRecurringInterval: string | null;
  stripeVerifiedAt: Date | null;
};

export function normalizePurchasedSeats(
  requested: number,
  price: Pick<SeatPriceContract, 'minimumSeats' | 'maximumSeats'>,
) {
  if (!Number.isInteger(requested) || requested < price.minimumSeats) {
    throw new Error(`Seat quantity must be at least ${price.minimumSeats}.`);
  }
  if (price.maximumSeats !== null && requested > price.maximumSeats) {
    throw new Error(`Seat quantity cannot exceed ${price.maximumSeats}.`);
  }
  return requested;
}

/**
 * How many units of `unitAmount` a seat count actually bills.
 *
 * The rule differs by billing model, and the difference is not cosmetic:
 *
 * - `PER_SEAT` — `unitAmount` is the price of one seat, so the buyer pays for
 *   each seat the price does not already include.
 * - `FLAT` — `unitAmount` is the price of the *subscription*, and
 *   `includedSeats` says what that single fee covers. It is a capacity
 *   statement, not a discount, so the answer is always one.
 *
 * This function exists because that rule was written twice and the two copies
 * disagreed. `calculateSeatPricing` had it right; `SubscriptionOrderService`
 * applied the per-seat arithmetic to every model, so a FLAT plan bought at or
 * below its included capacity computed `25 - 25 = 0` billable units and wrote a
 * **zero-total order** — while Stripe, quoted the flat price directly, charged
 * the full amount. A paid order recording no revenue is not a rounding error;
 * it is the billing record disagreeing with the money that moved.
 *
 * Above capacity the same arithmetic was wrong in the other direction: 30 seats
 * on a 25-seat flat plan billed `unitAmount × 5`. Exceeding included capacity
 * is overage, which has its own rate and is not modelled by multiplying the
 * subscription fee.
 */
export function resolveBillableSeats(
  price: Pick<SeatPriceContract, 'billingModel' | 'includedSeats'>,
  seats: number,
): number {
  if (price.billingModel !== BillingModel.PER_SEAT) return 1;
  return Math.max(0, seats - price.includedSeats);
}

export function calculateSeatPricing(
  price: SeatPriceContract,
  purchasedSeats: number,
  usedSeats = 0,
) {
  const normalizedSeats = normalizePurchasedSeats(purchasedSeats, price);
  const normalizedUsedSeats = Math.max(0, Math.trunc(usedSeats));
  const billableSeats = resolveBillableSeats(price, normalizedSeats);

  return {
    purchasedSeats: normalizedSeats,
    usedSeats: normalizedUsedSeats,
    availableSeats: Math.max(normalizedSeats - normalizedUsedSeats, 0),
    includedSeats: price.includedSeats,
    billableSeats,
    pricePerSeat:
      price.billingModel === BillingModel.PER_SEAT ? price.unitAmount : null,
    estimatedMonthlyCharge:
      price.billingInterval === BillingInterval.MONTH
        ? roundCurrency(price.unitAmount * billableSeats)
        : null,
    currency: price.currency.toUpperCase(),
  };
}

export function deriveCheckoutReadiness(
  price: CheckoutPriceContract,
  expectedEnvironment: StripeEnvironment,
  now = new Date(),
) {
  const reasons: string[] = [];
  if (!price.isActive) reasons.push('Price is inactive.');
  if (price.effectiveFrom > now) reasons.push('Price is not effective yet.');
  if (price.unitAmount <= 0) reasons.push('Amount must be greater than zero.');
  if (!price.currency.trim()) reasons.push('Currency is required.');
  if (![BillingModel.PER_SEAT, BillingModel.FLAT].includes(price.billingModel))
    reasons.push('Billing model is not supported for checkout.');
  if (!price.stripeProductId) reasons.push('Stripe Product ID is missing.');
  if (!price.stripePriceId) reasons.push('Stripe Price ID is missing.');
  if (price.stripeEnvironment !== expectedEnvironment)
    reasons.push('Stripe environment does not match.');
  if (price.stripeSyncStatus !== StripeSyncStatus.SYNCED)
    reasons.push('Stripe verification has not succeeded.');
  if (!price.stripeActive) reasons.push('Stripe Price is inactive.');
  if (price.stripeUsageType !== 'licensed')
    reasons.push('Stripe usage type must be licensed.');
  const expectedInterval =
    price.billingInterval === BillingInterval.YEAR ? 'year' : 'month';
  if (price.stripeRecurringInterval !== expectedInterval)
    reasons.push(`Stripe recurring interval must be ${expectedInterval}.`);
  if (!price.stripeVerifiedAt)
    reasons.push('Stripe Price has not been verified.');

  return { checkoutReady: reasons.length === 0, reasons };
}

export function stripeEnvironmentFromMode(mode: 'test' | 'live') {
  return mode === 'live' ? StripeEnvironment.LIVE : StripeEnvironment.TEST;
}

export function buildRecurringCheckoutLineItem(
  stripePriceId: string,
  purchasedSeats: number,
  billingModel: BillingModel,
) {
  if (!stripePriceId) throw new Error('Stripe Price ID is required.');
  if (!Number.isInteger(purchasedSeats) || purchasedSeats < 1)
    throw new Error('Purchased seat quantity must be a positive integer.');
  return {
    price: stripePriceId,
    quantity: billingModel === BillingModel.PER_SEAT ? purchasedSeats : 1,
  };
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
