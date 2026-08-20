import {
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { buildDirectPermissionPrivileges } from './direct-permission-privileges';

describe('direct user permission matrix compatibility', () => {
  it('derives matrix privileges at the highest assigned role scope', () => {
    expect(
      buildDirectPermissionPrivileges(
        ['employees.read.self', 'attendance.correction.approve'],
        [
          { accessLevel: RoleAccessLevel.USER },
          { accessLevel: RoleAccessLevel.PARENT_BU },
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          entityKey: ENTITY_KEYS.EMPLOYEES,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
          roleId: 'direct-user-permission',
        },
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.APPROVE,
          accessLevel: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
          roleId: 'direct-user-permission',
        },
      ]),
    );
  });

  it('defaults a role-less direct grant to self scope', () => {
    expect(
      buildDirectPermissionPrivileges(['documents.read'], []),
    ).toContainEqual({
      entityKey: ENTITY_KEYS.DOCUMENTS,
      privilege: SecurityPrivilege.READ,
      accessLevel: SecurityAccessLevel.SELF,
      roleId: 'direct-user-permission',
    });
  });
});
