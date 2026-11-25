import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { employeeScopeWhere, isTenantWide } from './employee-scope';

function userAt(level: SecurityAccessLevel): AuthenticatedUser {
  return {
    userId: 'u1',
    tenantId: 't1',
    email: 'a@example.invalid',
    roleIds: ['r1'],
    roleKeys: ['custom'],
    permissionKeys: [],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.EMPLOYEES,
        privilege: SecurityPrivilege.READ,
        accessLevel: level,
        roleId: 'r1',
      },
    ],
    accessContext: {
      isSystemAdministrator: false,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: 'bu1',
      organizationId: 'org1',
      teamIds: ['team1'],
      accessibleBusinessUnitIds: ['bu1', 'bu2'],
      businessUnitSubtreeIds: ['bu1', 'bu1a'],
      canAccessAllBusinessUnits: false,
    },
  };
}

const READ = SecurityPrivilege.READ;

describe('employeeScopeWhere', () => {
  it('SELF reaches only the caller', () => {
    expect(employeeScopeWhere(userAt(SecurityAccessLevel.SELF), READ)).toEqual({
      userId: 'u1',
    });
  });

  it('TENANT reaches everyone, and says so', () => {
    const where = employeeScopeWhere(userAt(SecurityAccessLevel.TENANT), READ);
    expect(where).toEqual({});
    expect(isTenantWide(where)).toBe(true);
  });

  it('NONE reaches nobody', () => {
    const where = employeeScopeWhere(userAt(SecurityAccessLevel.NONE), READ);
    expect(where).toBeNull();
    expect(isTenantWide(where)).toBe(false);
  });

  it('a privilege the role does not hold reaches nobody, whatever it holds for another', () => {
    expect(
      employeeScopeWhere(
        userAt(SecurityAccessLevel.TENANT),
        SecurityPrivilege.WRITE,
      ),
    ).toBeNull();
  });

  it('BUSINESS_UNIT reaches the caller and their own unit', () => {
    expect(
      employeeScopeWhere(userAt(SecurityAccessLevel.BUSINESS_UNIT), READ),
    ).toEqual({ OR: [{ userId: 'u1' }, { businessUnitId: 'bu1' }] });
  });

  it('a parent/child level reaches the whole subtree', () => {
    expect(
      employeeScopeWhere(
        userAt(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT),
        READ,
      ),
    ).toEqual({
      OR: [{ userId: 'u1' }, { businessUnitId: { in: ['bu1', 'bu1a'] } }],
    });
  });

  it('TEAM reaches the caller and the members of their teams', () => {
    expect(employeeScopeWhere(userAt(SecurityAccessLevel.TEAM), READ)).toEqual({
      OR: [{ userId: 'u1' }, { teamId: { in: ['team1'] } }],
    });
  });

  it('ORGANIZATION reaches the organization and every accessible unit', () => {
    expect(
      employeeScopeWhere(userAt(SecurityAccessLevel.ORGANIZATION), READ),
    ).toEqual({
      OR: [
        { userId: 'u1' },
        { organizationId: 'org1' },
        { businessUnitId: { in: ['bu1', 'bu2'] } },
      ],
    });
  });
});
