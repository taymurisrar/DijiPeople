import { SecurityAccessLevel } from '@prisma/client';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
} from './rbac-matrix';

describe('operational payroll RBAC bootstrap matrix', () => {
  const permissions = (role: keyof typeof SYSTEM_ROLE_MISC_PERMISSIONS) =>
    SYSTEM_ROLE_MISC_PERMISSIONS[role];

  it('gives Payroll Manager the operational lifecycle and delivery controls', () => {
    expect(permissions(ROLE_KEYS.PAYROLL_MANAGER)).toEqual(
      expect.arrayContaining([
        'payroll-operations.dashboard',
        'timesheets.read.payroll',
        'timesheets.override',
        'payroll-exceptions.read',
        'payroll-exceptions.export',
        'payroll-runs.finalize',
        'payroll-bank-export.generate',
        'payroll-runs.disburse',
        'payslips.deliver',
        'payslips.download',
      ]),
    );
  });

  it('keeps HR separate from disbursement and bank export', () => {
    expect(permissions(ROLE_KEYS.HR)).toEqual(
      expect.not.arrayContaining([
        'payroll-runs.finalize',
        'payroll-bank-export.generate',
        'payroll-runs.disburse',
        'payslips.deliver',
      ]),
    );
  });

  it('does not grant bank export generation to HR, Manager, or ESS', () => {
    for (const role of [ROLE_KEYS.HR, ROLE_KEYS.MANAGER, ROLE_KEYS.EMPLOYEE]) {
      expect(permissions(role)).not.toContain('payroll-bank-export.generate');
    }
  });

  it('does not expose payroll finance records to managers', () => {
    expect(SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.MANAGER]['payroll-runs:READ']).toBe(
      SecurityAccessLevel.NONE,
    );
    expect(SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.MANAGER]['payslips:READ']).toBe(
      SecurityAccessLevel.NONE,
    );
  });

  it('limits ESS to own payslips with download capability', () => {
    expect(SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.EMPLOYEE]['payslips:READ']).toBe(
      SecurityAccessLevel.NONE,
    );
    expect(permissions(ROLE_KEYS.EMPLOYEE)).toEqual(
      expect.arrayContaining(['payslips.read-own', 'payslips.download']),
    );
    expect(permissions(ROLE_KEYS.EMPLOYEE)).not.toContain(
      'payroll-operations.dashboard',
    );
  });
});
