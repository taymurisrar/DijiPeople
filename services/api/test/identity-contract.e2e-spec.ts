import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';

/**
 * The contract phase — every workspace account belongs to a person.
 *
 * **This suite replaces `identity-backfill.e2e-spec.ts`, which the contract
 * phase made unrunnable rather than merely out of date.** That suite created
 * `User` rows with a null `identityId` — the state the backfill exists to fill
 * — and after `20260829090000_identity_contract` no database will hold such a
 * row and no Prisma client will build one. It could not be adapted; the state
 * it exercised has stopped existing, which is the outcome it was working
 * toward.
 *
 * Its seven tests covered the merge rules: which credential survives when the
 * same address exists in two tenants, how a tie on `lastLoginAt` breaks,
 * lockout carried forward at its most restrictive, grouping by normalised
 * email, re-runnability, and the guard that refuses to finish half-linked.
 * Those rules are not deleted from the record — they are in
 * `20260820100000_identity_backfill/migration.sql`, which explains each one at
 * length, and in TASK-0009. The backfill has run everywhere it will ever run.
 *
 * What is worth guarding from here is the invariant it produced, because that
 * one is permanent and reverting the contract migration would break it
 * silently.
 */

function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();

describeWithDatabase()('Identity contract (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `contract-${NOW}`);

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('holds no user without an identity', async () => {
    const unlinked = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT COUNT(*)::bigint AS count FROM "User" WHERE "identityId" IS NULL',
    );
    expect(Number(unlinked[0].count)).toBe(0);
  });

  it('refuses a user with no identity at the database, not only in the client', async () => {
    /*
     * The assertion that matters, and the reason it is raw SQL.
     *
     * Prisma's generated types already refuse to build such a row, so a test
     * written through the client would be checking the type system rather than
     * the database — and a `db push` against a stale schema, or a rolled-back
     * migration, would leave the column nullable with the types still saying
     * otherwise. This goes underneath the client and asks the column.
     */
    const tenant = await fixtures.createTenantWithBusinessUnit('probe');
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id","tenantId","businessUnitId","firstName","lastName","email","passwordHash","updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Contract', 'Probe', $3, 'not-a-real-hash', now())`,
        tenant.id,
        tenant.businessUnitId,
        `contract-probe-${NOW}@dijipeople.test`,
      ),
    ).rejects.toThrow(/identityId/i);
  });

  it('lets one identity reach several workspaces, which is what this was for', async () => {
    /*
     * The capability the three phases existed to deliver, asserted end to end
     * rather than inferred from the schema: one credential, two tenants, two
     * `User` rows, one `Identity`.
     */
    const pair: FixtureTenantPair = await fixtures.createTenantPair();
    const { a, b } = pair;
    const email = `contract-shared-${NOW}@dijipeople.test`;

    const identity = await prisma.identity.create({
      data: { email, passwordHash: 'placeholder-nobody-knows' },
      select: { id: true },
    });

    for (const tenant of [a, b]) {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: tenant.businessUnitId,
          firstName: 'Shared',
          lastName: 'Person',
          email,
          passwordHash: 'not-used-in-this-test',
          identityId: identity.id,
        },
      });
    }

    const reached = await prisma.user.findMany({
      where: { identityId: identity.id },
      select: { tenantId: true },
    });
    expect(new Set(reached.map((row) => row.tenantId))).toEqual(
      new Set([a.id, b.id]),
    );
  });
});
