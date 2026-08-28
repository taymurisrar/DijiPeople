import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';
import { identityHasUsableCredential } from '../src/modules/users/identity.service';

/**
 * Adding somebody to a second workspace, against real PostgreSQL.
 *
 * The owner's decision (OD-01) was *"an existing identity made owner of a
 * second workspace reuses its credentials with no activation step"*, and the
 * brief asks for the same: *"if the Owner identity already exists, do not
 * unnecessarily force password recreation."*
 *
 * **The trap is the test used to decide.** "Does an identity exist" is the
 * obvious question and the wrong one: both provisioning paths call
 * `ensureIdentityForEmail` with an unguessable placeholder, so an identity can
 * exist for somebody who has never set a password and cannot sign in anywhere.
 * Reusing *that* means creating an ACTIVE account nobody can open, while
 * suppressing the activation email that was their only way in — a person
 * silently locked out of a workspace somebody was told they now have.
 *
 * The right question is "has this person activated somewhere", and the evidence
 * is an ACTIVE `User` in another tenant: accounts are created INVITED and only
 * become ACTIVE when an invitation is accepted and a password chosen.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();

describeWithDatabase()('Second workspace for an identity (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `second-${NOW}`);

  let tenants: FixtureTenantPair;
  const identityIds: string[] = [];
  const userIds: string[] = [];

  async function makeIdentity(address: string) {
    const identity = await prisma.identity.create({
      data: { email: address, passwordHash: 'placeholder-nobody-knows' },
      select: { id: true },
    });
    identityIds.push(identity.id);
    return identity.id;
  }

  async function makeAccount(
    identityId: string,
    tenant: { id: string; businessUnitId: string },
    address: string,
    status: 'ACTIVE' | 'INVITED' | 'DISABLED',
  ) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Second',
        lastName: 'Workspace',
        email: address,
        passwordHash: 'not-a-real-hash',
        identityId,
        status,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
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

  it('treats somebody with an active account elsewhere as already credentialled', async () => {
    const address = `activated-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);
    await makeAccount(identityId, tenants.a, address, 'ACTIVE');

    await expect(
      identityHasUsableCredential(prisma, identityId, tenants.b.id),
    ).resolves.toBe(true);
  });

  it('does NOT treat a never-activated identity as credentialled', async () => {
    /*
     * The trap, asserted directly. This identity exists — a previous
     * provisioning created it — and its password is a placeholder nobody knows.
     * Reusing it would create an ACTIVE account in the second workspace that
     * the person cannot open, with no activation email sent.
     */
    const address = `never-activated-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);
    await makeAccount(identityId, tenants.a, address, 'INVITED');

    await expect(
      identityHasUsableCredential(prisma, identityId, tenants.b.id),
    ).resolves.toBe(false);
  });

  it('does not count a disabled account as evidence of a working credential', async () => {
    /*
     * They activated once and were then revoked. Whether that credential still
     * works is not something a disabled row can answer, and guessing generously
     * produces the same locked-out person as the case above.
     */
    const address = `revoked-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);
    await makeAccount(identityId, tenants.a, address, 'DISABLED');

    await expect(
      identityHasUsableCredential(prisma, identityId, tenants.b.id),
    ).resolves.toBe(false);
  });

  it('does not let the workspace being created count as its own evidence', async () => {
    /*
     * Without `excludeTenantId` the account just created in this tenant would
     * answer the question about itself. On a path that creates the row before
     * asking, every new account would look pre-credentialled and nobody would
     * ever receive an activation email again.
     */
    const address = `self-evidence-${NOW}@dijipeople.test`;
    const identityId = await makeIdentity(address);
    await makeAccount(identityId, tenants.b, address, 'ACTIVE');

    await expect(
      identityHasUsableCredential(prisma, identityId, tenants.b.id),
    ).resolves.toBe(false);

    // Without the exclusion, the same data says yes — which is the bug.
    await expect(identityHasUsableCredential(prisma, identityId)).resolves.toBe(
      true,
    );
  });

  it('says no for an identity with no accounts at all', async () => {
    const identityId = await makeIdentity(`orphan-${NOW}@dijipeople.test`);

    await expect(
      identityHasUsableCredential(prisma, identityId, tenants.a.id),
    ).resolves.toBe(false);
  });
});
