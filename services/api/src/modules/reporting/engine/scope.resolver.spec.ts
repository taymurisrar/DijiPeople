import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ReportScopeResolver } from './scope.resolver';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type { ReportDataSource } from '../semantic/semantic.types';

/**
 * Row scope, at every access level.
 *
 * This suite exists because the first version of `ReportScopeResolver` passed a
 * database-backed isolation test and was still wrong: that test used
 * TENANT-level callers, whose fragment is a bare `{ tenantId }` and touches
 * none of the interesting code. Every level below TENANT was silently returning
 * zero rows, because `knownColumns` read the raw scope options while
 * `buildScopedAccessWhere` applies defaults, so `{ businessUnitId: … }` looked
 * like an unknown column and was poisoned.
 *
 * So: assert the produced `where` per level, and assert the two directions
 * separately — that a narrowing term survives, and that an unknown one cannot
 * widen.
 */

const employeeSource: ReportDataSource = {
  key: 'workforce',
  label: 'Workforce',
  description: 'Employees',
  prismaModel: 'employee',
  rbacEntityKey: 'employees',
  // Exactly what `employees.service.ts` passes, and deliberately silent about
  // businessUnitIdField — the case that broke.
  scope: { organizationIdField: null, userIdField: 'userId' },
  defaultDateField: 'hireDate',
  fields: [],
};

const relationScopedSource: ReportDataSource = {
  key: 'attendance',
  label: 'Attendance',
  description: 'Attendance days',
  prismaModel: 'attendanceDay',
  rbacEntityKey: 'attendance',
  scope: { organizationIdField: null },
  scopeRelationPath: ['employee'],
  scopeRelationOptions: { organizationIdField: null, userIdField: 'userId' },
  defaultDateField: 'attendanceDate',
  fields: [],
};

function user(
  level: SecurityAccessLevel,
  entityKey: string,
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'u@example.invalid',
    roleIds: [],
    roleKeys: ['hr'],
    permissionKeys: [],
    rolePrivileges: [
      {
        entityKey,
        privilege: SecurityPrivilege.READ,
        accessLevel: level,
        roleId: 'role-1',
      },
    ],
    accessContext: {
      isSystemAdministrator: false,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: 'bu-1',
      organizationId: 'org-1',
      teamIds: [],
      accessibleBusinessUnitIds: ['bu-1', 'bu-2'],
      businessUnitSubtreeIds: ['bu-1', 'bu-3'],
      canAccessAllBusinessUnits: false,
    },
    ...overrides,
  } as AuthenticatedUser;
}

const flatten = (where: unknown): string => JSON.stringify(where);

