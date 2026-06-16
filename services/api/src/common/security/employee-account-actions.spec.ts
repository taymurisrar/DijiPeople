import { canManageEmployeeAccountActions } from './employee-account-actions';

describe('employee account action access', () => {
  it.each(['global-admin', 'system-admin', 'hr'])(
    'allows %s to run employee account actions',
    (roleKey) => {
      expect(canManageEmployeeAccountActions({ roleKeys: [roleKey] })).toBe(
        true,
      );
    },
  );

  it.each(['employee', 'manager', 'recruiter', 'system-customizer'])(
    'does not allow %s to run employee account actions',
    (roleKey) => {
      expect(canManageEmployeeAccountActions({ roleKeys: [roleKey] })).toBe(
        false,
      );
    },
  );
});
