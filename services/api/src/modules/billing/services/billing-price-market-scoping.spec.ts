import { Prisma } from '@prisma/client';
import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
  MarketLaunchStatus,
  StripeEnvironment,
  StripeSyncStatus,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { BillingService } from './billing.service';
import { CommercialConfigService } from './commercial-config.service';
import {
  isPriceCurrentlySellable,
  resolveCommercialOffer,
} from '../commercial-offer.resolver';

/**
 * BUG-3334 / BUG-3333 item 2.
 *
 * `getPublicPlans` and `createCheckoutSession` used to test only
 * `plan.publicationStatus`, so a DRAFT or unscoped `PlanPrice` on a PUBLISHED
 * plan was listed and buyable by a tenant who knew its id, and a tenant could
 * buy a price scoped to a market other than its own by posting the id
 * directly. This file pins the fix against fixtures shared with
 * `resolveCommercialOffer` — the resolver `/public/commercial-config` already
 * used correctly — so the tenant path and the visitor path cannot disagree
 * about the same row again.
 */

const MARKET_A = {
  id: 'market-a',
  code: 'A',
  publicationStatus: CommercialPublicationStatus.PUBLISHED,
  launchStatus: MarketLaunchStatus.LAUNCHED,
  isEnabled: true,
  selfServiceEnabled: true,
  defaultCurrency: 'USD',
  supportedCurrencies: ['USD'],
};

const MARKET_B = {
  ...MARKET_A,
  id: 'market-b',
  code: 'B',
  defaultCurrency: 'QAR',
  supportedCurrencies: ['QAR'],
};

const PLAN = {
  id: 'plan-1',
  key: 'starter',
  name: 'Starter',
  isActive: true,
  publicationStatus: CommercialPublicationStatus.PUBLISHED,
  salesModel: CommercialSalesModel.SELF_SERVICE,
};

function priceFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'price-1',
    planId: PLAN.id,
    marketId: MARKET_A.id,
    currency: 'USD',
    billingInterval: BillingInterval.MONTH,
    billingCycle: BillingCycle.MONTHLY,
    billingModel: BillingModel.PER_SEAT,
    unitAmount: 10,
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

describe('BUG-3334 — isPriceCurrentlySellable agrees with resolveCommercialOffer', () => {
  it.each([
    ['a fully published, market-scoped price', priceFixture(), true],
    [
      'a DRAFT price',
      priceFixture({ publicationStatus: CommercialPublicationStatus.DRAFT }),
      false,
    ],
    ['an unscoped price', priceFixture({ marketId: null }), false],
    ['an inactive price', priceFixture({ isActive: false }), false],
  ] as const)('%s', (_label, price, expectedSellable) => {
    expect(isPriceCurrentlySellable(PLAN, price)).toBe(expectedSellable);

    // Same fixture, same verdict from the resolver used everywhere else.
    const offer = resolveCommercialOffer({
      plan: PLAN,
      market: MARKET_A,
      prices: [price as never],
      billingInterval: BillingInterval.MONTH,
      quantity: price.minimumSeats,
      effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      channel: 'SELF_SERVICE',
    });

    expect(offer.available).toBe(expectedSellable);
  });
});

/**
 * `BillingService` instantiated directly — constructor deps are all narrow
 * interfaces, so a plain object literal per dependency is enough. No NestJS
 * testing module is needed for a class this shape.
 */
function buildService(options: {
  planPrice: Record<string, unknown> | null;
  tenantMarketId: string | null;
  subscription?: Record<string, unknown> | null;
  tenant?: Record<string, unknown> | null;
}) {
  const planPriceUpdate = jest.fn().mockResolvedValue(undefined);
  const sessionsCreate = jest.fn().mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.test/cs_test_1',
  });

  const prisma = {
    plan: { findMany: jest.fn() },
    planPrice: {
      findUnique: jest.fn().mockResolvedValue(options.planPrice),
      update: planPriceUpdate,
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(options.subscription ?? null),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(
        options.tenant ?? {
          id: 'tenant-1',
          slug: 'tenant-1',
          customerAccount: { id: 'ca-1', stripeCustomerId: 'cus_existing' },
        },
      ),
    },
    customerAccount: { update: jest.fn() },
  };

  const stripeBillingService = {
    getRuntimeMode: () => 'test' as const,
    verifyRecurringPrice: jest.fn().mockResolvedValue({
      valid: true,
      livemode: false,
      active: true,
      productId: 'prod_test_1',
      usageType: 'licensed',
      recurringInterval: 'month',
      verifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      reasons: [] as string[],
    }),
    client: {
      checkout: { sessions: { create: sessionsCreate } },
    },
  };

  const commercialConfigService = {
    resolveMarketForTenant: jest.fn().mockResolvedValue(
      options.tenantMarketId ? { id: options.tenantMarketId } : null,
    ),
  } as unknown as CommercialConfigService;

  const service = new BillingService(
    prisma as never,
    stripeBillingService as never,
    { get: () => 'https://app.test' } as never,
    { openOrder: jest.fn() } as never,
    { issueCode: jest.fn() } as never,
    { acknowledgeMany: jest.fn() } as never,
    commercialConfigService,
  );

  return { service, prisma, sessionsCreate };
}

