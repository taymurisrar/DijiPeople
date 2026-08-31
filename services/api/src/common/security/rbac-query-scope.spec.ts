import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  buildOwnedRecordWhere,
  buildScopedAccessWhere,
} from './rbac-query-scope';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

/**
 * The owner-team predicate must be asked for, never assumed.
 *
 * BUG-2623 / REG-387. `buildOwnedRecordWhere` defaulted `ownerTeamIdField` to
 * `'ownerTeamId'`, and exactly one model in this schema has that column —
 * `CustomDataRecord`, 1 of 312. Every other caller emitted a predicate on a
 * column that does not exist, and Prisma rejects the entire query with
 * "Unknown argument `ownerTeamId`" rather than ignoring the unknown key.
 *
 * The blast radius was wider than "team-scoped users": `buildOwnedRecordWhere`
 * runs at SELF and USER as well as TEAM, so it fired for anyone at those levels
 * who belonged to at least one team. It broke data-management exports of
 * `Employee`, `LeaveRequest` and `AttendanceEntry`, and reads of the `employees`
 * entity through the generic data API — none of which name the field.
 *
 * Reporting had already been forced to work around it with a sanitiser that
 * deliberately kept no default for this one field; making the helper opt-in is
 * the same decision moved to where it belongs.
 */

function userAt(
  accessLevel: SecurityAccessLevel,
  teamIds: string[] = ['team-1', 'team-2'],
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys: [],
    rolePrivileges: [
      {
        entityKey: 'employees',
        privilege: SecurityPrivilege.READ,
        accessLevel,
      },
    ],
    accessContext: { teamIds, businessUnitId: 'bu-1' },
  } as unknown as AuthenticatedUser;
}

/** Every field name mentioned anywhere in a nested `where`. */
function keysOf(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysOf(entry, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      keysOf(nested, found);
    }
  }
  return found;
}

describe('buildOwnedRecordWhere owner-team predicate', () => {
  it('is absent when no owner-team column is named, even with team membership', () => {
    const where = buildOwnedRecordWhere(userAt(SecurityAccessLevel.SELF));

    expect(keysOf(where).has('ownerTeamId')).toBe(false);
    // The three real ownership terms still stand; the fix narrows, it does not
    // empty the predicate.
    expect(where.OR).toHaveLength(3);
  });

  it('is present when a caller names the column', () => {
    const where = buildOwnedRecordWhere(userAt(SecurityAccessLevel.SELF), {
      ownerTeamIdField: 'ownerTeamId',
    });

    expect(where.OR).toHaveLength(4);
    expect(where.OR).toContainEqual({
      ownerTeamId: { in: ['team-1', 'team-2'] },
    });
  });

  it('is absent for a caller that names the column but has no teams', () => {
    const where = buildOwnedRecordWhere(userAt(SecurityAccessLevel.SELF, []), {
      ownerTeamIdField: 'ownerTeamId',
    });

    expect(where.OR).toHaveLength(3);
  });
});

describe('buildScopedAccessWhere does not invent columns', () => {
  // SELF, USER and TEAM all route through buildOwnedRecordWhere. All three were
  // affected, which is why this is a table rather than a single case.
  const levels = [
    SecurityAccessLevel.SELF,
    SecurityAccessLevel.USER,
    SecurityAccessLevel.TEAM,
  ];

  it.each(levels)(
    'emits no ownerTeamId at %s for a model that has no such column',
    (level) => {
      const where = buildScopedAccessWhere(
        userAt(level),
        'employees',
        SecurityPrivilege.READ,
        // Exactly what modules/data/entity-registry.ts and
        // data-management/export-execution.ts pass for Employee.
        { organizationIdField: null, userIdField: 'userId' },
      );

      expect(keysOf(where).has('ownerTeamId')).toBe(false);
      // Still scoped: dropping the term must not widen anything.
      expect(keysOf(where).has('tenantId')).toBe(true);
    },
  );

  it('still narrows rather than returning an empty where', () => {
    const where = buildScopedAccessWhere(
      userAt(SecurityAccessLevel.SELF),
      'employees',
      SecurityPrivilege.READ,
      { organizationIdField: null, userIdField: 'userId' },
    );

    expect(Object.keys(where).length).toBeGreaterThan(0);
    expect(where).not.toEqual({});
  });
});
