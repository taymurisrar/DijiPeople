import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  describeWithDatabase,
  DbFixtures,
  type FixtureTenantPair,
} from './helpers/db-fixtures';
import { WorkspaceResolutionService } from '../src/modules/tenant-domains/workspace-resolution.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';

/**
 * One person, two workspaces — against real PostgreSQL.
 *
 * This is the assertion [[ITEM-0062]] was filed for. `listWorkspacesForUser`
 * returned a one-element array **by construction**: it read `user.tenantId`
 * from the session and looked up that one tenant. The workspace picker rendered
 * correctly and could never have anything to pick; the switcher had nowhere to
 * switch to. Neither was unbuilt — both were impossible.
 *
 * The unit spec covers the branching with doubles. What needs a real database
 * is the join itself: two `User` rows in two tenants pointing at one `Identity`,
 * and the query that finds them.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();

describeWithDatabase()('Workspace discovery (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, `discovery-${NOW}`);

  let tenants: FixtureTenantPair;
  let identityId: string;
  const userIds: string[] = [];

  /**
   * The real service over the real client, with only the domain resolver stood
   * in for — hostnames need DNS records this test has no business creating, and
   * they are not what is under test.
   */
  const service = new WorkspaceResolutionService(
    prisma as unknown as PrismaService,
    {
      getPrimaryDomain: async () => null,
      getWorkspaceUrl: async () => 'https://example.dijipeople.test/',
    } as never,
  );

  async function joinWorkspace(
    tenant: { id: string; businessUnitId: string },
    status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
  ) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Multi',
        lastName: 'Workspace',
        email: `multi-${NOW}@dijipeople.test`,
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

    const identity = await prisma.identity.create({
      data: {
        email: `multi-${NOW}@dijipeople.test`,
        passwordHash: 'not-a-real-hash',
      },
      select: { id: true },
    });
    identityId = identity.id;
  });

  afterAll(async () => {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { identityId: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.identity.deleteMany({ where: { id: identityId } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('finds both workspaces from a session scoped to one of them', async () => {
    const userInA = await joinWorkspace(tenants.a);
    await joinWorkspace(tenants.b);

    /*
     * The session is tenant-scoped and stays that way — `tenantId` is still one
     * tenant, `JwtAuthGuard` is untouched, and nothing downstream changes. What
     * the person can now *see* is which of their own workspaces exist.
     */
    const result = await service.listWorkspacesForUser({
      userId: userInA,
      tenantId: tenants.a.id,
    } as AuthenticatedUser);

    const ids = result.workspaces.map((w) => w.tenantId).sort();
    expect(ids).toEqual([tenants.a.id, tenants.b.id].sort());

    // The workspace they are standing in, not an arbitrary one.
    expect(result.defaultWorkspace?.tenantId).toBe(tenants.a.id);
    expect(
      result.workspaces.find((w) => w.tenantId === tenants.a.id)?.isCurrent,
    ).toBe(true);
    expect(
      result.workspaces.find((w) => w.tenantId === tenants.b.id)?.isCurrent,
    ).toBe(false);
  });

  it('hides a workspace the person has been disabled in', async () => {
    /*
     * `User.status` is per tenant by design — disabled at one workspace says
     * nothing about the others. Offering a door that refuses them is worse than
     * not offering it: they click it, get bounced, and have no way to tell
     * whether the fault is theirs.
     */
    await prisma.user.updateMany({
      where: { tenantId: tenants.b.id, identityId },
      data: { status: 'DISABLED' },
    });

    const userInA = userIds[0];
    const result = await service.listWorkspacesForUser({
      userId: userInA,
      tenantId: tenants.a.id,
    } as AuthenticatedUser);

    expect(result.workspaces.map((w) => w.tenantId)).toEqual([tenants.a.id]);

    await prisma.user.updateMany({
      where: { tenantId: tenants.b.id, identityId },
      data: { status: 'ACTIVE' },
    });
  });

  it('reveals nothing about workspaces the identity does not reach', async () => {
    /*
     * A neighbouring tenant with a different person in it. The query joins on
     * `identityId`, so this is really asserting that the join is the filter —
     * if discovery ever widened to "every tenant", this is what would catch it.
     */
    const stranger = await prisma.identity.create({
      data: {
        email: `stranger-${NOW}@dijipeople.test`,
        passwordHash: 'not-a-real-hash',
      },
      select: { id: true },
    });
    const strangerUser = await prisma.user.create({
      data: {
        tenantId: tenants.b.id,
        businessUnitId: tenants.b.businessUnitId,
        firstName: 'Some',
        lastName: 'Stranger',
        email: `stranger-${NOW}@dijipeople.test`,
        passwordHash: 'not-a-real-hash',
        identityId: stranger.id,
      },
      select: { id: true },
    });

    try {
      const result = await service.listWorkspacesForUser({
        userId: strangerUser.id,
        tenantId: tenants.b.id,
      } as AuthenticatedUser);

      // Only their own workspace, never the one the other person also uses.
      expect(result.workspaces.map((w) => w.tenantId)).toEqual([tenants.b.id]);
    } finally {
      await prisma.user.update({
        where: { id: strangerUser.id },
        data: { identityId: null },
      });
      await prisma.user.delete({ where: { id: strangerUser.id } });
      await prisma.identity.delete({ where: { id: stranger.id } });
    }
  });
});
