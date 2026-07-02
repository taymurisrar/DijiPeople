import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from './rbac-matrix';

describe('benefits RBAC bootstrap matrix', () => {
  it('grants HR and Payroll benefit administration with protected finance visibility', () => {
    expect(SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.HR]['benefits:MANAGE']).toBe(
      SecurityAccessLevel.ORGANIZATION,
    );
    expect(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.PAYROLL_MANAGER]['benefits:MANAGE'],
    ).toBe(SecurityAccessLevel.ORGANIZATION);
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.PAYROLL_MANAGER]).toEqual(
      expect.arrayContaining(['benefits.read-sensitive']),
    );
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.EMPLOYEE]).toEqual(
      expect.arrayContaining(['benefits.read-own']),
    );
  });

  it('maps benefit privileges to canonical controller permissions', () => {
    expect(
      matrixPrivilegeToPermissionKey('benefits', SecurityPrivilege.READ),
    ).toBe('benefits.read');
    expect(
      matrixPrivilegeToPermissionKey('benefits', SecurityPrivilege.MANAGE),
    ).toBe('benefits.manage');
  });
});
