import { BillingModel, CommercialSalesModel } from '@prisma/client';
import {
  ANNUAL_DISCOUNT_RATE,
  ANNUAL_MONTHS_CHARGED,
  FLAT_SCHEDULE,
  PER_SEAT_SCHEDULE,
  PRICED_MARKET_CODES,
  buildSeededPrices,
  type PricedMarketCode,
} from './pricing.catalog';

/**
 * The price schedule, checked as arithmetic rather than as a second copy of the
 * numbers.
 *
 * A test that restates 12,000 and 120,000 and asserts they match the catalog
 * proves only that somebody typed the same figures twice — and it fails for the
 * same reason the catalog would be wrong, which is no protection at all. So the
 * relationships are asserted instead: annual is monthly times ten, a minimum
 * charge is the seat rate times the commitment, and every market carries a
 * complete set.
 *
 * The exception is the block at the end, which does check literals — against
 * the *derived* minimum charges the owner published separately. Those are an
 * independent statement of the same fact, so agreement between them is real
 * evidence rather than a tautology.
 */
describe('price schedule', () => {
  const prices = buildSeededPrices();

  it('covers every plan, market, cycle and model', () => {
    // 3 plans x 3 markets x 2 cycles x 2 models.
    expect(prices).toHaveLength(36);

    for (const marketCode of PRICED_MARKET_CODES) {
      for (const planKey of Object.keys(PER_SEAT_SCHEDULE)) {
        for (const model of [BillingModel.PER_SEAT, BillingModel.FLAT]) {
          for (const cycle of ['MONTHLY', 'ANNUAL'] as const) {
            const match = prices.filter(
              (p) =>
                p.marketCode === marketCode &&
                p.planKey === planKey &&
                p.billingModel === model &&
                p.cycle === cycle,
            );
            // Exactly one: a duplicate would violate the active-price index at
            // seed time, which is a failure nobody sees until deployment.
            expect(match).toHaveLength(1);
          }
        }
      }
    }
  });

  it('charges ten months for a year, in every currency and both models', () => {
    for (const monthly of prices.filter((p) => p.cycle === 'MONTHLY')) {
      const annual = prices.find(
        (p) =>
          p.cycle === 'ANNUAL' &&
          p.planKey === monthly.planKey &&
          p.marketCode === monthly.marketCode &&
          p.billingModel === monthly.billingModel,
      );
      expect(annual).toBeDefined();
      expect(annual!.unitAmount).toBeCloseTo(
        monthly.unitAmount * ANNUAL_MONTHS_CHARGED,
        2,
      );
    }
  });

  it('states a discount that follows from the months charged', () => {
    // Derived, not typed. If someone changes ANNUAL_MONTHS_CHARGED to 11 the
    // advertised discount moves with it rather than silently becoming a lie.
    expect(ANNUAL_DISCOUNT_RATE).toBeCloseTo(0.1667, 4);
  });

  it('bills every seat on a per-seat price, so overage cannot apply', () => {
    for (const price of prices.filter(
      (p) => p.billingModel === BillingModel.PER_SEAT,
    )) {
      expect(price.includedSeats).toBe(0);
      // Null, not zero. Zero would read as "extra employees are free".
      expect(price.overageUnitAmount).toBeNull();
      expect(price.minimumSeats).toBeGreaterThan(1);
    }
  });

  it('gives every flat price an included headcount and a rate above it', () => {
    for (const price of prices.filter(
      (p) => p.billingModel === BillingModel.FLAT,
    )) {
      expect(price.includedSeats).toBeGreaterThan(0);
      expect(price.overageUnitAmount).not.toBeNull();
      expect(price.overageUnitAmount!).toBeGreaterThan(0);
    }
  });

  /*
   * The channel separation, asserted at its source. The resolver enforces it,
   * but if the catalog ever marks a flat price SELF_SERVICE the resolver will
   * dutifully sell it, so the invariant belongs here too.
   */
  it('keeps per-seat self-service and flat sales-assisted, without exception', () => {
    for (const price of prices) {
      expect(price.salesModel).toBe(
        price.billingModel === BillingModel.PER_SEAT
          ? CommercialSalesModel.SELF_SERVICE
          : CommercialSalesModel.SALES_ASSISTED,
      );
    }
  });

  it('keeps an overage rate monthly even on an annual price', () => {
    for (const planKey of Object.keys(FLAT_SCHEDULE)) {
      for (const marketCode of PRICED_MARKET_CODES) {
        const monthly = prices.find(
          (p) =>
            p.planKey === planKey &&
            p.marketCode === marketCode &&
            p.billingModel === BillingModel.FLAT &&
            p.cycle === 'MONTHLY',
        )!;
        const annual = prices.find(
          (p) =>
            p.planKey === planKey &&
            p.marketCode === marketCode &&
            p.billingModel === BillingModel.FLAT &&
            p.cycle === 'ANNUAL',
        )!;
        // An extra employee is charged for the month they are extra. Scaling
        // this by ten alongside the subscription would bill a year for a month.
        expect(annual.overageUnitAmount).toBe(monthly.overageUnitAmount);
      }
    }
  });

  it('rounds to whole minor units', () => {
    for (const price of prices) {
      expect(price.unitAmount).toBeCloseTo(
        Math.round(price.unitAmount * 100) / 100,
        10,
      );
    }
  });

  /*
   * Independent corroboration.
   *
   * The owner published a minimum-charge table separately from the seat rates.
   * It is the same fact stated twice by a human, so checking the catalog
   * against it is real evidence — unlike restating the seat rates themselves.
   */
  describe('minimum charges match the separately published table', () => {
    const publishedMonthlyMinimum: Record<
      string,
      Record<PricedMarketCode, number>
    > = {
      starter: { PK: 3_000, QA: 80, INTL: 22 },
      growth: { PK: 13_750, QA: 350, INTL: 96.25 },
      enterprise: { PK: 45_000, QA: 1_100, INTL: 302.5 },
    };
    const publishedAnnualMinimum: Record<
      string,
      Record<PricedMarketCode, number>
    > = {
      starter: { PK: 30_000, QA: 800, INTL: 220 },
      growth: { PK: 137_500, QA: 3_500, INTL: 962.5 },
      enterprise: { PK: 450_000, QA: 11_000, INTL: 3_025 },
    };

    it.each(Object.keys(PER_SEAT_SCHEDULE))('%s', (planKey) => {
      for (const marketCode of PRICED_MARKET_CODES) {
        const seat = PER_SEAT_SCHEDULE[planKey];
        const monthly = prices.find(
          (p) =>
            p.planKey === planKey &&
            p.marketCode === marketCode &&
            p.billingModel === BillingModel.PER_SEAT &&
            p.cycle === 'MONTHLY',
        )!;
        const annual = prices.find(
          (p) =>
            p.planKey === planKey &&
            p.marketCode === marketCode &&
            p.billingModel === BillingModel.PER_SEAT &&
            p.cycle === 'ANNUAL',
        )!;

        expect(monthly.unitAmount * seat.minimumSeats).toBeCloseTo(
          publishedMonthlyMinimum[planKey][marketCode],
          2,
        );
        expect(annual.unitAmount * seat.minimumSeats).toBeCloseTo(
          publishedAnnualMinimum[planKey][marketCode],
          2,
        );
      }
    });
  });
});
