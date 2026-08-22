import { Prisma, type PrismaClient } from '@prisma/client';

import { bootstrapCommercialDefaults } from './commercial-bootstrap';
import { DEFAULT_MARKET_DEFINITIONS } from './markets.catalog';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { buildSeededPrices } from './pricing.catalog';

/**
 * The bootstrap must converge, not merely create.
 *
 * Every branch in this file used to stop at "does a row exist?". On a fresh
 * database that is indistinguishable from correct, and it is why the catalogue
 * and the database could disagree indefinitely: an existing plan kept whatever
 * name it was seeded with, an occupied price slot was counted as served
 * whatever amount it held, and a plan the catalogue had dropped stayed on sale.
 * "Delete the existing plans and set the real prices" was a report of exactly
 * that — the numbers had been decided on 2026-08-20 and the database had never
 * heard about it.
 *
 * These tests pin the four things convergence has to get right, and the two it
 * must refuse to do. The fake below is a hand-written stand-in rather than a
 * mock library: what is being asserted is which writes happen and with what,
 * and a fake that records them says that directly.
 */

type Row = Record<string, unknown>;

function fakePrisma(seed: {
  plans?: Row[];
  markets?: Row[];
  marketCountries?: Row[];
  prices?: Row[];
  planFeatures?: Row[];
}) {
  const plans = seed.plans ?? [];
  const markets = seed.markets ?? [];
  /*
   * Country claims default to already matching the catalog, so a test whose
   * subject is a drifted plan name does not also have five country moves to
   * account for. A test about the country mapping seeds this explicitly.
   */
  const marketCountries = seed.marketCountries ?? catalogMarketCountries();
  const prices = seed.prices ?? [];
  /*
   * Features default to already agreeing with the catalogue, because a plan
   * with no feature rows is a plan every run legitimately has work to do on —
   * and that would make `plansUpdated` say "4" in every test whose subject is
   * one drifted name.
   */
  const planFeatures = seed.planFeatures ?? catalogFeatures();

  const planUpdates: Row[] = [];
  const priceCreates: Row[] = [];
  const priceUpdates: Row[] = [];
  const priceUpdateManys: Row[] = [];
  const featureUpdates: Row[] = [];
  const marketCreates: Row[] = [];
  const countryCreates: Row[] = [];
  const countryUpdates: Row[] = [];

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') {
        return (value as Row[]).some((clause) => matches(row, clause));
      }
      if (value !== null && typeof value === 'object') {
        const clause = value as Row;
        if ('in' in clause) return (clause.in as unknown[]).includes(row[key]);
        if ('notIn' in clause)
          return !(clause.notIn as unknown[]).includes(row[key]);
      }
      return row[key] === value;
    });

  const client = {
    plan: {
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(plans.find((row) => matches(row, where)) ?? null),
      ),
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(plans.filter((row) => matches(row, where))),
      ),
      create: jest.fn(() => Promise.resolve({ id: 'created' })),
      update: jest.fn((args: Row) => {
        planUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    planFeature: {
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(planFeatures.filter((row) => matches(row, where))),
      ),
      update: jest.fn((args: Row) => {
        featureUpdates.push(args);
        return Promise.resolve({});
      }),
      create: jest.fn(() => Promise.resolve({})),
    },
    market: {
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(markets.find((row) => matches(row, where)) ?? null),
      ),
      create: jest.fn((args: Row) => {
        const data = args.data as Row;
        const row = { id: `market-${String(data.code)}`, ...data };
        markets.push(row);
        marketCreates.push(args);
        return Promise.resolve(row);
      }),
    },
    marketCountry: {
      findUnique: jest.fn(({ where }: { where: Row }) => {
        const row = marketCountries.find((item) => matches(item, where));
        if (!row) return Promise.resolve(null);
        // `include: { market: { select: { code } } }` — the repair reports the
        // market it took a country from, so the fake has to be able to name it.
        const owner = markets.find((item) => item.id === row.marketId);
        return Promise.resolve({
          ...row,
          market: { code: owner?.code ?? 'UNKNOWN' },
        });
      }),
      create: jest.fn((args: Row) => {
        const data = args.data as Row;
        marketCountries.push({ ...data });
        countryCreates.push(args);
        return Promise.resolve({});
      }),
      update: jest.fn((args: Row) => {
        const where = args.where as Row;
        const data = args.data as Row;
        const row = marketCountries.find((item) => matches(item, where));
        if (row) Object.assign(row, data);
        countryUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    planPrice: {
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(prices.find((row) => matches(row, where)) ?? null),
      ),
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(prices.filter((row) => matches(row, where))),
      ),
      create: jest.fn((args: Row) => {
        priceCreates.push(args);
        return Promise.resolve({});
      }),
      update: jest.fn((args: Row) => {
        priceUpdates.push(args);
        return Promise.resolve({});
      }),
      updateMany: jest.fn((args: Row) => {
        priceUpdateManys.push(args);
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) =>
      run(client),
    ),
  };

  return {
    client: client as unknown as PrismaClient,
    planUpdates,
    priceCreates,
    priceUpdates,
    priceUpdateManys,
    featureUpdates,
    marketCreates,
    countryCreates,
    countryUpdates,
    marketCountries,
  };
}

