import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from './rbac-matrix';

describe('claim approval RBAC bootstrap matrix', () => {
  it('keeps payroll and manager claim permissions aligned with controller routes', () => {
    expect(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.PAYROLL_MANAGER]['claims:APPROVE'],
    ).toBe(SecurityAccessLevel.ORGANIZATION);
    expect(
      matrixPrivilegeToPermissionKey('claims', SecurityPrivilege.APPROVE),
    ).toBe('claims.manager-approve');
    expect(
      matrixPrivilegeToPermissionKey('claims', SecurityPrivilege.MANAGE),
    ).toBe('claims.payroll-approve');
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.PAYROLL_MANAGER]).toEqual(
      expect.arrayContaining(['approvals.readAssigned']),
    );
  });
});
