import {
  PrismaClient,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import { ReportScopeResolver } from '../src/modules/reporting/engine/scope.resolver';
import { ReportQueryExecutor } from '../src/modules/reporting/engine/query-executor';
import { planWhere } from '../src/modules/reporting/engine/query-planner';
import { getDataSource } from '../src/modules/reporting/semantic/data-sources';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';

/**
 * Cross-tenant isolation for the reporting engine, against a real PostgreSQL.
 *
 * This has to be database-backed. The property under test is that a `where`
 * built for tenant A returns no tenant-B row, and a mocked Prisma returns
 * whatever the mock was told to return — it can "prove" isolation holds against
 * a query that has no tenant predicate at all. Only a real database can fail
 * this test for the right reason.
 *
 * It deliberately exercises the engine's own composition — `planWhere` plus
 * `ReportScopeResolver` — rather than going through HTTP. Those two functions
 * are where every reporting query gets its tenant and row predicates, so if
 * they are correct, every surface built on them is correct, and if they are
 * wrong, no amount of controller testing would save it.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** A caller with TENANT-level read on every entity the reporting sources use. */
function tenantScopedUser(
  tenantId: string,
  userId: string,
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  const entities = [
    ENTITY_KEYS.EMPLOYEES,
    ENTITY_KEYS.ATTENDANCE,
    ENTITY_KEYS.LEAVE_REQUESTS,
    ENTITY_KEYS.CANDIDATES,
    ENTITY_KEYS.JOBS,
    ENTITY_KEYS.REPORTS,
    ENTITY_KEYS.DESKTOP_ANALYTICS,
  ];

  return {
    userId,
    tenantId,
    email: `${userId}@example.invalid`,
    roleIds: [],
    // Deliberately NOT an elevated role: `hasElevatedTenantRole` short-circuits
    // to TENANT for global-admin/system-admin, which would make this test pass
    // without exercising the scope path at all.
    roleKeys: ['hr'],
    permissionKeys: ['reports.read', 'employees.read', 'attendance.read'],
    rolePrivileges: entities.map((entityKey) => ({
      entityKey,
      privilege: SecurityPrivilege.READ,
      accessLevel: SecurityAccessLevel.TENANT,
      roleId: 'role-fixture',
    })),
    accessContext: {
      isSystemAdministrator: false,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: '',
      organizationId: '',
      teamIds: [],
      accessibleBusinessUnitIds: [],
      businessUnitSubtreeIds: [],
      canAccessAllBusinessUnits: true,
    },
    ...overrides,
  } as AuthenticatedUser;
}

describeWithDatabase()('Reporting tenant isolation (DB-backed)', () => {
  jest.setTimeout(120_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'reporting-isolation');
  const scope = new ReportScopeResolver();
  const executor = new ReportQueryExecutor(prisma as never);

  let tenants: Awaited<ReturnType<DbFixtures['createTenantPair']>>;
  let userA: AuthenticatedUser;
  let userB: AuthenticatedUser;

  beforeAll(async () => {
    await prisma.$connect();
    tenants = await fixtures.createTenantPair();

    userA = tenantScopedUser(tenants.a.id, 'user-a');
    userB = tenantScopedUser(tenants.b.id, 'user-b');

    // Three employees in A, one in B. Different counts so a leak is visible as
    // a wrong number rather than only as a wrong id.
    for (const [index, tenant] of [
      tenants.a,
      tenants.a,
      tenants.a,
      tenants.b,
    ].entries()) {
      await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          employeeCode: `ISO-${index}`,
          firstName: 'Iso',
          lastName: `Employee${index}`,
          phone: '+10000000000',
          hireDate: new Date('2026-01-01T00:00:00.000Z'),
          organizationId: tenant.organizationId,
          businessUnitId: tenant.businessUnitId,
        },
      });
    }
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  const workforce = () => {
    const source = getDataSource('workforce');
    if (!source) throw new Error('workforce data source is not registered');
    return source;
  };

  it('counts only the calling tenant’s employees', async () => {
    const source = workforce();

    const whereA = planWhere({
      source,
      user: userA,
      scopeWhere: scope.buildWhere(userA, source),
    });
    const whereB = planWhere({
      source,
      user: userB,
      scopeWhere: scope.buildWhere(userB, source),
    });

    expect(await executor.count(source, whereA)).toBe(3);
    expect(await executor.count(source, whereB)).toBe(1);
  });

  it('returns no row belonging to the other tenant', async () => {
    const source = workforce();
    const whereA = planWhere({
      source,
      user: userA,
      scopeWhere: scope.buildWhere(userA, source),
    });

    const rows = await prisma.employee.findMany({
      where: whereA as never,
      select: { tenantId: true },
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.tenantId === tenants.a.id)).toBe(true);
    expect(rows.some((row) => row.tenantId === tenants.b.id)).toBe(false);
  });

  it('always carries an explicit tenant predicate', () => {
    const source = workforce();
    const where = planWhere({
      source,
      user: userA,
      scopeWhere: scope.buildWhere(userA, source),
    });

    // The predicate must be present and must be the caller's tenant, taken from
    // the token. A reporting query that relied on a middleware to add it would
    // be one refactor away from returning everything.
    expect(JSON.stringify(where)).toContain(tenants.a.id);
    expect(JSON.stringify(where)).not.toContain(tenants.b.id);
  });

  it('fails closed when the caller has no access to the source entity', async () => {
    const source = workforce();
    const strangerToEmployees = tenantScopedUser(tenants.a.id, 'user-none', {
      rolePrivileges: [
        {
          entityKey: ENTITY_KEYS.REPORTS,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.TENANT,
          roleId: 'role-fixture',
        },
      ],
    });

    // No `employees:READ` at any level, so the source is unreachable even though
    // the caller may open the reporting workspace.
    expect(scope.hasAnyAccess(strangerToEmployees, source)).toBe(false);

    const where = planWhere({
      source,
      user: strangerToEmployees,
      scopeWhere: scope.buildWhere(strangerToEmployees, source),
    });

    // NONE produces a poison-pill id rather than an empty predicate, so the
    // query matches nothing instead of everything.
    expect(await executor.count(source, where)).toBe(0);
  });

  it('does not leak a report definition across tenants', async () => {
    const created = await prisma.reportDefinition.create({
      data: {
        tenantId: tenants.a.id,
        key: 'isolation-probe',
        name: 'Isolation probe',
        category: 'workforce',
        dataSourceKey: 'workforce',
        configJson: { columns: ['workforce.employee_code'], filters: [] },
      },
      select: { id: true },
    });

    // The service always reads with the tenant in the predicate, never
    // findUnique by bare id. Reproduce that read as tenant B.
    const asB = await prisma.reportDefinition.findFirst({
      where: { id: created.id, tenantId: tenants.b.id },
    });
    expect(asB).toBeNull();

    const asA = await prisma.reportDefinition.findFirst({
      where: { id: created.id, tenantId: tenants.a.id },
    });
    expect(asA).not.toBeNull();
  });

  // Favourites and recents are omitted here: both carry a required userId
  // foreign key to User, and creating one needs an Identity too. Their tenant
  // scoping is identical to the rows below and is covered by unit tests.
  it('scopes a saved view and a run to one tenant', async () => {
    await prisma.reportSavedView.create({
      data: {
        tenantId: tenants.a.id,
        surfaceKey: 'workforce',
        name: 'Isolation view',
        slug: 'isolation-view',
        configJson: {},
      },
    });
    await prisma.reportRun.create({
      data: {
        tenantId: tenants.a.id,
        targetKey: 'std:isolation',
      },
    });

    expect(
      await prisma.reportSavedView.count({ where: { tenantId: tenants.b.id } }),
    ).toBe(0);
    expect(
      await prisma.reportRun.count({ where: { tenantId: tenants.b.id } }),
    ).toBe(0);
  });

  it('removes every reporting row when its tenant is deleted', async () => {
    // Each new model cascades from Tenant. If one did not, deleting a tenant
    // would strand rows that still carry its id — which is how a "deleted"
    // tenant's data reappears in an aggregate.
    const throwaway = await fixtures.createTenantWithBusinessUnit('cascade');
    await prisma.reportDefinition.create({
      data: {
        tenantId: throwaway.id,
        key: 'cascade-probe',
        name: 'Cascade probe',
        category: 'workforce',
        dataSourceKey: 'workforce',
        configJson: {},
      },
    });
    await prisma.reportRun.create({
      data: { tenantId: throwaway.id, targetKey: 'std:cascade' },
    });

    await prisma.tenant.delete({ where: { id: throwaway.id } });

    expect(
      await prisma.reportDefinition.count({
        where: { tenantId: throwaway.id },
      }),
    ).toBe(0);
    expect(
      await prisma.reportRun.count({ where: { tenantId: throwaway.id } }),
    ).toBe(0);
  });
});