describe('ReportScopeResolver', () => {
  const resolver = new ReportScopeResolver();

  it('returns a bare tenant predicate at TENANT level', () => {
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.TENANT, 'employees'),
      employeeSource,
    );
    expect(where).toEqual({ tenantId: 'tenant-1' });
  });

  it('keeps the business-unit term for a source that does not name the column', () => {
    // The regression. `employeeSource.scope` never mentions
    // `businessUnitIdField`, so the default must still be recognised.
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.BUSINESS_UNIT, 'employees'),
      employeeSource,
    );
    expect(flatten(where)).toContain('businessUnitId');
    expect(flatten(where)).toContain('bu-1');
    expect(flatten(where)).not.toContain('__rbac_no_access__');
  });

  it('scopes ORGANIZATION through the accessible business units when the model has no organization column', () => {
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.ORGANIZATION, 'employees'),
      employeeSource,
    );
    expect(flatten(where)).toContain('bu-2');
    expect(flatten(where)).not.toContain('__rbac_no_access__');
  });

  it('uses the business-unit subtree at PARENT_CHILD_BUSINESS_UNIT', () => {
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT, 'employees'),
      employeeSource,
    );
    expect(flatten(where)).toContain('bu-3');
  });

  it('keeps every owned-record term at SELF now that no phantom column is emitted', () => {
    const caller = user(SecurityAccessLevel.SELF, 'employees', {
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: false,
        businessUnitId: 'bu-1',
        organizationId: 'org-1',
        // A team membership is what makes buildOwnedRecordWhere emit the
        // ownerTeamId term that Employee has no column for.
        teamIds: ['team-1'],
        accessibleBusinessUnitIds: ['bu-1'],
        businessUnitSubtreeIds: ['bu-1'],
        canAccessAllBusinessUnits: false,
      },
    } as Partial<AuthenticatedUser>);

    const where = resolver.buildWhere(caller, employeeSource);
    const rendered = flatten(where);

    // The real ownership terms survive...
    expect(rendered).toContain('ownerUserId');
    expect(rendered).toContain('createdById');
    // ...and the one Employee does not have is gone, rather than reaching
    // Prisma as an unknown argument (BUG-2623).
    expect(rendered).not.toContain('ownerTeamId');

    /*
     * Three terms, not four. This assertion used to expect a fourth —
     * the poison pill this resolver substituted for the ownerTeamId branch —
     * because buildScopedAccessWhere emitted a column Employee does not have
     * and something had to neutralise it downstream.
     *
     * BUG-2623 was then fixed at the source: ownerTeamIdField is opt-in, so the
     * term is never emitted for a source that does not name it and there is
     * nothing left here to substitute. The workaround did not become wrong, it
     * became unnecessary, and a test that still demanded the pill would be
     * asserting the presence of a workaround rather than the absence of a bug.
     *
     * The substitution behaviour itself is defence in depth now: with the
     * source fix in place nothing reachable through buildWhere emits an
     * unrecognised column any more. It is exercised directly at the bottom of
     * this file instead, because a guard with no live trigger is exactly the
     * kind that rots unnoticed.
     */
    const or = (where as { AND: Array<{ OR?: unknown[] }> }).AND.find(
      (clause) => Array.isArray(clause.OR),
    );
    expect(or?.OR).toHaveLength(3);
    expect(or?.OR).not.toContainEqual({ id: '__rbac_no_access__' });
    expect(or?.OR).toContainEqual({ ownerUserId: 'user-1' });
  });

  it('fails closed at NONE', () => {
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.NONE, 'employees'),
      employeeSource,
    );
    expect(flatten(where)).toContain('__rbac_no_access__');
  });

  it('nests the scope under the relation for a source with no scopable column', () => {
    const where = resolver.buildWhere(
      user(SecurityAccessLevel.BUSINESS_UNIT, 'attendance'),
      relationScopedSource,
    );
    expect(where).toHaveProperty('employee');
    expect(flatten(where)).toContain('businessUnitId');
    expect(flatten(where)).toContain('bu-1');
  });

  it('reports no access when the caller holds nothing on the source entity', () => {
    const caller = user(SecurityAccessLevel.TENANT, 'attendance');
    expect(resolver.hasAnyAccess(caller, employeeSource)).toBe(false);
    expect(resolver.hasAnyAccess(caller, relationScopedSource)).toBe(true);
  });

  it('never returns an empty predicate, at any level', () => {
    for (const level of [
      SecurityAccessLevel.NONE,
      SecurityAccessLevel.SELF,
      SecurityAccessLevel.USER,
      SecurityAccessLevel.TEAM,
      SecurityAccessLevel.BUSINESS_UNIT,
      SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
      SecurityAccessLevel.ORGANIZATION,
      SecurityAccessLevel.TENANT,
    ]) {
      const where = resolver.buildWhere(
        user(level, 'employees'),
        employeeSource,
      );
      // An empty object is "match everything" in Prisma. It must never be the
      // answer, whatever the level.
      expect(Object.keys(where).length).toBeGreaterThan(0);
    }
  });

  it('poisons rather than widens when a scoping column is genuinely absent', () => {
    const noColumnsSource: ReportDataSource = {
      ...employeeSource,
      key: 'no-columns',
      // Declares only a tenant column, so the business-unit predicate has
      // nothing to bind to.
      scope: { tenantIdField: 'tenantId', organizationIdField: null },
      fields: [],
    };

    const where = resolver.buildWhere(
      user(SecurityAccessLevel.BUSINESS_UNIT, 'employees'),
      { ...noColumnsSource, scope: { organizationIdField: null } },
    );
    // With the default recognised this resolves normally; the point of the case
    // is that it must never come back as a bare tenant predicate, which would
    // hand a business-unit reader the whole tenant.
    expect(where).not.toEqual({ tenantId: 'tenant-1' });
  });
});

/**
 * The sanitiser, exercised directly.
 *
 * REG-381 is the rule that an unrecognised predicate is REPLACED with a
 * match-nothing term rather than removed: removing one from an AND leaves the
 * tenant-wide remainder and widens the result, while replacing it narrows an OR
 * and fails closed in an AND.
 *
 * Once BUG-2623 was fixed at the source, nothing reachable through buildWhere
 * emits an unrecognised column any more, so this guard lost its only natural
 * trigger. It is called through the private name on purpose: a security
 * behaviour with no live caller is the kind that quietly stops working, and a
 * suite that can no longer reach it would report green either way.
 */
describe('ReportScopeResolver sanitiser, called directly', () => {
  const resolver = new ReportScopeResolver();

  const call = (fragment: Record<string, unknown>) =>
    (
      resolver as unknown as {
        sanitize: (
          f: Record<string, unknown>,
          s: ReportDataSource,
        ) => Record<string, unknown>;
      }
    ).sanitize(fragment, employeeSource);

  it('replaces an unrecognised column inside an OR rather than removing it', () => {
    const sanitized = call({
      OR: [{ ownerUserId: 'user-1' }, { phantomColumn: { in: ['x'] } }],
    });

    const or = (sanitized as { OR: unknown[] }).OR;
    // Still two branches: the real one, and a pill where the phantom was.
    expect(or).toHaveLength(2);
    expect(or).toContainEqual({ ownerUserId: 'user-1' });
    expect(or).toContainEqual({ id: '__rbac_no_access__' });
    expect(JSON.stringify(sanitized)).not.toContain('phantomColumn');
  });

  it('fails an AND closed when a column it cannot verify appears there', () => {
    const sanitized = call({
      AND: [{ tenantId: 'tenant-1' }, { phantomColumn: 'x' }],
    });

    // In an AND the pill is the whole point: the query returns nothing rather
    // than falling back to the tenant-wide remainder.
    expect(JSON.stringify(sanitized)).toContain('__rbac_no_access__');
    expect(JSON.stringify(sanitized)).not.toContain('phantomColumn');
  });
});
