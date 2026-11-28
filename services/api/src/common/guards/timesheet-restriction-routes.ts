/**
 * Which routes a timesheet-restricted employee may still reach (BUG-3164).
 *
 * The list used to be matched against `request.path` verbatim. In production
 * that path carries the global `/api` prefix (`main.ts` calls
 * `setGlobalPrefix('api')`; Nest bakes it into the registered route), so no
 * entry — all written without it — could ever match: a restricted employee was
 * refused `/api/timesheets`, the very screen needed to lift the restriction.
 * The e2e app does not set the prefix either, which is why nothing caught it.
 *
 * Two deliberate properties:
 *
 * - The prefix is stripped before matching, and the path is also accepted
 *   without it, so the same list is correct in production and under test.
 * - Matching is on a path-segment boundary. `/support` admits `/support` and
 *   `/support/anything`, not `/support-cases` or `/supporter`. Several entries
 *   are listed as siblings of each other (`/timesheets`, `/timesheet-exports`),
 *   which only makes sense if a bare prefix test was never the intent.
 *
 * Matching is case-sensitive on purpose. Express routes case-insensitively, so
 * `/API/Timesheets` still reaches the handler — and is simply not allow-listed,
 * which errs toward refusing a restricted employee, never toward admitting one.
 */
export const GLOBAL_API_PREFIX = '/api';

export const TIMESHEET_RESTRICTION_ALLOWED_ROUTES = [
  '/timesheets',
  '/timesheet-exports',
  '/approvals',
  '/notifications',
  '/in-app-notifications',
  '/my-profile',
  '/employees/me',
  '/auth',
  '/help',
  '/support',
  '/tenant-settings/resolved',
  '/tenant-settings/features/availability',
  '/runtime-metadata',
  '/settings-runtime',
  '/projects/assigned/me',
  '/audit-logs',
] as const;

export function stripGlobalPrefix(path: string): string {
  if (path === GLOBAL_API_PREFIX) return '/';
  if (path.startsWith(`${GLOBAL_API_PREFIX}/`)) {
    return path.slice(GLOBAL_API_PREFIX.length);
  }
  return path;
}

export function isRouteAllowedUnderTimesheetRestriction(
  rawPath: string,
): boolean {
  const path = stripGlobalPrefix(rawPath.split('?')[0] || '/');
  return TIMESHEET_RESTRICTION_ALLOWED_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

/** The allow-list as a client can call it: with the prefix the API serves under. */
export function timesheetRestrictionAllowedRoutesForClient(): string[] {
  return TIMESHEET_RESTRICTION_ALLOWED_ROUTES.map(
    (route) => `${GLOBAL_API_PREFIX}${route}`,
  );
}
