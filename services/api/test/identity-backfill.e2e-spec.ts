import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';

/**
 * The Identity backfill, run as the SQL that actually ships.
 *
 * This suite reads `migration.sql` off disk and executes it, rather than
 * re-implementing the logic in TypeScript. A test that reimplements a migration
 * tests the reimplementation: the two drift, and the one that runs in
 * production is the one nobody exercised.
 *
 * What is being protected is a decision with a victim. The owner decided that
 * the same email in two tenants is one person (ITEM-0062). Where those rows
 * carry different password hashes — four of the five duplicates in the
 * development database do — merging them means one of those passwords stops
 * working. The rule is "keep the credential they most recently signed in with",
 * and the whole value of that rule is that it is deterministic and about the
 * human rather than about row order.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const BACKFILL_SQL = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260820100000_identity_backfill',
    'migration.sql',
  ),
  'utf8',
);

const NOW = Date.now();
const CHOSEN_HASH = 'hash-from-the-most-recent-login';
const DISCARDED_HASH = 'hash-from-the-account-they-stopped-using';

describeWithDatabase()('Identity backfill (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `backfill-${NOW}`);

  let tenants: FixtureTenantPair;
  const userIds: string[] = [];
  const emails: string[] = [];

  async function makeUser(
    tenant: { id: string; businessUnitId: string },
    email: string,
    overrides: {
      passwordHash: string;
      lastLoginAt?: Date | null;
      failedLoginAttempts?: number;
      lockedUntil?: Date | null;
    },
  ) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Backfill',
        lastName: 'Subject',
        email,
        passwordHash: overrides.passwordHash,
        lastLoginAt: overrides.lastLoginAt ?? null,
        failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
        lockedUntil: overrides.lockedUntil ?? null,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    if (!emails.includes(email.toLowerCase())) emails.push(email.toLowerCase());
    return user;
  }

  /** The shipped SQL, exactly as it will run. */
  async function runBackfill() {
    await prisma.$executeRawUnsafe(BACKFILL_SQL);
  }

  /**
   * Just the guard at the end of the migration, so it can be aimed at a state
   * the full script would have already fixed.
   */
  const GUARD_SQL = BACKFILL_SQL.slice(BACKFILL_SQL.indexOf('DO $$'));

  beforeAll(async () => {
    await prisma.$connect();
    tenants = await fixtures.createTenantPair();
  });

  afterAll(async () => {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { identityId: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.identity.deleteMany({ where: { email: { in: emails } } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('keeps the credential from the account most recently signed in to', async () => {
    const email = `merged-${NOW}@dijipeople.test`;

    // The account they abandoned: signed in longer ago, different password.
    await makeUser(tenants.a, email, {
      passwordHash: DISCARDED_HASH,
      lastLoginAt: new Date('2026-01-01T00:00:00Z'),
    });
    // The account they actually use.
    await makeUser(tenants.b, email, {
      passwordHash: CHOSEN_HASH,
      lastLoginAt: new Date('2026-08-01T00:00:00Z'),
    });

    await runBackfill();

    const identity = await prisma.identity.findUniqueOrThrow({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    /*
     * The assertion the whole migration exists to get right. Picking the other
     * row is not a crash — it is a person who can no longer sign in anywhere,
     * discovered by them rather than by us.
     */
    expect(identity.passwordHash).toBe(CHOSEN_HASH);

    const linked = await prisma.user.findMany({
      where: { email },
      select: { identityId: true },
    });
    expect(linked).toHaveLength(2);
    // Both workspace accounts, one person.
    expect(linked.every((u) => u.identityId === identity.id)).toBe(true);
  });

  it('breaks a tie on a null last login rather than at random', async () => {
    const email = `never-signed-in-${NOW}@dijipeople.test`;

    await makeUser(tenants.a, email, {
      passwordHash: DISCARDED_HASH,
      lastLoginAt: null,
    });
    await makeUser(tenants.b, email, {
      passwordHash: CHOSEN_HASH,
      lastLoginAt: new Date('2026-05-05T00:00:00Z'),
    });

    await runBackfill();

    // NULLS LAST: an account nobody has ever signed in to cannot outrank one
    // they have. Without it PostgreSQL sorts NULL highest on DESC and the
    // unused credential wins.
    const identity = await prisma.identity.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true },
    });
    expect(identity.passwordHash).toBe(CHOSEN_HASH);
  });

  it('carries lockout forward at its most restrictive', async () => {
    const email = `locked-${NOW}@dijipeople.test`;
    const lockedUntil = new Date('2026-12-31T00:00:00Z');

    // The chosen row is the clean one; the lockout is on the other.
    await makeUser(tenants.a, email, {
      passwordHash: DISCARDED_HASH,
      lastLoginAt: new Date('2026-01-01T00:00:00Z'),
      failedLoginAttempts: 9,
      lockedUntil,
    });
    await makeUser(tenants.b, email, {
      passwordHash: CHOSEN_HASH,
      lastLoginAt: new Date('2026-08-01T00:00:00Z'),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await runBackfill();

    const identity = await prisma.identity.findUniqueOrThrow({
      where: { email },
      select: {
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    /*
     * Credential from the chosen row, lockout from whichever row was worst. A
     * merge must not forgive an attack in progress — taking the chosen row's
     * clean counters would hand an attacker a reset by doing nothing but wait
     * for a migration.
     */
    expect(identity.passwordHash).toBe(CHOSEN_HASH);
    expect(identity.failedLoginAttempts).toBe(9);
    expect(identity.lockedUntil?.toISOString()).toBe(lockedUntil.toISOString());
  });

  it('groups by normalised email, matching what login already does', async () => {
    const lower = `casing-${NOW}@dijipeople.test`;
    const upper = `Casing-${NOW}@DijiPeople.test`;

    await makeUser(tenants.a, lower, {
      passwordHash: DISCARDED_HASH,
      lastLoginAt: new Date('2026-01-01T00:00:00Z'),
    });
    await makeUser(tenants.b, upper, {
      passwordHash: CHOSEN_HASH,
      lastLoginAt: new Date('2026-08-01T00:00:00Z'),
    });

    await runBackfill();

    /*
     * One identity, not two. `normalizeEmail` lowercases before every lookup,
     * so these two rows already resolved to the same person at sign-in;
     * grouping them any other way would split someone who was never split.
     */
    const found = await prisma.identity.findMany({
      where: { email: { in: [lower, upper.toLowerCase()] } },
      select: { id: true, email: true, passwordHash: true },
    });
    expect(found).toHaveLength(1);
    expect(found[0].email).toBe(lower);
    expect(found[0].passwordHash).toBe(CHOSEN_HASH);
  });

  it('is re-runnable and does not disturb what it already linked', async () => {
    const email = `idempotent-${NOW}@dijipeople.test`;
    await makeUser(tenants.a, email, {
      passwordHash: CHOSEN_HASH,
      lastLoginAt: new Date('2026-08-01T00:00:00Z'),
    });

    await runBackfill();
    const first = await prisma.identity.findUniqueOrThrow({
      where: { email },
      select: { id: true, passwordHash: true, updatedAt: true },
    });

    await runBackfill();
    const second = await prisma.identity.findUniqueOrThrow({
      where: { email },
      select: { id: true, passwordHash: true, updatedAt: true },
    });

    /*
     * Same row, untouched. `ON CONFLICT DO NOTHING` rather than `DO UPDATE`
     * matters here: once the auth split lands, an identity's password can be
     * changed independently of any `User` row, and a re-run that overwrote it
     * from stale `User` data would silently roll somebody's password back.
     */
    expect(second.id).toBe(first.id);
    expect(second.passwordHash).toBe(first.passwordHash);
    expect(second.updatedAt.toISOString()).toBe(first.updatedAt.toISOString());
  });

  it('leaves no user unlinked, which is what the contract phase needs', async () => {
    await runBackfill();

    const unlinked = await prisma.user.count({
      where: { identityId: null },
    });

    expect(unlinked).toBe(0);
  });

  it('refuses to finish while a user is still unlinked', async () => {
    /*
     * The guard is a backstop, and it is worth being precise about that: given
     * the SQL above, every `User` has a non-null email, every distinct
     * normalised email gets an `Identity`, and the UPDATE matches on the same
     * expression — so **no input was found that makes the full script leave a
     * row behind.** The guard exists for the assumption breaking later, not for
     * a case reachable today.
     *
     * That is exactly the kind of check that quietly stops working, so it is
     * aimed at the state it defends against rather than trusted: a real user,
     * deliberately unlinked, and the guard text lifted from the shipped file.
     */
    const orphan = await makeUser(tenants.a, `orphan-${NOW}@dijipeople.test`, {
      passwordHash: CHOSEN_HASH,
    });

    await expect(prisma.$executeRawUnsafe(GUARD_SQL)).rejects.toThrow(
      /unlinked/i,
    );

    // Linking it makes the same guard pass, so the failure was the data.
    await runBackfill();
    await expect(prisma.$executeRawUnsafe(GUARD_SQL)).resolves.toBeDefined();

    const linked = await prisma.user.findUniqueOrThrow({
      where: { id: orphan.id },
      select: { identityId: true },
    });
    expect(linked.identityId).not.toBeNull();
  });
});
