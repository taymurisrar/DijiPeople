import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';
import {
  GLOBAL_ATTEMPTS_BEFORE_LOCK,
  mirrorPasswordToIdentity,
  registerIdentityFailure,
  registerIdentitySuccess,
  resolveLoginCredential,
} from '../src/modules/users/identity.service';

/**
 * Which credential a sign-in is checked against, against real PostgreSQL.
 *
 * This is the half of the auth split that changes what happens when somebody
 * types their password. Everything else in TASK-0009 has been additive; this is
 * the first change where getting it wrong means people cannot sign in.
 *
 * Four properties, each of which is a way it could go wrong:
 *
 *   1. the identity's hash wins when there is one — otherwise the whole
 *      migration achieves nothing;
 *   2. the `User` hash is still used when there is no identity — otherwise a
 *      backfill that has not run yet locks people out;
 *   3. a suspended identity cannot sign in anywhere, whatever the workspace
 *      account says;
 *   4. the global lock is *additional* to the tenant's, so naming a tenant is
 *      not a way around it.
 *
 * `AuthService.validateCredentials` is not driven directly here: it needs the
 * whole Nest graph, tenant resolution, cookies and audit. What is tested is the
 * decision it delegates — `resolveLoginCredential` — which is where the change
 * actually lives.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();
const PASSWORD = 'the-password-they-actually-know';
const STALE_PASSWORD = 'the-one-left-on-the-user-row';

describeWithDatabase()('Identity-backed login (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `login-${NOW}`);

  let tenants: FixtureTenantPair;
  const userIds: string[] = [];
  const identityIds: string[] = [];

  async function makeUser(options: {
    email: string;
    userPasswordHash: string;
    identity?: { passwordHash: string; status?: 'ACTIVE' | 'SUSPENDED' };
  }) {
    let identityId: string | null = null;
    if (options.identity) {
      const identity = await prisma.identity.create({
        data: {
          email: options.email,
          passwordHash: options.identity.passwordHash,
          status: options.identity.status ?? 'ACTIVE',
        },
        select: { id: true },
      });
      identityIds.push(identity.id);
      identityId = identity.id;
    }

    const user = await prisma.user.create({
      data: {
        tenantId: tenants.a.id,
        businessUnitId: tenants.a.businessUnitId,
        firstName: 'Login',
        lastName: 'Subject',
        email: options.email,
        passwordHash: options.userPasswordHash,
        identityId,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { userId: user.id, identityId };
  }

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
    await prisma.identity.deleteMany({ where: { id: { in: identityIds } } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('checks the password against the identity, not the workspace account', async () => {
    const { userId } = await makeUser({
      email: `identity-wins-${NOW}@dijipeople.test`,
      userPasswordHash: await bcrypt.hash(STALE_PASSWORD, 10),
      identity: { passwordHash: await bcrypt.hash(PASSWORD, 10) },
    });

    const credential = await resolveLoginCredential(prisma, userId);

    expect(credential?.source).toBe('IDENTITY');
    /*
     * The two hashes are deliberately different passwords. If the resolver
     * quietly returned the `User` copy the source would still say IDENTITY on
     * a careless implementation — comparing the actual password is what makes
     * this assertion mean something.
     */
    await expect(
      bcrypt.compare(PASSWORD, credential!.passwordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare(STALE_PASSWORD, credential!.passwordHash),
    ).resolves.toBe(false);
  });

  it('falls back to the workspace account when the backfill has not reached it', async () => {
    const { userId } = await makeUser({
      email: `no-identity-${NOW}@dijipeople.test`,
      userPasswordHash: await bcrypt.hash(PASSWORD, 10),
    });

    const credential = await resolveLoginCredential(prisma, userId);

    /*
     * Not dead code. `identityId` is nullable until the contract phase, so a
     * deployment where the code has shipped and the backfill has not must still
     * authenticate. Removing this fallback turns a migration ordering problem
     * into every user being locked out.
     */
    expect(credential?.source).toBe('USER');
    await expect(
      bcrypt.compare(PASSWORD, credential!.passwordHash),
    ).resolves.toBe(true);
  });

  it('refuses a suspended identity however healthy the workspace account is', async () => {
    const { userId } = await makeUser({
      email: `suspended-${NOW}@dijipeople.test`,
      // The workspace account is perfectly usable and knows the password.
      userPasswordHash: await bcrypt.hash(PASSWORD, 10),
      identity: {
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        status: 'SUSPENDED',
      },
    });

    /*
     * Null, not a credential that happens to fail. Returning the `User` hash
     * here would make suspension a suggestion: the person would keep signing in
     * everywhere, and the only sign of it would be an admin screen saying
     * "suspended".
     */
    await expect(resolveLoginCredential(prisma, userId)).resolves.toBeNull();
  });

  it('locks the person globally after enough failures, and clears on success', async () => {
    const { userId, identityId } = await makeUser({
      email: `global-lock-${NOW}@dijipeople.test`,
      userPasswordHash: await bcrypt.hash(PASSWORD, 10),
      identity: { passwordHash: await bcrypt.hash(PASSWORD, 10) },
    });

    for (let i = 0; i < GLOBAL_ATTEMPTS_BEFORE_LOCK - 1; i += 1) {
      await registerIdentityFailure(prisma, identityId!);
    }

    // One short of the threshold: still open.
    let credential = await resolveLoginCredential(prisma, userId);
    expect(credential?.identityLockedUntil).toBeNull();

    await registerIdentityFailure(prisma, identityId!);

    credential = await resolveLoginCredential(prisma, userId);
    expect(credential?.identityLockedUntil).not.toBeNull();
    expect(credential!.identityLockedUntil!.getTime()).toBeGreaterThan(
      Date.now(),
    );

    const afterLock = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId! },
      select: { failedLoginAttempts: true },
    });
    /*
     * The counter resets with the lock. Without that, a single failure after
     * the lock expires re-locks immediately and the account is effectively
     * permanent — the same reasoning as the per-tenant counter.
     */
    expect(afterLock.failedLoginAttempts).toBe(0);

    await registerIdentitySuccess(prisma, identityId!);

    credential = await resolveLoginCredential(prisma, userId);
    expect(credential?.identityLockedUntil).toBeNull();
  });

  it('swallows bookkeeping failures rather than turning them into errors', async () => {
    /*
     * A wrong password must produce "invalid credentials", never a 500. If the
     * counter update can throw, an attacker learns which addresses exist by
     * watching the status code change.
     */
    await expect(
      registerIdentityFailure(prisma, 'an-identity-that-does-not-exist'),
    ).resolves.toBeUndefined();
    await expect(
      registerIdentitySuccess(prisma, 'an-identity-that-does-not-exist'),
    ).resolves.toBeUndefined();
  });

  it('keeps working after a password change, which is the whole point of the mirror', async () => {
    const { userId, identityId } = await makeUser({
      email: `changed-${NOW}@dijipeople.test`,
      userPasswordHash: await bcrypt.hash('original', 10),
      identity: { passwordHash: await bcrypt.hash('original', 10) },
    });

    const nextHash = await bcrypt.hash('chosen-by-the-person', 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash },
    });
    await mirrorPasswordToIdentity(prisma, userId, nextHash);

    /*
     * The end-to-end statement of why WP-04's two halves are ordered the way
     * they are: change the password, and the credential login now reads is the
     * new one. Land the read before the mirror and this test is how you find
     * out — except in production, from the person who cannot sign in.
     */
    const credential = await resolveLoginCredential(prisma, userId);
    expect(credential?.source).toBe('IDENTITY');
    await expect(
      bcrypt.compare('chosen-by-the-person', credential!.passwordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare('original', credential!.passwordHash),
    ).resolves.toBe(false);

    const identity = await prisma.identity.findUniqueOrThrow({
      where: { id: identityId! },
      select: { passwordChangedAt: true },
    });
    expect(identity.passwordChangedAt).not.toBeNull();
  });
});
