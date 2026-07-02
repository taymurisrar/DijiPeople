import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from './rbac-matrix';

describe('loan and bank RBAC bootstrap matrix', () => {
  it('grants finance/payroll but not HR protected finance access', () => {
    expect(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.PAYROLL_MANAGER]['loans:APPROVE'],
    ).toBe(SecurityAccessLevel.ORGANIZATION);
    expect(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.PAYROLL_MANAGER][
        'employee-bank-accounts:READ'
      ],
    ).toBe(SecurityAccessLevel.ORGANIZATION);
    expect(SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.HR]['loans:READ']).toBe(
      SecurityAccessLevel.NONE,
    );
    expect(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.HR]['employee-bank-accounts:READ'],
    ).toBe(SecurityAccessLevel.NONE);
  });

  it('maps matrix privileges to the controller permission keys', () => {
    expect(
      matrixPrivilegeToPermissionKey('loans', SecurityPrivilege.APPROVE),
    ).toBe('loans.approve');
    expect(
      matrixPrivilegeToPermissionKey(
        'employee-bank-accounts',
        SecurityPrivilege.APPROVE,
      ),
    ).toBe('employee-bank-accounts.verify');
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.EMPLOYEE]).toEqual(
      expect.arrayContaining([
        'loans.read-own',
        'loans.create',
        'employee-bank-accounts.read-own',
      ]),
    );
  });
});
