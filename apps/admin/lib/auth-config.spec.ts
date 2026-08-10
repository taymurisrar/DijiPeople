import { isProtectedAdminRoute } from './auth-config';

describe('Platform Admin protected routes', () => {
  it.each([
    '/settings/appearance',
    '/settings/email',
    '/partners/partner-1',
    '/contracts/contract-1',
    '/support/cases/case-1',
    '/contract-templates/new',
  ])('protects %s before rendering the internal layout', (route) => {
    expect(isProtectedAdminRoute(route)).toBe(true);
  });

  it.each(['/login', '/access-denied', '/api/auth/login'])(
    'does not classify %s as an internal page',
    (route) => {
      expect(isProtectedAdminRoute(route)).toBe(false);
    },
  );
});