/** Every country the catalog assigns, already pointing at the right market. */
function catalogMarketCountries() {
  return DEFAULT_MARKET_DEFINITIONS.flatMap((definition) => {
    const codes: readonly string[] = definition.countryCodes;
    return codes.map((countryCode) => ({
      countryCode,
      marketId: `market-${definition.code}`,
    }));
  });
}

/** Every catalogue plan's feature rows, all enabled, as they would be once seeded. */
function catalogFeatures() {
  return DEFAULT_PLAN_DEFINITIONS.flatMap((definition) => {
    // Annotated because `DEFAULT_PLAN_DEFINITIONS` is `as const`: the members
    // carry different tuple types, so the union's `.map` resolves to `any`.
    const keys: readonly string[] = definition.enabledFeatureKeys;
    return keys.map((featureKey) => ({
      id: `${definition.key}-${featureKey}`,
      planId: `plan-${definition.key}`,
      featureKey,
      isEnabled: true,
    }));
  });
}

/** A market row for every code the price schedule references. */
const allMarkets = () =>
  ['PK', 'QA', 'INTL', 'US', 'GCC'].map((code) => ({
    id: `market-${code}`,
    code,
  }));

/** A plan row already in agreement with the catalogue. */
function catalogPlan(key: string) {
  const definition = DEFAULT_PLAN_DEFINITIONS.find((item) => item.key === key)!;
  return {
    id: `plan-${key}`,
    key,
    name: definition.name,
    description: definition.description,
    sortOrder: definition.sortOrder,
    isActive: true,
    isPublic: true,
    publicationStatus: 'PUBLISHED',
    salesModel: key === 'enterprise-plus' ? 'CUSTOM_ONLY' : 'SELF_SERVICE',
    monthlyBasePrice: new Prisma.Decimal(definition.monthlyBasePrice),
    annualBasePrice: new Prisma.Decimal(definition.annualBasePrice),
    currency: definition.currency,
    _count: { subscriptions: 0 },
  };
}

/** Every catalogue plan, already correct. */
const catalogPlans = () =>
  DEFAULT_PLAN_DEFINITIONS.map((item) => catalogPlan(item.key));

/** The price rows the catalogue asks for, as they would be once seeded. */
function catalogPrices() {
  return buildSeededPrices().map((price, index) => ({
    id: `price-${index}`,
    planId: `plan-${price.planKey}`,
    marketId: `market-${price.marketCode}`,
    billingCycle: price.cycle,
    billingInterval: price.cycle === 'ANNUAL' ? 'YEAR' : 'MONTH',
    billingModel: price.billingModel,
    currency: price.currency,
    version: 1,
    unitAmount: new Prisma.Decimal(price.unitAmount),
    minimumSeats: price.minimumSeats,
    includedSeats: price.includedSeats,
    overageUnitAmount:
      price.overageUnitAmount === null
        ? null
        : new Prisma.Decimal(price.overageUnitAmount),
    salesModel: price.salesModel,
    publicationStatus: 'PUBLISHED',
    isActive: true,
    plan: { key: price.planKey },
  }));
}

