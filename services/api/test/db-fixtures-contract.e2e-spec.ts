import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * The fixture layer's own contract, proved against a real database.
 *
 * Every other database-backed suite now builds its data through `DbFixtures`
 * rather than adopting whatever `seed:demo` left behind. That makes this file
 * the foundation the rest stand on, so it is deliberately the cheapest suite in
 * the set: no Nest application, no AppModule, just Prisma and the helper.
 *
 * It exists because of a specific failure. Three suites asked the database for
 * "the first two tenants that have a business unit", `seed:demo` creates one
 * tenant, and so `beforeAll` threw before a single assertion ran — dozens of
 * red tests, all cascading from one unmet precondition, none of them a product
 * defect. See ITEM-0047.
 *
 * What is asserted here is exactly what those suites depend on:
 *
 *   1. a pair is genuinely two tenants, not one reused;
 *   2. each side has the organization and business unit its modules require;
 *   3. names cannot collide between runs;
 *   4. cleanup removes everything, so a suite cannot leak into the next;
 *   5. cleanup survives partial construction — the case that used to produce
 *      `deleteMany({ where: { id: { in: [undefined, undefined] } } })`.
 */
describeWithDatabase()('DbFixtures contract (e2e)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;

  beforeAll(async () => {
    // Prisma 7 has no built-in engine: a driver adapter is mandatory, exactly
    // as `PrismaService` constructs one. Calling `new PrismaClient()` bare
    // throws at construction, which would fail this suite for a reason that has
    // nothing to do with fixtures.
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    // The suite owns this client, so the suite closes it. A Prisma client left
    // connected is one of the handles that kept jest alive after the run — see
    // the open-handle work in ITEM-0047.
    //
    // Guarded: if beforeAll threw, `prisma` is undefined here, and an
    // unguarded call would replace the real error with a TypeError about
    // `$disconnect` — a teardown hiding the failure that caused it.
    await prisma?.$disconnect();
  });

  it('builds two isolated tenants, each with an organization and a business unit', async () => {
    const fixtures = new DbFixtures(prisma, 'contract-pair');

    try {
      const { a, b } = await fixtures.createTenantPair();

      expect(a.id).not.toBe(b.id);
      // Separate customer accounts too: sharing one would hide a leak through
      // the commercial side behind a legitimately shared parent row.
      expect(a.customerAccountId).not.toBe(b.customerAccountId);

      for (const tenant of [a, b]) {
        const organization = await prisma.organization.findFirstOrThrow({
          where: { id: tenant.organizationId },
          select: { tenantId: true },
        });
        expect(organization.tenantId).toBe(tenant.id);

        const businessUnit = await prisma.businessUnit.findFirstOrThrow({
          where: { id: tenant.businessUnitId },
          select: { tenantId: true, organizationId: true },
        });
        expect(businessUnit.tenantId).toBe(tenant.id);
        expect(businessUnit.organizationId).toBe(tenant.organizationId);
      }

      // The precondition the three attendance/gateway suites used to assert by
      // going looking for it. Scoped to the ids this fixture created, because
      // counting every tenant in the database would pass for the wrong reason
      // the moment a seed or a parallel suite adds one.
      const withBusinessUnits = await prisma.tenant.findMany({
        where: {
          id: { in: [a.id, b.id] },
          businessUnits: { some: {} },
        },
        select: { id: true },
      });
      expect(withBusinessUnits).toHaveLength(2);
    } finally {
      await fixtures.cleanup();
    }
  });

  it('generates names two runs cannot collide on', async () => {
    const first = new DbFixtures(prisma, 'contract-names');
    const second = new DbFixtures(prisma, 'contract-names');

    expect(first.name('x')).not.toBe(second.name('x'));
    expect(first.name('x')).toContain('contract-names');
  });

  it('removes everything it created', async () => {
    const fixtures = new DbFixtures(prisma, 'contract-cleanup');
    const { a, b } = await fixtures.createTenantPair();

    await fixtures.cleanup();

    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { id: true },
    });
    expect(tenants).toHaveLength(0);

    const accounts = await prisma.customerAccount.findMany({
      where: { id: { in: [a.customerAccountId, b.customerAccountId] } },
      select: { id: true },
    });
    expect(accounts).toHaveLength(0);

    // Organization and BusinessUnit cascade from Tenant. Asserted rather than
    // assumed: BusinessUnit → Organization is `Restrict`, and a restricted
    // foreign key between two rows that are both being cascaded is exactly the
    // kind of ordering that fails only against a real PostgreSQL.
    const organizations = await prisma.organization.findMany({
      where: { id: { in: [a.organizationId, b.organizationId] } },
      select: { id: true },
    });
    expect(organizations).toHaveLength(0);

    const businessUnits = await prisma.businessUnit.findMany({
      where: { id: { in: [a.businessUnitId, b.businessUnitId] } },
      select: { id: true },
    });
    expect(businessUnits).toHaveLength(0);
  });

  it('cleans up after partial construction without throwing', async () => {
    const fixtures = new DbFixtures(prisma, 'contract-partial');

    // One tenant built, the second never attempted — the state a suite is left
    // in when `beforeAll` throws half-way. Cleanup must still run to completion
    // and must not surface an error that would mask the real failure.
    const only = await fixtures.createTenantWithBusinessUnit('half');

    await expect(fixtures.cleanup()).resolves.toBeUndefined();

    const remaining = await prisma.tenant.findMany({
      where: { id: only.id },
      select: { id: true },
    });
    expect(remaining).toHaveLength(0);
  });

  it('is safe to clean up twice', async () => {
    // afterAll can run after a test already cleaned up, and a second pass must
    // be a no-op rather than a failure that hides the first one.
    const fixtures = new DbFixtures(prisma, 'contract-idempotent');
    await fixtures.createTenantWithBusinessUnit('once');

    await fixtures.cleanup();
    await expect(fixtures.cleanup()).resolves.toBeUndefined();
  });
});
