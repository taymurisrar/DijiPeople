import { BillingModel, CommercialSalesModel } from '@prisma/client';

/**
 * DijiPeople's own price schedule.
 *
 * **Separate from `plans.catalog.ts` because a plan is not a price.** A plan is
 * a set of modules and a name; a price is what one market pays for it, in one
 * currency, on one cycle, under one billing model. The same three plans now
 * carry eighteen prices, and mixing the two in one file is how the previous
 * schedule ended up with a `billingModel` literal buried in the bootstrap that
 * disagreed with the published Terms for three days ([[BUG-0080]]).
 *
 * ## Two models, two channels
 *
 * The public site and self-service checkout sell **per active employee**.
 * Flat-per-plan exists for customers who negotiate it and is reachable only
 * through an operator: those rows carry `salesModel: SALES_ASSISTED`, which
 * `resolveCommercialOffer` refuses on the `SELF_SERVICE` channel.
 *
 * Both models are active for the same plan, market, cycle and currency at once.
 * That is only possible because `billingModel` is part of the active-price
 * uniqueness key — see
 * `20260820140000_planprice_billing_model_uniqueness_and_overage`.
 *
 * ## The one rule that must never be restated
 *
 * **Annual is monthly × 10.** A 16.67% discount; two months free. It is applied
 * here as arithmetic rather than typed out as a second set of numbers, because
 * a schedule that states both is a schedule that can disagree with itself. The
 * spec asserts the relationship rather than the literals — a test that restates
 * the numbers proves only that somebody copied them twice.
 *
 * ## Where the numbers came from
 *
 * Supplied by the owner on 2026-08-20 as a complete schedule, and checked for
 * internal consistency before any of it was written down: every annual figure
 * is exactly ten times its monthly figure, and every stated minimum charge
 * equals `minimumSeats × unitAmount`, across all three currencies.
 */

/** Markets that carry a price schedule, by `Market.code`. */
export const PRICED_MARKET_CODES = ['PK', 'QA', 'INTL'] as const;
export type PricedMarketCode = (typeof PRICED_MARKET_CODES)[number];

export const MARKET_CURRENCY: Record<PricedMarketCode, string> = {
  PK: 'PKR',
  QA: 'QAR',
  INTL: 'USD',
};

/**
 * Per-seat monthly rate, per active employee. This is the public schedule.
 *
 * `minimumSeats` is billed even when the customer has fewer active employees —
 * the commitment, not the headcount, is the floor.
 */
export const PER_SEAT_SCHEDULE: Record<
  string,
  { minimumSeats: number; monthly: Record<PricedMarketCode, number> }
> = {
  starter: { minimumSeats: 10, monthly: { PK: 300, QA: 8, INTL: 2.2 } },
  growth: { minimumSeats: 25, monthly: { PK: 550, QA: 14, INTL: 3.85 } },
  enterprise: { minimumSeats: 50, monthly: { PK: 900, QA: 22, INTL: 6.05 } },
};

/**
 * Flat monthly rate for the whole workspace, with an included headcount and a
 * price for every employee above it.
 *
 * Sales-assisted only. A visitor cannot reach these, and that is deliberate
 * rather than incidental: flat is a premium at the small end (Starter flat is
 * ~60% more than per-seat at 25 employees) and a steep discount at the large
 * end (Enterprise flat is ~69% less than per-seat at 250). Confirmed intended
 * by the owner — flat is an enterprise instrument bought for predictability —
 * but it is exactly the kind of spread that should be quoted by a person.
 */
export const FLAT_SCHEDULE: Record<
  string,
  {
    includedSeats: number;
    monthly: Record<PricedMarketCode, number>;
    overage: Record<PricedMarketCode, number>;
  }