describe('commercial bootstrap converges on the catalogue', () => {
  it('changes nothing when the database already matches', async () => {
    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices: catalogPrices(),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    /*
     * The load-bearing assertion of the whole file. A reconciler that rewrites
     * correct rows is worse than one that never runs: it stamps a new
     * `publishedAt` on every deploy, supersedes prices nobody changed, and
     * detaches each of them from Stripe in the process. Idempotence is what
     * makes this safe to run from `release:api`.
     */
    expect({
      plansUpdated: result.plansUpdated,
      pricesSuperseded: result.pricesSuperseded,
      pricesCreated: result.pricesCreated,
      warnings: result.warnings,
    }).toEqual({
      plansUpdated: 0,
      pricesSuperseded: 0,
      pricesCreated: 0,
      warnings: [],
    });
    expect(fake.planUpdates).toEqual([]);
    expect(result.pricesSkippedExisting).toBe(buildSeededPrices().length);
  });

  it('corrects a plan whose name and legacy amount have drifted', async () => {
    const stale = catalogPlan('starter');
    stale.name = 'Basic';
    stale.monthlyBasePrice = new Prisma.Decimal(199);

    const fake = fakePrisma({
      plans: [
        stale,
        ...catalogPlans().filter((plan) => plan.key !== 'starter'),
      ],
      markets: allMarkets(),
      prices: catalogPrices(),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.plansUpdated).toBe(1);
    const update = fake.planUpdates[0] as { data: Row };
    expect(update.data.name).toBe('Starter');
    expect(update.data.monthlyBasePrice).toBe(69);
    /*
     * 199 was the invented pre-schedule figure. The old code filled these
     * columns in only when both were zero — "an operator's numbers are never
     * overwritten" — which meant a plan carrying the invented number kept it
     * permanently, and it is the number that shows beside the plan name.
     */
    expect(update.data.currency).toBe('USD');
  });

  it('supersedes a price standing on terms the catalogue no longer states', async () => {
    const prices = catalogPrices();
    const drifted = prices.find(
      (price) =>
        price.planId === 'plan-starter' &&
        price.currency === 'PKR' &&
        price.billingCycle === 'MONTHLY' &&
        price.billingModel === 'PER_SEAT',
    )!;
    drifted.unitAmount = new Prisma.Decimal(250);

    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices,
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.pricesSuperseded).toBe(1);

    // Deactivated, never edited: a subscription points at this row, and the
    // terms it was sold under have to stay readable.
    const retired = fake.priceUpdates[0] as { where: Row; data: Row };
    expect(retired.where).toEqual({ id: drifted.id });
    expect(retired.data.isActive).toBe(false);

    const created = fake.priceCreates[0] as { data: Row };
    expect({
      unitAmount: created.data.unitAmount,
      supersedesPriceId: created.data.supersedesPriceId,
      version: created.data.version,
      isActive: created.data.isActive,
    }).toEqual({
      unitAmount: 300,
      supersedesPriceId: drifted.id,
      version: 2,
      isActive: true,
    });

    /*
     * No Stripe identifiers on the successor. The old row's `stripePriceId`
     * names a Stripe Price for 250 PKR; carrying it over would produce a row
     * that reports itself synced and charges the previous amount — a wrong
     * number that looks verified, which is the worst of the available states.
     */
    expect(created.data).not.toHaveProperty('stripePriceId');
    expect(result.warnings.join(' ')).toContain('not checkout-ready');
  });

  it('notices drift that is not the amount', async () => {
    const prices = catalogPrices();
    const flat = prices.find(
      (price) =>
        price.planId === 'plan-growth' &&
        price.currency === 'QAR' &&
        price.billingModel === 'FLAT' &&
        price.billingCycle === 'MONTHLY',
    )!;
    // Right price, wrong channel. This is the one that matters most: a FLAT row
    // marked SELF_SERVICE is reachable from the public site, and flat pricing
    // is a sales-assisted instrument precisely because its spread against
    // per-seat should be quoted by a person.
    flat.salesModel = 'SELF_SERVICE';

    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices,
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.pricesSuperseded).toBe(1);
    expect((fake.priceCreates[0] as { data: Row }).data.salesModel).toBe(
      'SALES_ASSISTED',
    );
    expect(result.warnings.join(' ')).toContain('sales model');
  });

  it('deactivates an active price the catalogue does not list', async () => {
    /*
     * The shape the development database was actually in, reduced to two rows:
     * a FLAT USD price scoped to Pakistan — a currency PK supports, so it
     * genuinely resolved — and one scoped to no market at all. Neither is a
     * slot the catalogue asks for, so `reconcilePlanPrice` never looks at
     * either, and before this pass existed both survived every seed.
     */
    const stale = [
      {
        id: 'stale-pk-usd',
        planId: 'plan-growth',
        marketId: 'market-PK',
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        billingModel: 'FLAT',
        currency: 'USD',
        version: 1,
        unitAmount: new Prisma.Decimal(399),
        minimumSeats: 1,
        includedSeats: 0,
        overageUnitAmount: null,
        salesModel: 'SELF_SERVICE',
        publicationStatus: 'PUBLISHED',
        isActive: true,
        plan: { key: 'growth' },
      },
      {
        id: 'stale-unscoped',
        planId: 'plan-growth',
        marketId: null,
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        billingModel: 'FLAT',
        currency: 'USD',
        version: 1,
        unitAmount: new Prisma.Decimal(399),
        minimumSeats: 1,
        includedSeats: 0,
        overageUnitAmount: null,
        salesModel: 'SELF_SERVICE',
        publicationStatus: 'PUBLISHED',
        isActive: true,
        plan: { key: 'growth' },
      },
    ];

    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices: [...catalogPrices(), ...stale],
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.pricesRetired).toBe(2);
    expect(result.pricesSuperseded).toBe(0);

    const retired = fake.priceUpdates.map(
      (item) => (item as { where: { id: string } }).where.id,
    );
    expect(retired.sort()).toEqual(['stale-pk-usd', 'stale-unscoped']);
    for (const update of fake.priceUpdates) {
      expect((update as { data: Row }).data.isActive).toBe(false);
    }

    // A price the catalogue *does* list is untouched by the same pass.
    expect(retired).not.toContain('price-0');
  });

  it('retires a plan the catalogue dropped, along with its prices', async () => {
    const legacy = {
      ...catalogPlan('starter'),
      id: 'plan-legacy',
      key: 'legacy-pro',
      _count: { subscriptions: 0 },
    };

    const fake = fakePrisma({
      plans: [...catalogPlans(), legacy],
      markets: allMarkets(),
      prices: catalogPrices(),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.plansRetired).toBe(1);
    expect(result.plansWithdrawn).toBe(0);

    const update = fake.planUpdates.find(
      (item) => (item as { where: Row }).where.id === 'plan-legacy',
    ) as { data: Row };
    expect(update.data.isActive).toBe(false);
    expect(update.data.publicationStatus).toBe('ARCHIVED');

    /*
     * Its prices go too. The active-price resolution index knows nothing about
     * whether the plan is active, so an orphaned active price under a retired
     * plan is still a row the offer resolver would consider.
     */
    expect(fake.priceUpdateManys).toContainEqual(
      expect.objectContaining({
        where: { planId: 'plan-legacy', isActive: true },
      }),
    );
  });

  it('will not retire a plan customers are subscribed to', async () => {
    const legacy = {
      ...catalogPlan('starter'),
      id: 'plan-legacy',
      key: 'legacy-pro',
      _count: { subscriptions: 3 },
    };

    const fake = fakePrisma({
      plans: [...catalogPlans(), legacy],
      markets: allMarkets(),
      prices: catalogPrices(),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.plansRetired).toBe(0);
    expect(result.plansWithdrawn).toBe(1);

    const update = fake.planUpdates.find(
      (item) => (item as { where: Row }).where.id === 'plan-legacy',
    ) as { data: Row };
    /*
     * Withdrawn from sale, left running. `isActive: false` here would be the
     * literal reading of "delete the existing plans" and would break three
     * paying customers — the plan is what their subscription renders from.
     */
    expect(update.data.publicationStatus).toBe('ARCHIVED');
    expect(update.data.isPublic).toBe(false);
    expect(update.data).not.toHaveProperty('isActive');

    // And it is reported rather than done quietly.
    expect(result.warnings.join(' ')).toContain('3 subscription(s)');
    expect(fake.priceUpdateManys).toEqual([]);
  });
});

