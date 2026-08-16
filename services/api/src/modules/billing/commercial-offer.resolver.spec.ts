import {
  BillingInterval,
  CommercialPublicationStatus,
  CommercialSalesModel,
  MarketLaunchStatus,
} from '@prisma/client';
import {
  isPublicSafeReason,
  narrowestSalesModel,
  resolveCommercialOffer,
  selectEffectivePrice,
  type ResolvableMarket,
  type ResolvablePlan,
  type ResolvablePrice,
} from './commercial-offer.resolver';

const NOW = new Date('2026-08-16T00:00:00.000Z');

function plan(overrides: Partial<ResolvablePlan> = {}): ResolvablePlan {
  return {
    id: 'plan-growth',
    key: 'growth',
    name: 'Growth',
    isActive: true,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    ...overrides,
  };
}

function market(overrides: Partial<ResolvableMarket> = {}): ResolvableMarket {
  return {
    id: 'market-pk',
    code: 'PK',
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    launchStatus: MarketLaunchStatus.LAUNCHED,
    isEnabled: true,
    selfServiceEnabled: true,
    defaultCurrency: 'PKR',
    supportedCurrencies: ['PKR'],
    ...overrides,
  };
}

function price(overrides: Partial<ResolvablePrice> = {}): ResolvablePrice {
  return {
    id: 'price-v1',
    planId: 'plan-growth',
    marketId: 'market-pk',
    currency: 'PKR',
    billingInterval: BillingInterval.MONTH,
    billingModel: 'PER_SEAT',
    unitAmount: 1500,
    minimumSeats: 1,
    maximumSeats: null,
    includedSeats: 0,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    version: 1,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    isActive: true,
    ...overrides,
  };
}

function resolve(
  overrides: Partial<Parameters<typeof resolveCommercialOffer>[0]> = {},
) {
  return resolveCommercialOffer({
    plan: plan(),
    market: market(),
    prices: [price()],
    billingInterval: BillingInterval.MONTH,
    quantity: 10,
    effectiveAt: NOW,
    channel: 'SELF_SERVICE',
    ...overrides,
  });
}