describe('BillingService.getPublicPlans — tenant market scoping (BUG-3334)', () => {
  function planWithPrices(prices: Array<Record<string, unknown>>) {
    return {
      ...PLAN,
      description: null,
      sortOrder: 1,
      currency: 'USD',
      monthlyBasePrice: new Prisma.Decimal(0),
      annualBasePrice: new Prisma.Decimal(0),
      metadataJson: null,
      features: [],
      prices: prices.map((price) => ({
        ...price,
        unitAmount: new Prisma.Decimal(price.unitAmount as number),
        stripeProductId: null,
        stripePriceId: null,
        stripeEnvironment: null,
        stripeSyncStatus: StripeSyncStatus.PENDING,
        stripeActive: false,
        stripeUsageType: null,
        stripeRecurringInterval: null,
        stripeVerifiedAt: null,
      })),
    };
  }

  it('lists only the price scoped to the tenant\'s own market', async () => {
    const ownMarketPrice = priceFixture({ id: 'price-own', marketId: MARKET_A.id });
    const foreignMarketPrice = priceFixture({
      id: 'price-foreign',
      marketId: MARKET_B.id,
    });
    const { service, prisma } = buildService({
      planPrice: null,
      tenantMarketId: MARKET_A.id,
    });
    prisma.plan.findMany.mockResolvedValue([
      planWithPrices([ownMarketPrice, foreignMarketPrice]),
    ]);

    const result = await service.getPublicPlans({ tenantId: 'tenant-1' });

    expect(result.plans[0].prices.map((price) => price.id)).toEqual([
      'price-own',
    ]);
  });

  it('excludes a DRAFT price for both the tenant and the anonymous caller', async () => {
    const draft = priceFixture({
      id: 'price-draft',
      publicationStatus: CommercialPublicationStatus.DRAFT,
    });
    const { service, prisma } = buildService({
      planPrice: null,
      tenantMarketId: MARKET_A.id,
    });
    prisma.plan.findMany.mockResolvedValue([planWithPrices([draft])]);

    const tenantResult = await service.getPublicPlans({ tenantId: 'tenant-1' });
    const anonymousResult = await service.getPublicPlans();

    expect(tenantResult.plans[0].prices).toEqual([]);
    expect(anonymousResult.plans[0].prices).toEqual([]);
  });

  it('lists nothing for a tenant whose market cannot be resolved', async () => {
    const price = priceFixture();
    const { service, prisma } = buildService({
      planPrice: null,
      tenantMarketId: null,
    });
    prisma.plan.findMany.mockResolvedValue([planWithPrices([price])]);

    const result = await service.getPublicPlans({ tenantId: 'tenant-1' });

    expect(result.plans[0].prices).toEqual([]);
  });
});

describe('BillingService.createCheckoutSession — price and market gates (BUG-3334/BUG-3333)', () => {
  const basePlanPrice = () => ({
    ...priceFixture(),
    unitAmount: new Prisma.Decimal(10),
    stripePriceId: 'price_live_1',
    stripeProductId: 'prod_live_1',
    stripeEnvironment: StripeEnvironment.TEST,
    stripeSyncStatus: StripeSyncStatus.SYNCED,
    stripeActive: true,
    stripeUsageType: 'licensed',
    stripeRecurringInterval: 'month',
    stripeVerifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    plan: PLAN,
  });

  it('refuses a DRAFT price', async () => {
    const { service } = buildService({
      planPrice: {
        ...basePlanPrice(),
        publicationStatus: CommercialPublicationStatus.DRAFT,
      },
      tenantMarketId: MARKET_A.id,
    });

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        userId: 'user-1',
        planPriceId: 'price-1',
        seatQuantity: 1,
      }),
    ).rejects.toMatchObject({
      errorCode: 'BILLING_PLAN_PRICE_UNAVAILABLE',
    });
  });

  it('refuses an unscoped price', async () => {
    const { service } = buildService({
      planPrice: { ...basePlanPrice(), marketId: null },
      tenantMarketId: MARKET_A.id,
    });

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        userId: 'user-1',
        planPriceId: 'price-1',
        seatQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a price scoped to a market other than the tenant's own", async () => {
    const { service } = buildService({
      planPrice: { ...basePlanPrice(), marketId: MARKET_B.id },
      tenantMarketId: MARKET_A.id,
    });

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        userId: 'user-1',
        planPriceId: 'price-1',
        seatQuantity: 1,
      }),
    ).rejects.toMatchObject({
      errorCode: 'BILLING_PLAN_PRICE_UNAVAILABLE',
    });
  });

  it("refuses when the tenant's own market cannot be resolved at all", async () => {
    const { service } = buildService({
      planPrice: basePlanPrice(),
      tenantMarketId: null,
    });

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        userId: 'user-1',
        planPriceId: 'price-1',
        seatQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('succeeds for a published price scoped to the tenant\'s own market', async () => {
    const { service, sessionsCreate } = buildService({
      planPrice: basePlanPrice(),
      tenantMarketId: MARKET_A.id,
      subscription: null,
    });

    const result = await service.createCheckoutSession({
      tenantId: 'tenant-1',
      userId: 'user-1',
      planPriceId: 'price-1',
      seatQuantity: 1,
    });

    expect(result.url).toBe('https://checkout.stripe.test/cs_test_1');
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});
