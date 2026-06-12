import { ROLE_KEYS, SYSTEM_ROLE_MISC_PERMISSIONS } from './rbac-matrix';

describe('widget runtime role permissions', () => {
  it.each([
    ROLE_KEYS.GLOBAL_ADMIN,
    ROLE_KEYS.SYSTEM_ADMIN,
    ROLE_KEYS.HR,
    ROLE_KEYS.EMPLOYEE,
  ])('grants Timeline visibility to %s', (roleKey) => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[roleKey]).toContain('timeline.read');
  });

  it.each([ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.HR])(
    'grants approval visibility to %s',
    (roleKey) => {
      expect(SYSTEM_ROLE_MISC_PERMISSIONS[roleKey]).toContain('approvals.read');
    },
  );

  it('keeps Employee Self Service approval and hierarchy access scoped', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.EMPLOYEE]).toEqual(
      expect.arrayContaining([
        'approvals.readOwn',
        'hierarchy.read',
        'inbox.read',
        'notifications.read',
        'timeline.read',
      ]),
    );
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.EMPLOYEE]).not.toContain(
      'approvals.read',
    );
  });

  it('grants HR reporting hierarchy visibility', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.HR]).toContain(
      'hierarchy.read',
    );
  });
});