describe('resolveCommercialOffer', () => {
  it('resolves a published Pakistan price and computes the subtotal', () => {
    const result = resolve();

    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.currency).toBe('PKR');
    expect(result.marketCode).toBe('PK');
    expect(result.unitAmount).toBe(1500);
    expect(result.billableQuantity).toBe(10);
    expect(result.subtotal).toBe(15000);
    expect(result.selfServiceEligible).toBe(true);
  });

  it('bills one unit for a FLAT price regardless of team size', () => {
    const result = resolve({
      prices: [price({ billingModel: 'FLAT', unitAmount: 199 })],
      quantity: 250,
    });

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.billableQuantity).toBe(1);
    expect(result.subtotal).toBe(199);
  });

  // ---------------------------------------------------------------------
  // Publication — the whole point of ITEM-0018
  // ---------------------------------------------------------------------

  it('refuses a DRAFT price', () => {
    const result = resolve({
      prices: [price({ publicationStatus: CommercialPublicationStatus.DRAFT })],
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'NO_PUBLISHED_PRICE',
    });
  });

  it('refuses an ARCHIVED price for a new purchase', () => {
    const result = resolve({
      prices: [
        price({ publicationStatus: CommercialPublicationStatus.ARCHIVED }),
      ],
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'NO_PUBLISHED_PRICE',
    });
  });

  it('refuses a DRAFT plan even when its price is published', () => {
    const result = resolve({
      plan: plan({ publicationStatus: CommercialPublicationStatus.DRAFT }),
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'PLAN_NOT_PUBLISHED',
    });
  });

  // ---------------------------------------------------------------------
  // Market gating
  // ---------------------------------------------------------------------

  it('refuses a market that exists but has not launched', () => {
    const result = resolve({
      market: market({ launchStatus: MarketLaunchStatus.PLANNED }),
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'MARKET_NOT_LAUNCHED',
    });
  });

  it('refuses when no market resolves for the visitor', () => {
    const result = resolve({ market: null });

    expect(result).toMatchObject({
      available: false,
      reason: 'MARKET_NOT_FOUND',
    });
  });

  it('refuses self-service when the market disables it, but stays sellable by an operator', () => {
    const closed = market({ selfServiceEnabled: false });

    expect(resolve({ market: closed })).toMatchObject({
      available: false,
      reason: 'SELF_SERVICE_DISABLED',
    });

    const operator = resolve({ market: closed, channel: 'OPERATOR' });
    expect(operator.available).toBe(true);
    if (!operator.available) return;
    // The offer resolves, but it is not marked self-service eligible.
    expect(operator.selfServiceEligible).toBe(false);
  });

  // REGRESSION — an unscoped price must not become purchasable everywhere.
  it('refuses a price that has no market, rather than treating null as a wildcard', () => {
    const result = resolve({ prices: [price({ marketId: null })] });

    expect(result).toMatchObject({
      available: false,
      reason: 'PRICE_NOT_MARKET_SCOPED',
    });
  });

  it('distinguishes an unscoped price from no price at all', () => {
    expect(resolve({ prices: [] })).toMatchObject({
      reason: 'NO_PUBLISHED_PRICE',
    });
    expect(resolve({ prices: [price({ marketId: null })] })).toMatchObject({
      reason: 'PRICE_NOT_MARKET_SCOPED',
    });
  });

  // ---------------------------------------------------------------------
  // Currency
  // ---------------------------------------------------------------------

  it('defaults to the market currency when none is requested', () => {
    const result = resolve({ currency: null });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.currency).toBe('PKR');
  });

  it('refuses a currency the market does not support', () => {
    const result = resolve({ currency: 'USD' });
    expect(result).toMatchObject({
      available: false,
      reason: 'CURRENCY_NOT_SUPPORTED',
    });
  });

  it('always allows the market default even if supportedCurrencies omits it', () => {
    // Otherwise a market could be published in a state where it sells nothing.
    const result = resolve({
      market: market({ supportedCurrencies: ['USD'] }),
      currency: 'PKR',
    });
    expect(result.available).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Effective dating — QA Scenario C
  // ---------------------------------------------------------------------

  it('resolves v1 before the v2 effective date and v2 after it', () => {
    const v1 = price({
      id: 'price-v1',
      unitAmount: 1500,
      version: 1,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-10-01T00:00:00.000Z'),
    });
    const v2 = price({
      id: 'price-v2',
      unitAmount: 1750,
      version: 2,
      effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
      effectiveTo: null,
    });

    const before = resolve({
      prices: [v1, v2],
      effectiveAt: new Date('2026-09-30T12:00:00.000Z'),
    });
    expect(before.available).toBe(true);
    if (before.available) {
      expect(before.priceId).toBe('price-v1');
      expect(before.unitAmount).toBe(1500);
    }

    const after = resolve({
      prices: [v1, v2],
      effectiveAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    expect(after.available).toBe(true);
    if (after.available) {
      expect(after.priceId).toBe('price-v2');
      expect(after.unitAmount).toBe(1750);
    }
  });

  it('does not let a future version displace the one in force', () => {
    // Selection is by effective date, not by highest version — v3 dated next
    // quarter must not take over today.
    const current = price({ id: 'current', version: 2, unitAmount: 1500 });
    const future = price({
      id: 'future',
      version: 3,
      unitAmount: 9999,
      effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
    });

    const result = resolve({ prices: [future, current] });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.priceId).toBe('current');
  });

  it('refuses when every published price is still in the future', () => {
    const result = resolve({
      prices: [price({ effectiveFrom: new Date('2027-01-01T00:00:00.000Z') })],
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'PRICE_NOT_EFFECTIVE',
    });
  });

  // ---------------------------------------------------------------------
  // Seats
  // ---------------------------------------------------------------------

  it('enforces minimum and maximum seats for per-seat prices', () => {
    expect(
      resolve({ prices: [price({ minimumSeats: 5 })], quantity: 4 }),
    ).toMatchObject({ available: false, reason: 'SEATS_BELOW_MINIMUM' });

    expect(
      resolve({ prices: [price({ maximumSeats: 100 })], quantity: 101 }),
    ).toMatchObject({ available: false, reason: 'SEATS_ABOVE_MAXIMUM' });
  });

  it('ignores seat bounds for a FLAT price', () => {
    const result = resolve({
      prices: [price({ billingModel: 'FLAT', minimumSeats: 50 })],
      quantity: 1,
    });
    expect(result.available).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Sales model — Enterprise must not be hardcoded to "Contact sales"
  // ---------------------------------------------------------------------

  it('keeps a standard published Enterprise plan self-service', () => {
    const result = resolve({
      plan: plan({ id: 'plan-ent', key: 'enterprise' }),
      prices: [price({ planId: 'plan-ent' })],
    });

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.selfServiceEligible).toBe(true);
  });

  it('routes to sales only when configuration says so', () => {
    const result = resolve({
      plan: plan({ salesModel: CommercialSalesModel.SALES_ASSISTED }),
    });
    expect(result).toMatchObject({
      available: false,
      reason: 'SALES_ASSISTED_ONLY',
    });
  });

  it('lets a price narrow the plan sales model but never widen it', () => {
    // A permissive price row must not make a custom-contract plan buyable.
    const result = resolve({
      plan: plan({ salesModel: CommercialSalesModel.CUSTOM_ONLY }),
      prices: [price({ salesModel: CommercialSalesModel.SELF_SERVICE })],
    });
    expect(result).toMatchObject({
      available: false,
      reason: 'CUSTOM_CONTRACT_ONLY',
    });
  });
});

describe('narrowestSalesModel', () => {
  it('always returns the more restrictive of the two', () => {
    const { SELF_SERVICE, SALES_ASSISTED, CUSTOM_ONLY } = CommercialSalesModel;
    expect(narrowestSalesModel(SELF_SERVICE, SALES_ASSISTED)).toBe(
      SALES_ASSISTED,
    );
    expect(narrowestSalesModel(SALES_ASSISTED, SELF_SERVICE)).toBe(
      SALES_ASSISTED,
    );
    expect(narrowestSalesModel(CUSTOM_ONLY, SELF_SERVICE)).toBe(CUSTOM_ONLY);
    expect(narrowestSalesModel(SELF_SERVICE, SELF_SERVICE)).toBe(SELF_SERVICE);
  });
});

describe('selectEffectivePrice', () => {
  it('ignores unpublished, inactive and unscoped candidates', () => {
    const candidates = [
      price({
        id: 'draft',
        publicationStatus: CommercialPublicationStatus.DRAFT,
      }),
      price({ id: 'inactive', isActive: false }),
      price({ id: 'unscoped', marketId: null }),
      price({ id: 'good' }),
    ];

    expect(selectEffectivePrice(candidates, NOW)?.id).toBe('good');
  });

  it('returns null rather than guessing when nothing is in force', () => {
    expect(selectEffectivePrice([], NOW)).toBeNull();
  });

  it('respects an effectiveTo boundary as exclusive', () => {
    const boundary = new Date('2026-10-01T00:00:00.000Z');
    const expiring = price({ effectiveTo: boundary });

    expect(
      selectEffectivePrice([expiring], new Date(boundary.getTime() - 1)),
    ).not.toBeNull();
    expect(selectEffectivePrice([expiring], boundary)).toBeNull();
  });
});

describe('isPublicSafeReason', () => {
  it('does not leak internal configuration state to visitors', () => {
    expect(isPublicSafeReason('SALES_ASSISTED_ONLY')).toBe(true);
    expect(isPublicSafeReason('SEATS_ABOVE_MAXIMUM')).toBe(true);
    // These describe how the commercial configuration is put together.
    expect(isPublicSafeReason('PRICE_NOT_MARKET_SCOPED')).toBe(false);
    expect(isPublicSafeReason('MARKET_NOT_PUBLISHED')).toBe(false);
    expect(isPublicSafeReason('NO_PUBLISHED_PRICE')).toBe(false);
  });
});
