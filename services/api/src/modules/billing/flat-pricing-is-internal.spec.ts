import {
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
  MarketLaunchStatus,
} from '@prisma/client';

import {
  narrowestSalesModel,
  resolveCommercialOffer,
} from './commercial-offer.resolver';
import { buildSeededPrices } from '../super-admin/pricing.catalog';

/**
 * REG — flat pricing is internal. Per-seat is what the public buys.
 *
 * The commercial rule, stated by the owner: the website, the plans page and
 * self-service checkout show per-seat prices only, monthly and annual. Flat
 * pricing exists for customers onboarded by hand, where somebody decides a flat
 * rate suits them, and must never be quoted to a visitor.
 *
 * The mechanism is `salesModel` on the price row, not a filter on
 * `billingModel` in the public config. That matters: the offer resolver already
 * narrows candidates by channel *before* selecting one, so a `SALES_ASSISTED`
 * row is invisible to a self-service visitor no matter what its dates say.
 * Adding a second, `billingModel`-shaped rule in the config service would be a
 * competing source of truth for the same decision.
 *
 * What was missing was the guarantee that flat rows actually carry that sales
 * model. `PlanPrice.salesModel` defaults to `SELF_SERVICE` in the schema, and
 * `createPlanPrice` never set it — so a flat price authored in Platform Admin
 * was born publicly sellable and competed for the same currency-and-interval
 * slot as the per-seat price the visitor was meant to see. Which one won came
 * down to effective date.
 *
 * Two halves, both asserted here: the catalog seeds it right, and the resolver
 * refuses it even when it is wrong.
 */
describe('flat pricing is internal', () => {
  const plan = {
    id: 'plan-1',
    key: 'growth',
    salesModel: CommercialSalesModel.SELF_SERVICE,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    isActive: true,
    isPublic: true,
  };
  const market = {
    id: 'market-1',
    code: 'QA',
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    launchStatus: MarketLaunchStatus.LAUNCHED,
    isEnabled: true,
    selfServiceEnabled: true,
    defaultCurrency: 'QAR',
    supportedCurrencies: ['QAR', 'USD'],
  };
  const effectiveAt = new Date('2026-08-24T00:00:00.000Z');

  function price(overrides: Record<string, unknown>) {
    return {
      id: 'price-flat',
      planId: 'plan-1',
      marketId: 'market-1',
      currency: 'QAR',
      billingInterval: BillingInterval.MONTH,
      billingModel: BillingModel.FLAT,
      salesModel: CommercialSalesModel.SALES_ASSISTED,
      publicationStatus: CommercialPublicationStatus.PUBLISHED,
      unitAmount: 599,
      minimumSeats: 1,
      maximumSeats: null,
      includedSeats: 100,
      overageUnitAmount: null,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
      ...overrides,
    } as never;
  }

  const perSeat = price({
    id: 'price-seat',
    billingModel: BillingModel.PER_SEAT,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    unitAmount: 14,
    minimumSeats: 25,
    includedSeats: 0,
  });

  it('never quotes a flat price to a self-service visitor', () => {
    const result = resolveCommercialOffer({
      plan,
      market,
      prices: [price({})],
      currency: 'QAR',
      billingInterval: BillingInterval.MONTH,
      quantity: 25,
      effectiveAt,
      channel: 'SELF_SERVICE',
    } as never);

    /*
     * The reason, not just the outcome. An unpublished plan, an unlaunched
     * market or a typo in the fixture all produce `available: false`, so
     * asserting the boolean alone would pass while proving nothing — which is
     * exactly what this test did until the fixture was corrected.
     */
    expect(result.available).toBe(false);
    expect(result.reason).toBe('SALES_ASSISTED_ONLY');
  });

  it('picks the per-seat price when both models are live in the same slot', () => {
    /*
     * The real production shape: a plan carries both schedules for the same
     * currency and interval. The public answer must be the per-seat one, and
     * must not depend on which row was written last.
     */
    const flatWrittenLater = price({
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    });

    const result = resolveCommercialOffer({
      plan,
      market,
      prices: [flatWrittenLater, perSeat],
      currency: 'QAR',
      billingInterval: BillingInterval.MONTH,
      quantity: 25,
      effectiveAt,
      channel: 'SELF_SERVICE',
    } as never);

    expect(result.available).toBe(true);
    expect(result.billingModel).toBe(BillingModel.PER_SEAT);
    expect(result.unitAmount).toBe(14);
  });

  it('the catalog marks every flat price sales-assisted and every per-seat price self-service', () => {
    /*
     * The seeded half of the guarantee. If this ever inverts, the resolver
     * above starts quoting flat prices publicly and every other test still
     * passes.
     */
    const definitions = buildSeededPrices();
    expect(definitions.length).toBeGreaterThan(0);

    for (const definition of definitions) {
      expect({
        plan: definition.planKey,
        currency: definition.currency,
        cycle: definition.cycle,
        billingModel: definition.billingModel,
        salesModel: definition.salesModel,
      }).toEqual({
        plan: definition.planKey,
        currency: definition.currency,
        cycle: definition.cycle,
        billingModel: definition.billingModel,
        salesModel:
          definition.billingModel === BillingModel.FLAT
            ? CommercialSalesModel.SALES_ASSISTED
            : CommercialSalesModel.SELF_SERVICE,
      });
    }
  });
});

/*
 * The second endpoint, added after BUG-1369.
 *
 * The rule above was enforced in `resolveCommercialOffer`, which serves
 * `/public/commercial-config`. `/public/plans` is a *different* endpoint over
 * the same rows, and it filtered on `isActive` alone — so it published the
 * SALES_ASSISTED flat prices to anonymous callers and computed `checkoutReady`
 * for them. The subscribe wizard reads that endpoint, found two candidates for
 * one currency and interval, and quoted the internal one: QAR 249 flat against
 * an advertised QAR 8 per active employee.
 *
 * One rule, two readers, and only one of them applied it. These assert the
 * filter directly, over the same `narrowestSalesModel` the resolver uses, so
 * the two cannot drift apart again.
 */
describe('the public plans endpoint applies the same channel rule', () => {
  const sellable = (
    planSalesModel: CommercialSalesModel,
    priceSalesModel: CommercialSalesModel,
  ) =>
    narrowestSalesModel(planSalesModel, priceSalesModel) ===
    CommercialSalesModel.SELF_SERVICE;

  it('excludes a sales-assisted flat price from a self-service plan', () => {
    expect(
      sellable(
        CommercialSalesModel.SELF_SERVICE,
        CommercialSalesModel.SALES_ASSISTED,
      ),
    ).toBe(false);
  });

  it('includes the per-seat price the visitor is meant to see', () => {
    expect(
      sellable(
        CommercialSalesModel.SELF_SERVICE,
        CommercialSalesModel.SELF_SERVICE,
      ),
    ).toBe(true);
  });

  // The plan's model narrows the price's and never widens it — a CUSTOM_ONLY
  // plan stays out of public sale even where a price row says SELF_SERVICE.
  it('excludes every price of a custom-only plan', () => {
    for (const priceModel of [
      CommercialSalesModel.SELF_SERVICE,
      CommercialSalesModel.SALES_ASSISTED,
      CommercialSalesModel.CUSTOM_ONLY,
    ]) {
      expect(sellable(CommercialSalesModel.CUSTOM_ONLY, priceModel)).toBe(
        false,
      );
    }
  });

  it('excludes every price of a sales-assisted plan', () => {
    expect(
      sellable(
        CommercialSalesModel.SALES_ASSISTED,
        CommercialSalesModel.SELF_SERVICE,
      ),
    ).toBe(false);
  });
});
