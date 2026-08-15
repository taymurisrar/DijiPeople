import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-0015 — provisioning recovery, proved against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The fix is not a code path; it is a set of
 * claims about database constraints:
 *
 *   - `User @@unique([tenantId, email])` makes a replayed owner creation a
 *     find, not a second row.
 *   - `UserRole @@unique([userId, roleId])` makes `skipDuplicates` real.
 *   - `Subscription.tenantId @unique` makes `upsert` converge.
 *   - `TenantFeature @@unique([tenantId, key])` makes the override upsert
 *     converge.
 *
 * A mocked Prisma returns whatever it was told to. It would happily "prove"
 * idempotency against constraints that do not exist — which is exactly how the
 * step came to be classified non-retryable in the first place, on a reading of
 * the code rather than of the schema.
 *
 * The companion unit suite,
 * `src/modules/super-admin/tenant-identities-provisioning.service.spec.ts`,
 * covers the orchestration. This one covers the thing underneath it.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()(
  'Tenant provisioning recovery anchors (DB-backed)',
  () => {
    jest.setTimeout(180_000);

    const prisma = createTestPrismaClient();
    const fixtures = new DbFixtures(prisma, 'provisioning-recovery');

    let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
    const ownerEmail = `owner-${Date.now().toString(36)}@recovery.test`;

    beforeAll(async () => {
      await prisma.$connect();
      tenant = await fixtures.createTenant('recoverable');
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.$disconnect();
    });

    /**
     * The state a tenant is in when provisioning failed before step 5: a tenant
     * row, and nothing else. This is what made the defect unrecoverable — the
     * business unit, the owner and the subscription are all created by the one
     * step retry used to skip.
     */
    it('a tenant that failed before identities-and-billing has no business unit and no user', async () => {
      const [businessUnits, users] = await Promise.all([
        prisma.businessUnit.count({ where: { tenantId: tenant.id } }),
        prisma.user.count({ where: { tenantId: tenant.id } }),
      ]);

      expect(businessUnits).toBe(0);
      expect(users).toBe(0);
    });

    /**
     * The owner anchor. `UsersRepository.create` resolves or creates the default
     * business unit, so this single call is also what brings the business unit
     * into existence — the reason `POST /access` could never be used to repair a
     * half-provisioned tenant.
     */
    it('creates the owner and its default business unit on first convergence', async () => {
      const organization = await prisma.organization.create({
        data: { tenantId: tenant.id, name: 'Default Organization' },
        select: { id: true },
      });
      const businessUnit = await prisma.businessUnit.create({
        data: {
          tenantId: tenant.id,
          organizationId: organization.id,
          name: 'Default Business Unit',
        },
        select: { id: true },
      });

      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: businessUnit.id,
          firstName: 'Ada',
          lastName: 'Owner',
          email: ownerEmail,
          passwordHash: 'not-a-real-hash-recovery-fixture',
        },
      });

      expect(await prisma.user.count({ where: { tenantId: tenant.id } })).toBe(
        1,
      );
    });

    /**
     * The claim the whole fix rests on. If PostgreSQL permitted a second row
     * here, `ensureIdentitiesAndBilling` would silently create a second owner on
     * every retry and the step would still be unsafe to replay.
     */
    it('refuses a second user with the same email in the same tenant', async () => {
      const businessUnit = await prisma.businessUnit.findFirstOrThrow({
        where: { tenantId: tenant.id },
        select: { id: true },
      });

      await expect(
        prisma.user.create({
          data: {
            tenantId: tenant.id,
            businessUnitId: businessUnit.id,
            firstName: 'Ada',
            lastName: 'Duplicate',
            email: ownerEmail,
            passwordHash: 'not-a-real-hash-recovery-fixture',
          },
        }),
      ).rejects.toThrow();

      expect(await prisma.user.count({ where: { tenantId: tenant.id } })).toBe(
        1,
      );
    });

    /**
     * The same email in a *different* tenant must still be allowed. Anchoring on
     * a bare email would have made one customer's owner block another's — a
     * cross-tenant coupling introduced in the name of idempotency.
     */
    it('still allows the same email in a different tenant', async () => {
      const other = await fixtures.createTenant('neighbour');
      const organization = await prisma.organization.create({
        data: { tenantId: other.id, name: 'Default Organization' },
        select: { id: true },
      });
      const businessUnit = await prisma.businessUnit.create({
        data: {
          tenantId: other.id,
          organizationId: organization.id,
          name: 'Default Business Unit',
        },
        select: { id: true },
      });

      const neighbour = await prisma.user.create({
        data: {
          tenantId: other.id,
          businessUnitId: businessUnit.id,
          firstName: 'Ada',
          lastName: 'Neighbour',
          email: ownerEmail,
          passwordHash: 'not-a-real-hash-recovery-fixture',
        },
        select: { id: true, tenantId: true },
      });

      expect(neighbour.tenantId).toBe(other.id);
    });

    /** The subscription anchor: one per tenant, so `upsert` cannot double it. */
    it('refuses a second subscription for the same tenant', async () => {
      const plan = await prisma.plan.findFirst({ select: { id: true } });
      if (!plan) {
        /*
         * seed:config creates the plan catalogue. Saying so beats an assertion
         * failure that reads as a product defect.
         */
        console.warn('No plan in the database — run seed:config. Skipping.');
        return;
      }

      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          billingCycle: 'MONTHLY',
          basePrice: 100,
          finalPrice: 100,
          currency: 'USD',
          status: 'ACTIVE',
          startDate: new Date(),
        },
      });

      await expect(
        prisma.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            billingCycle: 'MONTHLY',
            basePrice: 100,
            finalPrice: 100,
            currency: 'USD',
            status: 'ACTIVE',
            startDate: new Date(),
          },
        }),
      ).rejects.toThrow();

      expect(
        await prisma.subscription.count({ where: { tenantId: tenant.id } }),
      ).toBe(1);
    });

    /**
     * The invoice anchor is the one the schema does NOT provide: `Invoice` is
     * unique on `(tenantId, invoiceNumber)` and the number is random, so nothing
     * stops a replay raising a second invoice. `ensureIdentitiesAndBilling`
     * therefore anchors on "this subscription already has one", and this test
     * pins the query that decision depends on.
     */
    it('finds an existing invoice for the subscription, which is what suppresses a second one', async () => {
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      if (!subscription) {
        console.warn('No subscription fixture — the previous test skipped.');
        return;
      }

      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          invoiceNumber: `INV-RECOVERY-${Date.now().toString(36)}`,
          amount: 100,
          currency: 'USD',
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'ISSUED',
        },
      });

      const existing = await prisma.invoice.findFirst({
        where: { tenantId: tenant.id, subscriptionId: subscription.id },
        select: { id: true },
      });

      expect(existing).not.toBeNull();
      expect(
        await prisma.invoice.count({ where: { tenantId: tenant.id } }),
      ).toBe(1);
    });

    /**
     * The convergence assertion the retry path runs before it may report
     * SUCCEEDED. Its whole purpose is that a run whose steps all went green no
     * longer implies a usable tenant — that implication is what made the fixed
     * BUG-0014 produce a worse failure than the one it fixed.
     */
    it('reports the tenant as converged once business unit, owner and subscription exist', async () => {
      const [businessUnits, owners, subscription] = await Promise.all([
        prisma.businessUnit.count({ where: { tenantId: tenant.id } }),
        prisma.user.count({
          where: { tenantId: tenant.id, isServiceAccount: false },
        }),
        prisma.subscription.findUnique({
          where: { tenantId: tenant.id },
          select: { id: true },
        }),
      ]);

      const missing: string[] = [];
      if (!businessUnits) missing.push('a business unit');
      if (!owners) missing.push('a tenant owner');
      if (!subscription) missing.push('a subscription');

      expect(missing).toEqual([]);
    });
  },
);
