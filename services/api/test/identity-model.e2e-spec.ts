import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';

/**
 * What the `Identity` table actually does, against real PostgreSQL.
 *
 * TASK-0009 WP-02 is the expand phase of a three-part migration — expand,
 * backfill, contract — and its whole job is to add structure that nothing reads
 * yet. That makes it the easiest kind of change to get quietly wrong: the code
 * compiles, no test exercises it, and the mistake surfaces in WP-03 when a
 * backfill hits a constraint nobody checked, or worse in WP-09 when the
 * contract phase cannot run.
 *
 * So this suite asserts the three properties the later packages depend on, and
 * asserts them at the database rather than in the Prisma schema, because a
 * `@relation(onDelete:)` annotation is a claim about a foreign key and the
 * foreign key is what enforces it:
 *
 *   1. email is globally unique — the whole point of the model;
 *   2. deleting an Identity with workspace accounts attached is REFUSED, not
 *      cascaded;
 *   3. deleting a Tenant clears `lastUsedTenantId` rather than deleting the
 *      person who happened to be looking at it last.
 *
 * Property 2 is the one worth having. `Restrict` and `Cascade` are one word
 * apart, and the wrong one turns "you cannot delete this person while they
 * still have accounts" into "deleting this person silently removed their
 * accounts in four tenants".
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();

describeWithDatabase()('Identity model (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `identity-${NOW}`);

  const identityIds: string[] = [];

  /*
   * One pair for the suite, not one per test. `DbFixtures` derives its names
   * from a per-*instance* run id plus a fixed 'a'/'b' suffix, so a second
   * `createTenantPair()` on the same instance regenerates the same slug and the
   * unique index refuses it. Worth stating: the collision reads as "tenant
   * creation is broken", which is nothing like the truth.
   */
  let tenants: FixtureTenantPair;

  async function makeIdentity(email: string, lastUsedTenantId?: string) {
    const identity = await prisma.identity.create({
      data: {
        email,
        passwordHash: 'not-a-real-hash',
        lastUsedTenantId: lastUsedTenantId ?? null,
      },
      select: {
        id: true,
        email: true,
        status: true,
        failedLoginAttempts: true,
      },
    });
    identityIds.push(identity.id);
    return identity;
  }

  beforeAll(async () => {
    await prisma.$connect();
    tenants = await fixtures.createTenantPair();
  });

  afterAll(async () => {
    if (identityIds.length) {
      // Users are deleted outright rather than unlinked first: the `Restrict` FK is released by the delete, and since the contract phase (TASK-0009 WP-09) `identityId` cannot be set to null at all.
      await prisma.user.deleteMany({
        where: { identityId: { in: identityIds } },
      });
      await prisma.identity.deleteMany({ where: { id: { in: identityIds } } });
    }
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('refuses a second identity for the same email', async () => {
    const email = `dup-${NOW}@dijipeople.test`;
    await makeIdentity(email);

    /*
     * The database refuses it, not a pre-check. Two concurrent signups reading
     * "this email is free" and both writing is the whole class of bug a unique
     * index exists to make impossible.
     */
    await expect(makeIdentity(email)).rejects.toThrow();
  });

  it('defaults a new identity to usable and unlocked', async () => {
    const identity = await makeIdentity(`fresh-${NOW}@dijipeople.test`);

    // Not decoration: an identity that arrived SUSPENDED, or with a non-zero
    // attempt count, would lock out every user the backfill links to it.
    expect(identity.status).toBe('ACTIVE');
    expect(identity.failedLoginAttempts).toBe(0);
  });

  it('refuses to delete an identity that still has workspace accounts', async () => {
    const tenant = tenants.a;
    const identity = await makeIdentity(`linked-${NOW}@dijipeople.test`);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Linked',
        lastName: 'Account',
        email: `linked-user-${NOW}@dijipeople.test`,
        passwordHash: 'not-a-real-hash',
        identityId: identity.id,
      },
      select: { id: true },
    });

    /*
     * `onDelete: Restrict`, asserted at the foreign key rather than trusted
     * from the schema annotation. Cascade here would mean deleting a person
     * silently removes their accounts in every tenant they belong to — one word
     * away in the schema, and unrecoverable in production.
     */
    await expect(
      prisma.identity.delete({ where: { id: identity.id } }),
    ).rejects.toThrow();

    const survivor = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { identityId: true },
    });
    expect(survivor.identityId).toBe(identity.id);
  });

  it('clears the last-used preference when that tenant is deleted', async () => {
    const tenant = tenants.b;
    const identity = await makeIdentity(
      `preference-${NOW}@dijipeople.test`,
      tenant.id,
    );

    await prisma.tenant.delete({ where: { id: tenant.id } });

    /*
     * `DbFixtures.cleanup()` will log "cleanup left tenant … behind" for this
     * one at the end of the run. That is expected and not a leak — the test
     * deleted it on purpose, and the fixture reports rather than throws for
     * exactly this reason. The customer account behind it still cleans up; a
     * row count after two consecutive runs is zero.
     */

    /*
     * `SetNull`. The preference is advisory — losing it sends somebody to the
     * workspace picker, which is a correct outcome. `Restrict` here would make
     * a tenant undeletable because somebody once signed into it, and `Cascade`
     * would delete the person.
     */
    const after = await prisma.identity.findUniqueOrThrow({
      where: { id: identity.id },
      select: { lastUsedTenantId: true },
    });
    expect(after.lastUsedTenantId).toBeNull();
  });

  /*
   * This assertion used to run the other way.
   *
   * Written in WP-02 as "leaves every existing user unlinked, which is what
   * expand means" — correct then, because the expand migration only added a
   * nullable column and nothing wrote to it. WP-12 then taught every
   * user-creation path to link, so a seeded database has no unlinked users and
   * the old assertion became factually wrong.
   *
   * Inverted rather than deleted, for the same reason `legal-seed`'s
   * legal-entity check was: the premise expired, the guard did not. What it
   * protects now is the precondition WP-09 depends on — the contract phase
   * makes `identityId` NOT NULL, and every row it cannot fill is a deployment
   * that fails at the worst possible moment.
   */
  /*
   * The "no unlinked user" guard moved, it did not disappear.
   *
   * It was a *precondition* for the contract phase, and the contract phase has
   * landed (WP-09, 2026-08-29): `identityId` is NOT NULL, so Prisma will not
   * even compile `where: { identityId: null }` and the database would reject
   * such a row anyway. A guard whose failure state cannot be represented is not
   * a guard.
   *
   * `identity-contract.e2e-spec.ts` asserts the same invariant where it can
   * still fail — against the column, in raw SQL, underneath the client — which
   * catches a rolled-back migration that the type system would hide.
   */

  it('gives distinct people distinct identities', async () => {
    /*
     * The other half, and the one a careless "just link everything"
     * implementation would break: linking is not merging. Two different
     * addresses must not collapse onto one identity merely because the code
     * that links them ran in the same loop.
     */
    // No `not: null` filter any more — every user has an identity since the
    // contract phase, so the filter would be a no-op that no longer compiles.
    const linkedPeople = await prisma.user.findMany({
      select: { identityId: true },
      distinct: ['identityId'],
    });
    const addresses = await prisma.user.findMany({
      select: { email: true },
      distinct: ['email'],
    });

    expect(linkedPeople.length).toBe(addresses.length);
  });
});