> = {
  starter: {
    includedSeats: 25,
    monthly: { PK: 12_000, QA: 249, INTL: 69 },
    overage: { PK: 350, QA: 9, INTL: 2.5 },
  },
  growth: {
    includedSeats: 100,
    monthly: { PK: 30_000, QA: 599, INTL: 165 },
    overage: { PK: 350, QA: 9, INTL: 2.5 },
  },
  enterprise: {
    includedSeats: 250,
    monthly: { PK: 70_000, QA: 1_399, INTL: 385 },
    overage: { PK: 500, QA: 12, INTL: 3.5 },
  },
};

/**
 * Months paid for under annual billing. Twelve months of service for ten
 * months of money.
 */
export const ANNUAL_MONTHS_CHARGED = 10;

/** The discount that follows from the line above. Derived, never typed twice. */
export const ANNUAL_DISCOUNT_RATE = 1 - ANNUAL_MONTHS_CHARGED / 12;

export type SeededPrice = {
  planKey: string;
  marketCode: PricedMarketCode;
  currency: string;
  billingModel: BillingModel;
  /** MONTHLY or ANNUAL, as the cycle; the interval follows from it. */
  cycle: 'MONTHLY' | 'ANNUAL';
  unitAmount: number;
  minimumSeats: number;
  includedSeats: number;
  overageUnitAmount: number | null;
  salesModel: CommercialSalesModel;
};

/**
 * Round to whole minor units.
 *
 * Prices are `Decimal(12,2)`, and floating-point multiplication of 3.85 by ten
 * gives 38.499999999999996. Storing that would be a real, if tiny, wrong
 * number, and it would surface as a penny difference between the page and the
 * invoice — the class of defect nobody can reproduce.
 */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Every price to seed: 3 plans × 3 markets × 2 cycles × 2 models = 36 rows.
 *
 * Enterprise+ is deliberately absent. It is `CUSTOM_ONLY` and carries no price
 * at all — the offer resolver answers `CUSTOM_CONTRACT_ONLY` for it, which is
 * the honest response to "what does it cost".
 */
export function buildSeededPrices(): SeededPrice[] {
  const prices: SeededPrice[] = [];

  for (const marketCode of PRICED_MARKET_CODES) {
    const currency = MARKET_CURRENCY[marketCode];

    for (const [planKey, seat] of Object.entries(PER_SEAT_SCHEDULE)) {
      const monthly = seat.monthly[marketCode];
      for (const cycle of ['MONTHLY', 'ANNUAL'] as const) {
        prices.push({
          planKey,
          marketCode,
          currency,
          billingModel: BillingModel.PER_SEAT,
          cycle,
          unitAmount: money(
            cycle === 'ANNUAL' ? monthly * ANNUAL_MONTHS_CHARGED : monthly,
          ),
          minimumSeats: seat.minimumSeats,
          includedSeats: 0,
          // Per-seat bills every seat, so "above the included count" does not
          // exist. Null rather than zero: zero would read as "overage is free".
          overageUnitAmount: null,
          salesModel: CommercialSalesModel.SELF_SERVICE,
        });
      }
    }

    for (const [planKey, flat] of Object.entries(FLAT_SCHEDULE)) {
      const monthly = flat.monthly[marketCode];
      const overage = flat.overage[marketCode];
      for (const cycle of ['MONTHLY', 'ANNUAL'] as const) {
        prices.push({
          planKey,
          marketCode,
          currency,
          billingModel: BillingModel.FLAT,
          cycle,
          unitAmount: money(
            cycle === 'ANNUAL' ? monthly * ANNUAL_MONTHS_CHARGED : monthly,
          ),
          minimumSeats: 1,
          includedSeats: flat.includedSeats,
          /*
           * The overage rate stays a MONTHLY figure on an annual price. An
           * extra employee is charged for the month they are extra; it is not
           * a subscription line that should be multiplied by ten.
           */
          overageUnitAmount: money(overage),
          salesModel: CommercialSalesModel.SALES_ASSISTED,
        });
      }
    }
  }

  return prices;
}