/**
 * BUG-0309 — a launched market that resolved for nobody.
 *
 * `MarketCountry.countryCode` is unique globally, not per market. `GCC` was
 * seeded first and claimed `QA`. When Qatar later became its own market at QAR,
 * the bootstrap created the market, failed to create its country row against
 * that unique constraint, caught the violation as benign, and moved on — then
 * skipped the market on every subsequent run because it now existed. The repair
 * migration was guarded on the market existing and runs before the seed that
 * creates it, so it matched nothing on exactly the databases that needed it.
 *
 * Production ran for weeks with a LAUNCHED, published, QAR-priced Qatar market
 * holding no countries, so every visitor in Doha resolved to GCC — PLANNED,
 * self-service off, default currency USD — and was quoted USD on the home and
 * plans pages while the checkout page said QAR.
 *
 * These tests pin the repair and, just as importantly, its silence: a country
 * moved between markets is a commercial change and must be reported.
 */
describe('commercial bootstrap reconciles market country claims', () => {
  it('gives a country back to the market the catalog assigns it to', async () => {
    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices: catalogPrices(),
      // The production state: GCC still holds QA, so Qatar resolves for nobody.
      marketCountries: catalogMarketCountries().map((row) =>
        row.countryCode === 'QA' ? { ...row, marketId: 'market-GCC' } : row,
      ),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    const moved = fake.countryUpdates.find(
      (item) => (item as { where: Row }).where.countryCode === 'QA',
    ) as { data: Row } | undefined;
    expect(moved?.data.marketId).toBe('market-QA');

    // Reported, not done quietly — the silence is what hid this for weeks.
    expect(result.warnings.join(' ')).toContain('Country QA');
    expect(result.warnings.join(' ')).toContain('GCC');
  });

  it('creates a country row the market never got at all', async () => {
    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices: catalogPrices(),
      marketCountries: catalogMarketCountries().filter(
        (row) => row.countryCode !== 'QA',
      ),
    });

    await bootstrapCommercialDefaults(fake.client);

    expect(
      fake.countryCreates.map((item) => (item as { data: Row }).data),
    ).toContainEqual({ marketId: 'market-QA', countryCode: 'QA' });
  });

  it('leaves a country alone when it already points at the right market', async () => {
    // Idempotence. A seed that rewrites correct rows on every deploy is a seed
    // nobody can tell apart from one that is repairing something.
    const fake = fakePrisma({
      plans: catalogPlans(),
      markets: allMarkets(),
      prices: catalogPrices(),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(fake.countryUpdates).toEqual([]);
    expect(fake.countryCreates).toEqual([]);
    expect(result.warnings.join(' ')).not.toContain('Country');
  });

  it('writes a new market before its countries, so one clash cannot lose the market', async () => {
    /*
     * The countries used to be nested inside `market.create`. A single country
     * already claimed elsewhere failed the whole statement, and the catch
     * treated it as benign — so the market silently did not exist, which is
     * strictly worse than a market missing one country.
     */
    const fake = fakePrisma({
      plans: catalogPlans(),
      // No Qatar market yet, and GCC is holding its country code.
      markets: ['PK', 'INTL', 'US', 'GCC'].map((code) => ({
        id: `market-${code}`,
        code,
      })),
      prices: catalogPrices(),
      marketCountries: catalogMarketCountries().map((row) =>
        row.countryCode === 'QA' ? { ...row, marketId: 'market-GCC' } : row,
      ),
    });

    const result = await bootstrapCommercialDefaults(fake.client);

    expect(result.marketsCreated).toBe(1);
    const created = fake.marketCreates[0] as { data: Row };
    expect(created.data.code).toBe('QA');
    // The market is created without countries, then the claim is reconciled.
    expect(created.data).not.toHaveProperty('countries');
    expect(
      fake.marketCountries.find((row) => row.countryCode === 'QA')?.marketId,
    ).toBe('market-QA');
  });
});
