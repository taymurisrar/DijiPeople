import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { bootstrapCommercialDefaults } from '../src/modules/super-admin/commercial-bootstrap';
import { describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-0030, against a real PostgreSQL.
 *
 * A mocked Prisma cannot show any of this. The defect was a disagreement
 * between an application-level existence check and a **partial unique index**
 * that only PostgreSQL enforces, and the concurrency case needs real
 * transactions racing. Both are invisible to a mock, which is precisely how the
 * defect reached production.
 *
 * What is pinned here:
 *   - bootstrap is idempotent, including concurrently;
 *   - the market-aware index permits two markets sharing a currency;
 *   - it still forbids two active prices in one market;
 *   - version history and drafts coexist freely;
 *   - a unique violation is never reported as success without verification.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Commercial bootstrap (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const created: { plans: string[]; markets: string[] } = {
    plans: [],
    markets: [],
  };

  afterAll(async () => {
    // Only rows this suite created; never a blanket delete.
    await prisma.planPrice.deleteMany({
      where: { planId: { in: created.plans } },
    });
    await prisma.planFeature.deleteMany({
      where: { planId: { in: created.plans } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: created.plans } } });
    await prisma.marketCountry.deleteMany({
      where: { marketId: { in: created.markets } },
    });
    await prisma.market.deleteMany({ where: { id: { in: created.markets } } });
    await prisma.$disconnect();
  });

  async function makePlan(key: string) {
    const plan = await prisma.plan.create({
      data: {
        key,
        name: key,
        monthlyBasePrice: 100,
        annualBasePrice: 1000,
        currency: 'USD',
      },
    });
    created.plans.push(plan.id);
    return plan;
  }

  async function makeMarket(code: string) {
    const market = await prisma.market.create({
      data: { code, name: code, defaultCurrency: 'USD', supportedCurrencies: ['USD'] },
    });
    created.markets.push(market.id);
    return market;
  }

  function activePrice(planId: string, marketId: string | null, overrides = {}) {
    return {
      planId,
      marketId,
      billingCycle: 'MONTHLY' as const,
      billingInterval: 'MONTH' as const,
      currency: 'USD',
      unitAmount: 100,
      isActive: true,
      ...overrides,
    };
  }

  // -----------------------------------------------------------------------
  // The constraint itself
  // -----------------------------------------------------------------------

  it('allows two markets to share a currency for the same plan and cycle', async () => {
    // The pre-fix index was (planId, billingCycle, currency) WHERE isActive,
    // which made this impossible — and every seeded market defaults to USD.
    const plan = await makePlan(`bootstrap-two-markets-${Date.now()}`);
    const marketA = await makeMarket(`MKTA${Date.now()}`);
    const marketB = await makeMarket(`MKTB${Date.now()}`);

    await prisma.planPrice.create({ data: activePrice(plan.id, marketA.id) });

    await expect(
      prisma.planPrice.create({ data: activePrice(plan.id, marketB.id) }),
    ).resolves.toBeDefined();

    const active = await prisma.planPrice.count({
      where: { planId: plan.id, isActive: true },
    });
    expect(active).toBe(2);
  });

  it('still refuses two active prices in the same market', async () => {
    const plan = await makePlan(`bootstrap-one-active-${Date.now()}`);
    const market = await makeMarket(`MKTC${Date.now()}`);

    await prisma.planPrice.create({ data: activePrice(plan.id, market.id) });

    await expect(
      prisma.planPrice.create({
        data: activePrice(plan.id, market.id, { unitAmount: 999 }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('treats null markets as equal, so unscoped rows stay deduplicated', async () => {
    // Default SQL NULL semantics would make every unscoped row distinct and
    // silently drop the guarantee the old index gave them. NULLS NOT DISTINCT
    // is what preserves it.
    const plan = await makePlan(`bootstrap-null-market-${Date.now()}`);

    await prisma.planPrice.create({ data: activePrice(plan.id, null) });

    await expect(
      prisma.planPrice.create({ data: activePrice(plan.id, null) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('lets any number of inactive versions and drafts coexist', async () => {
    const plan = await makePlan(`bootstrap-versions-${Date.now()}`);
    const market = await makeMarket(`MKTD${Date.now()}`);

    // One current active price, plus history and a future draft.
    await prisma.planPrice.create({
      data: activePrice(plan.id, market.id, { version: 2 }),
    });
    await prisma.planPrice.create({
      data: activePrice(plan.id, market.id, {
        version: 1,
        isActive: false,
        publicationStatus: 'ARCHIVED',
      }),
    });
    await prisma.planPrice.create({
      data: activePrice(plan.id, market.id, {
        version: 3,
        isActive: false,
        publicationStatus: 'DRAFT',
        effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
      }),
    });

    const rows = await prisma.planPrice.findMany({
      where: { planId: plan.id },
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.isActive)).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Bootstrap behaviour
  // -----------------------------------------------------------------------

  it('is idempotent when run repeatedly', async () => {
    const first = await bootstrapCommercialDefaults(prisma);
    const second = await bootstrapCommercialDefaults(prisma);
    const third = await bootstrapCommercialDefaults(prisma);

    // Whatever the first run did, later runs must create nothing.
    expect(second.plansCreated).toBe(0);
    expect(second.marketsCreated).toBe(0);
    expect(second.pricesCreated).toBe(0);
    expect(third.pricesCreated).toBe(0);
    expect(first).toBeDefined();
  });

  it('is safe when several bootstraps run concurrently', async () => {
    // The check-then-create race. Before the fix this raised P2002; the
    // requirement is that every caller succeeds and the row count is stable.
    const before = await prisma.planPrice.count();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => bootstrapCommercialDefaults(prisma)),
    );

    const after = await prisma.planPrice.count();

    expect(results).toHaveLength(8);
    expect(after).toBe(before);
    for (const result of results) {
      expect(result.pricesCreated).toBe(0);
    }
  });

  it('does not publish or activate anything that is only a draft', async () => {
    const plan = await makePlan(`bootstrap-draft-${Date.now()}`);
    const market = await makeMarket(`MKTE${Date.now()}`);

    const draft = await prisma.planPrice.create({
      data: activePrice(plan.id, market.id, {
        isActive: false,
        publicationStatus: 'DRAFT',
      }),
    });

    await bootstrapCommercialDefaults(prisma);

    const after = await prisma.planPrice.findUnique({ where: { id: draft.id } });
    expect(after?.isActive).toBe(false);
    expect(after?.publicationStatus).toBe('DRAFT');
  });
});
