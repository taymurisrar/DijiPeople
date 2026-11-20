import { ROLE_KEYS, SYSTEM_ROLE_MISC_PERMISSIONS } from './rbac-matrix';

/**
 * BUG-4456. The employee record's Documents tab posts to
 * `employees/:id/documents/upload`, which requires `employees.documents.upload`
 * once the caller's record access resolves to HR_MANAGE. HR resolved there and
 * was then refused 403 because no grant carried the key. The decision (owner,
 * 2026-11-20) is that HR uploads; nobody else gains it.
 */
describe('employee document upload grant', () => {
  it('is held by HR', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.HR]).toContain(
      'employees.documents.upload',
    );
  });

  it.each([
    ROLE_KEYS.EMPLOYEE,
    ROLE_KEYS.RECRUITER,
    ROLE_KEYS.MANAGER,
    ROLE_KEYS.PAYROLL_MANAGER,
  ])('is not widened to %s', (role) => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[role]).not.toContain(
      'employees.documents.upload',
    );
  });

  it('does not give HR delete', () => {
    expect(SYSTEM_ROLE_MISC_PERMISSIONS[ROLE_KEYS.HR]).not.toContain(
      'employees.documents.delete',
    );
  });
});
