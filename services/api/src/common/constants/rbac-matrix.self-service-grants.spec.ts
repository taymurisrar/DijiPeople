import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
} from './rbac-matrix';

/**
 * DP-QA-002. `GET /employees/me/context` and `GET /dashboard/summary` demand the
 * legacy key `dashboard.view`. Provisioning writes only what
 * SYSTEM_ROLE_PRIVILEGES and SYSTEM_ROLE_MISC_PERMISSIONS name, so a role that
 * signs in but is not granted the key gets a 403 on its own profile.
 */
describe('self-service grants for provisioned system roles', () => {
  const signInRoles = [
    ROLE_KEYS.CEO,
    ROLE_KEYS.MANAGER,
    ROLE_KEYS.HR,
    ROLE_KEYS.PAYROLL_MANAGER,
    ROLE_KEYS.RECRUITER,
    ROLE_KEYS.EMPLOYEE,
  ];

  it.each(signInRoles)('%s is granted dashboard.view', (role) => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[role]).toContain('dashboard.view');
  });

  it('only roles that can read their own preferences receive it', () => {
    for (const [role, keys] of Object.entries(SYSTEM_ROLE_MISC_PERMISSIONS)) {
      if (!keys.includes('dashboard.view')) continue;
      if (role === ROLE_KEYS.GLOBAL_ADMIN || role === ROLE_KEYS.SYSTEM_ADMIN) {
        continue;
      }
      const level =
        SYSTEM_ROLE_PRIVILEGES[role as keyof typeof SYSTEM_ROLE_PRIVILEGES][
          'user-preferences:READ'
        ];
      expect(level).toBeDefined();
      expect(level).not.toBe('NONE');
    }
  });

  it('does not hand the key to the customizer', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.SYSTEM_CUSTOMIZER]).not.toContain(
      'dashboard.view',
    );
  });
});
