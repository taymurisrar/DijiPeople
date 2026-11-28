import {
  isRouteAllowedUnderTimesheetRestriction as allowed,
  stripGlobalPrefix,
  TIMESHEET_RESTRICTION_ALLOWED_ROUTES,
  timesheetRestrictionAllowedRoutesForClient,
} from './timesheet-restriction-routes';

describe('timesheet restriction allow-list (BUG-3164)', () => {
  it('admits every listed route as served in production, with the /api prefix', () => {
    for (const route of TIMESHEET_RESTRICTION_ALLOWED_ROUTES) {
      expect(allowed(`/api${route}`)).toBe(true);
    }
  });

  it('also admits them without the prefix (the e2e app does not set it)', () => {
    for (const route of TIMESHEET_RESTRICTION_ALLOWED_ROUTES) {
      expect(allowed(route)).toBe(true);
    }
  });

  it('admits sub-paths of a listed route', () => {
    expect(allowed('/api/timesheets/abc/submit')).toBe(true);
    expect(allowed('/api/auth/logout')).toBe(true);
    expect(allowed('/api/notifications/unread-count')).toBe(true);
  });

  it('refuses routes that merely START with a listed name (segment boundary)', () => {
    expect(allowed('/api/support-cases')).toBe(false);
    expect(allowed('/api/authors')).toBe(false);
    expect(allowed('/api/timesheets-archive')).toBe(false);
    expect(allowed('/api/my-profile-photos')).toBe(false);
  });

  it('refuses ordinary business routes', () => {
    for (const p of [
      '/api/employees',
      '/api/payroll/runs',
      '/api/documents/types',
      '/api/leave/requests',
      '/api/employees/me-not',
    ]) {
      expect(allowed(p)).toBe(false);
    }
  });

  it('is exact for multi-segment entries', () => {
    expect(allowed('/api/projects/assigned/me')).toBe(true);
    expect(allowed('/api/projects/assigned')).toBe(false);
    expect(allowed('/api/projects')).toBe(false);
    expect(allowed('/api/tenant-settings/resolved')).toBe(true);
    expect(allowed('/api/tenant-settings')).toBe(false);
  });

  it('ignores a query string and is case-sensitive (errs toward refusing)', () => {
    expect(allowed('/api/timesheets?week=1')).toBe(true);
    expect(allowed('/API/timesheets')).toBe(false);
    expect(allowed('/api/Timesheets')).toBe(false);
  });

  it('does not let a path trick through the prefix strip', () => {
    expect(stripGlobalPrefix('/api')).toBe('/');
    expect(stripGlobalPrefix('/apix/timesheets')).toBe('/apix/timesheets');
    expect(allowed('/apix/timesheets')).toBe(false);
    expect(allowed('/api/api/timesheets')).toBe(false);
  });

  it('reports the allow-list to clients as callable paths', () => {
    const routes = timesheetRestrictionAllowedRoutesForClient();
    expect(routes).toContain('/api/timesheets');
    expect(routes).toHaveLength(TIMESHEET_RESTRICTION_ALLOWED_ROUTES.length);
    expect(routes.every((r) => r.startsWith('/api/'))).toBe(true);
  });
});
