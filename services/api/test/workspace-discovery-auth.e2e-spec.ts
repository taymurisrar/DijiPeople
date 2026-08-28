import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';
import {
  DISCOVERY_ATTEMPTS_BEFORE_BLOCK,
  listTenantIdsForIdentity,
  verifyIdentityCredential,
} from '../src/modules/users/identity.service';

/**
 * Signing in without naming a workspace — the brief's opening case.
 *
 * A visitor clicks **Login** on `www.dijipeople.com` with no tenant URL in
 * hand. Before TASK-0009 that was impossible: `AuthService` refuses without
 * tenant context, and the same person in two workspaces was two rows with two
 * passwords.
 *
 * The whole security argument of this package is **verify first, then
 * discover**. An endpoint taking an address and answering which workspaces it
 * reaches is a customer-enumeration oracle that no rate limit fixes — feed it a
 * list of company addresses and the answers map the customer base. Requiring
 * the password means the only caller who learns anything is the person the
 * answer is about.
 *
 * So these tests are mostly about what is *not* revealed.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();
const PASSWORD = 'a-password-they-actually-know';

describeWithDatabase()('Workspace discovery by credential (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `discover-${NOW}`);

  let tenants: FixtureTenantPair;
  const identityIds: string[] = [];
  const userIds: string[] = [];

  const email = `discover-${NOW}@dijipeople.test`;

  async function makeIdentity(
    address: string,
    options: { status?: 'ACTIVE' | 'SUSPENDED'; lockedUntil?: Date } = {},
  ) {
    const identity = await prisma.identity.create({
      data: {
        email: address,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        status: options.status ?? 'ACTIVE',
        lockedUntil: options.lockedUntil ?? null,
      },
      select: { id: true },
    });
    identityIds.push(identity.id);
    return identity.id;
  }

  async function joinWorkspace(
    identityId: string,
    tenant: { id: string; businessUnitId: string },
    address: string,
  ) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Discover',
        lastName: 'Subject',
        email: address,
        passwordHash: 'not-a-real-hash',
        identityId,
      },
      select: { id: true },
    });
    userIds.push(user.id);
  }

  beforeAll(async () => {
    await prisma.$connect();
    tenants = await fixtures.createTenantPair();
  });

  afterAll(async () => {
    // Users are deleted outright rather than unlinked first: the `Restrict` FK is released by the delete, and since the contract phase (TASK-0009 WP-09) `identityId` cannot be set to null at all.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.identity.deleteMany({ where: { id: { in: identityIds } } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('returns the identity for the right password, and its workspaces', async () => {
    const identityId = await makeIdentity(email);
    await joinWorkspace(identityId, tenants.a, email);
    await joinWorkspace(identityId, tenants.b, email);

    const verified = await verifyIdentityCredential(
      prisma,
      bcrypt.compare,
      email,
      PASSWORD,
    );
    expect(verified?.identityId).toBe(identityId);

    const tenantIds = await listTenantIdsForIdentity(prisma, identityId);
    expect(tenantIds.sort()).toEqual([tenants.a.id, tenants.b.id].sort());
  });

  it('reveals nothing for an address nobody holds', async () => {
    /*
     * Null, identical to a wrong password. The caller cannot use this endpoint
     * to find out whether an address is a DijiPeople customer, which is the
     * entire reason it takes a password.
     */
    await expect(
      verifyIdentityCredential(
        prisma,
        bcrypt.compare,
        `nobody-${NOW}@dijipeople.test`,
        PASSWORD,
      ),
    ).resolves.toBeNull();
  });

  it('refuses a wrong password without saying so differently', async () => {
    const address = `wrong-password-${NOW}@dijipeople.test`;
    await makeIdentity(address);

    await expect(
      verifyIdentityCredential(prisma, bcrypt.compare, address, 'not-it'),
    ).resolves.toBeNull();
  });

  it('compares a hash even when no identity exists', async () => {
    /*
     * Timing. Skipping the bcrypt compare for an unknown address makes that
     * case measurably faster than a wrong password, and the difference is the
     * same enumeration oracle wearing a stopwatch. Asserted by counting the
     * calls rather than by timing, which would be flaky.
     */
    const compare = jest.fn(async () => false);

    await verifyIdentityCredential(
      prisma,
      compare,
      `absent-${NOW}@dijipeople.test`,
      PASSWORD,
    );

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('refuses a suspended identity that knows its password perfectly well', async () => {
    const address = `suspended-${NOW}@dijipeople.test`;
    await makeIdentity(address, { status: 'SUSPENDED' });

    await expect(
      verifyIdentityCredential(prisma, bcrypt.compare, address, PASSWORD),
    ).resolves.toBeNull();
  });

  it('refuses a locked identity, and does not reset the lock by trying', async () => {
    const address = `locked-${NOW}@dijipeople.test`;
    const lockedUntil = new Date(Date.now() + 60 * 60_000);
    const identityId = await makeIdentity(address, { lockedUntil });

    await expect(
      verifyIdentityCredential(prisma, bcrypt.compare, address, PASSWORD),
    ).resolves.toBeNull();

    /*
     * The correct password must not clear a live lock. Otherwise an attacker
     * who eventually guesses it is rewarded with an unlocked account, and the
     * lockout has protected nothing at the moment it mattered.
     */
    const after = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId },
      select: { lockedUntil: true },
    });
    expect(after.lockedUntil?.getTime()).toBe(lockedUntil.getTime());
  });

  it('bounds guessing without touching the credential the victim signs in with', async () => {
    /*
     * ITEM-0069, and the assertion that fixes it.
     *
     * This endpoint used to count its failures against
     * `Identity.failedLoginAttempts` — the counter that governs real sign-ins —
     * so twenty unauthenticated requests locked a known address out of **every**
     * workspace for an hour. Anybody could run that against anybody.
     *
     * Guessing still has to be bounded: discovery has no tenant, so the
     * per-tenant lockout never sees it. The fix is separation, not removal.
     */
    const address = `counted-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);

    for (let i = 0; i < DISCOVERY_ATTEMPTS_BEFORE_BLOCK; i += 1) {
      await verifyIdentityCredential(prisma, bcrypt.compare, address, 'nope');
    }

    const after = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId },
      select: { discoveryBlockedUntil: true, lockedUntil: true },
    });

    // Discovery is blocked, so guessing through it stops.
    expect(after.discoveryBlockedUntil).not.toBeNull();

    /*
     * And the credential lock is untouched — which is the entire point. The
     * victim can still sign in at their workspace URL. A stranger has cost them
     * the generic login screen for fifteen minutes, not the product.
     */
    expect(after.lockedUntil).toBeNull();
  });

  it('refuses even a correct password while discovery is blocked', async () => {
    const address = `blocked-correct-${NOW}@dijipeople.test`;
    await makeIdentity(address);

    for (let i = 0; i < DISCOVERY_ATTEMPTS_BEFORE_BLOCK; i += 1) {
      await verifyIdentityCredential(prisma, bcrypt.compare, address, 'nope');
    }

    /*
     * Otherwise the block is decorative: an attacker who guesses correctly on
     * attempt eleven would be let straight through.
     */
    await expect(
      verifyIdentityCredential(prisma, bcrypt.compare, address, PASSWORD),
    ).resolves.toBeNull();
  });

  it('clears the discovery counter once the right password arrives', async () => {
    const address = `recovered-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);

    await verifyIdentityCredential(prisma, bcrypt.compare, address, 'nope');
    await verifyIdentityCredential(prisma, bcrypt.compare, address, PASSWORD);

    const after = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId },
      select: { discoveryFailedAttempts: true },
    });
    // Otherwise a few typos over a year eventually block somebody for no reason
    // at all.
    expect(after.discoveryFailedAttempts).toBe(0);
  });

  it('does not let a correct password lift a credential lock', async () => {
    /*
     * The mirror of the rule above, and the more important half. Somebody who
     * eventually guesses right must not be rewarded by having the lock lifted —
     * that would mean the lockout protected nothing at the exact moment it
     * mattered.
     */
    const address = `still-locked-${NOW}@dijipeople.test`;
    const lockedUntil = new Date(Date.now() + 60 * 60_000);
    const identityId = await makeIdentity(address, { lockedUntil });

    await expect(
      verifyIdentityCredential(prisma, bcrypt.compare, address, PASSWORD),
    ).resolves.toBeNull();

    const after = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId },
      select: { lockedUntil: true },
    });
    expect(after.lockedUntil?.getTime()).toBe(lockedUntil.getTime());
  });
});
