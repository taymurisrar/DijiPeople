import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * This repository drives Prisma through `@prisma/adapter-pg`, so a bare
 * `new PrismaClient()` throws `PrismaClientInitializationError` — the client
 * requires the adapter it was generated for. `PrismaService` does exactly this;
 * a database-backed test outside Nest has to do it too.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * The reusable database-backed pattern for tenant isolation and constraint
 * behaviour.
 *
 * This suite is small on purpose. It is not an attempt to test tenant isolation
 * across the product — it establishes the *pattern* that module-specific
 * isolation tests copy, and proves the infrastructure works end to end against
 * a real PostgreSQL.
 *
 * Why it must be database-backed: every property here is enforced by
 * PostgreSQL, not by application code. A mocked Prisma returns whatever the
 * mock was told to return, so it can "prove" a foreign key holds when the
 * schema has no such constraint. For RESTRICT, CASCADE, SET NULL, unique
 * constraints and transaction rollback, mocked behaviour is not evidence.
 *
 * Copy this shape for a module:
 *   1. create two tenants with DbFixtures
 *   2. write data under tenant A
 *   3. assert a tenant-B-scoped query cannot read it
 *   4. assert a tenant-B-scoped write cannot mutate it
 *   5. clean up in afterAll
 */
describeWithDatabase()('Tenant isolation and constraint pattern (DB-backed)', () => {
  jest.setTimeout(120_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'isolation-pattern');

  let tenantA: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let tenantB: Awaited<ReturnType<DbFixtures['createTenant']>>;

  beforeAll(async () => {
    await prisma.$connect();
    tenantA = await fixtures.createTenant('a');
    tenantB = await fixtures.createTenant('b');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  describe('tenant scoping', () => {
    it('creates two genuinely distinct tenants', () => {
      expect(tenantA.id).not.toEqual(tenantB.id);
      expect(tenantA.customerAccountId).not.toEqual(tenantB.customerAccountId);
    });

    it('does not return tenant A rows to a tenant-B-scoped query', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: tenantA.id,
          key: fixtures.name('role-a'),
          name: 'Isolation probe',
        },
        select: { id: true },
      });

      // The scoped read every service is supposed to perform.
      const asTenantB = await prisma.role.findFirst({
        where: { id: role.id, tenantId: tenantB.id },
      });
      expect(asTenantB).toBeNull();

      // Same row, correct tenant — proves the row exists and the null above is
      // isolation rather than a missing record.
      const asTenantA = await prisma.role.findFirst({
        where: { id: role.id, tenantId: tenantA.id },
      });
      expect(asTenantA).not.toBeNull();
    });

    it('does not let a tenant-B-scoped write mutate tenant A data', async () => {
      const role = await prisma.role.create({
        data: {
          tenantId: tenantA.id,
          key: fixtures.name('role-write'),
          name: 'Original',
        },
        select: { id: true },
      });

      const result = await prisma.role.updateMany({
        where: { id: role.id, tenantId: tenantB.id },
        data: { name: 'Mutated by the wrong tenant' },
      });

      expect(result.count).toBe(0);

      const unchanged = await prisma.role.findUniqueOrThrow({ where: { id: role.id } });
      expect(unchanged.name).toBe('Original');
    });
  });

  describe('database constraints', () => {
    it('enforces RESTRICT: a customer account cannot be deleted while a tenant references it', async () => {
      await expect(
        prisma.customerAccount.delete({ where: { id: tenantA.customerAccountId } }),
      ).rejects.toThrow();

      // Still there — the constraint blocked the delete rather than cascading.
      const account = await prisma.customerAccount.findUnique({
        where: { id: tenantA.customerAccountId },
      });
      expect(account).not.toBeNull();
    });

    it('enforces a composite unique constraint scoped by tenant', async () => {
      const key = fixtures.name('dup-key');

      await prisma.role.create({ data: { tenantId: tenantA.id, key, name: 'First' } });

      // Same key, same tenant → rejected.
      await expect(
        prisma.role.create({ data: { tenantId: tenantA.id, key, name: 'Duplicate' } }),
      ).rejects.toThrow();

      // Same key, DIFFERENT tenant → allowed. This is the property that makes
      // the uniqueness tenant-scoped rather than global, and the one a bare
      // unique constraint would silently break.
      const other = await prisma.role.create({
        data: { tenantId: tenantB.id, key, name: 'Same key, other tenant' },
      });
      expect(other.id).toBeTruthy();
    });

    it('rolls the whole transaction back when one statement fails', async () => {
      const key = fixtures.name('tx-role');

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.role.create({ data: { tenantId: tenantA.id, key, name: 'In transaction' } });
          // Same key in the same tenant — violates the composite unique above.
          await tx.role.create({ data: { tenantId: tenantA.id, key, name: 'Conflicts' } });
        }),
      ).rejects.toThrow();

      // The first insert must not have survived. This is the property that
      // makes tenant erasure safe: one transaction, so a failure erases nothing.
      const survivors = await prisma.role.findMany({ where: { tenantId: tenantA.id, key } });
      expect(survivors).toHaveLength(0);
    });
  });
});
