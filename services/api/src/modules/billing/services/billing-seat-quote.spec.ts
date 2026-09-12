import { Prisma } from '@prisma/client';
import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
} from '@prisma/client';
import { BillingService } from './billing.service';
import { CommercialConfigService } from './commercial-config.service';

/**
 * BUG-3330 — a quote endpoint so the plans screen never reimplements
 * `calculateSeatPricing`'s arithmetic in the browser. Tenant-scoped and
 * gated exactly like `createCheckoutSession` (BUG-3334/BUG-3333): a price
 * this tenant may not buy is not a price this tenant may be quoted either.
 */

const MARKET_ID = 'market-a';

function planPriceFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'price-1',
    planId: 'plan-1',
    marketId: MARKET_ID,
    currency: 'USD',
    unitAmount: new Prisma.Decimal(10),
    billingModel: BillingModel.PER_SEAT,
    billingCycle: BillingCycle.MONTHLY,
    billingInterval: BillingInterval.MONTH,
    minimumSeats: 1,
    maximumSeats: 50,
    includedSeats: 5,
    isActive: true,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    plan: {
      id: 'plan-1',
      isActive: true,
      publicationStatus: CommercialPublicationStatus.PUBLISHED,
      salesModel: CommercialSalesModel.SELF_SERVICE,
    },
    ...overrides,
  };
}

function buildService(options: {
  planPrice: Record<string, unknown> | null;
  tenantMarketId: string | null;
}) {
  const prisma = {
    planPrice: {
      findFirst: jest.fn().mockResolvedValue(options.planPrice),
    },
  };
  const commercialConfigService = {
    resolveMarketForTenant: jest
      .fn()
      .mockResolvedValue(
        options.tenantMarketId ? { id: options.tenantMarketId } : null,
      ),
  } as unknown as CommercialConfigService;

  return new BillingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    commercialConfigService,
  );
}

describe('BillingService.getSeatQuote', () => {
  it('returns seats, unit price, billable seats and total', async () => {
    const service = buildService({
      planPrice: planPriceFixture(),
      tenantMarketId: MARKET_ID,
    });

    const quote = await service.getSeatQuote('tenant-1', 'price-1', 25);

    expect(quote).toMatchObject({
      planPriceId: 'price-1',
      billingModel: BillingModel.PER_SEAT,
      currency: 'USD',
      seats: 25,
      includedSeats: 5,
      unitPrice: 10,
      // 25 seats, 5 included -> 20 billable, at 10/seat = 200.
      billableSeats: 20,
      total: 200,
    });
  });

  it('a FLAT price always quotes one billable unit', async () => {
    const service = buildService({
      planPrice: planPriceFixture({
        billingModel: BillingModel.FLAT,
        unitAmount: new Prisma.Decimal(500),
        includedSeats: 25,
        minimumSeats: 1,
        maximumSeats: null,
      }),
      tenantMarketId: MARKET_ID,
    });

    const quote = await service.getSeatQuote('tenant-1', 'price-1', 10);

    expect(quote.billableSeats).toBe(1);
    expect(quote.total).toBe(500);
  });

  it('refuses a seat count below the minimum, stating the bound', async () => {
    const service = buildService({
      planPrice: planPriceFixture({ minimumSeats: 10 }),
      tenantMarketId: MARKET_ID,
    });

    await expect(
      service.getSeatQuote('tenant-1', 'price-1', 3),
    ).rejects.toThrow(/at least 10/);
  });

  it('refuses a seat count above the maximum, stating the bound', async () => {
    const service = buildService({
      planPrice: planPriceFixture({ maximumSeats: 20 }),
      tenantMarketId: MARKET_ID,
    });

    await expect(
      service.getSeatQuote('tenant-1', 'price-1', 30),
    ).rejects.toThrow(/exceed 20/);
  });

  it('refuses a DRAFT price', async () => {
    const service = buildService({
      planPrice: planPriceFixture({
        publicationStatus: CommercialPublicationStatus.DRAFT,
      }),
      tenantMarketId: MARKET_ID,
    });

    await expect(
      service.getSeatQuote('tenant-1', 'price-1', 5),
    ).rejects.toMatchObject({ errorCode: 'BILLING_PLAN_PRICE_UNAVAILABLE' });
  });

  it("refuses a price scoped to a market other than the tenant's own", async () => {
    const service = buildService({
      planPrice: planPriceFixture({ marketId: 'market-b' }),
      tenantMarketId: MARKET_ID,
    });

    await expect(
      service.getSeatQuote('tenant-1', 'price-1', 5),
    ).rejects.toMatchObject({ errorCode: 'BILLING_PLAN_PRICE_UNAVAILABLE' });
  });

  it('refuses an unknown price id', async () => {
    const service = buildService({
      planPrice: null,
      tenantMarketId: MARKET_ID,
    });

    await expect(
      service.getSeatQuote('tenant-1', 'price-missing', 5),
    ).rejects.toMatchObject({ errorCode: 'BILLING_PLAN_PRICE_UNAVAILABLE' });
  });
});
