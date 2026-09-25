/**
 * The backend module an error belongs to, derived from the request path.
 *
 * TASK-0032 WP-06 — "which module is failing" was previously answerable only
 * by reading `errorCode`, which is a catalog code, not a module name (see the
 * D4 monitoring discovery). `ErrorLog.module` exists in the schema (WP-01) but
 * nothing wrote it.
 *
 * Derivation is from the request path's first segment after the global `/api`
 * prefix, not from Nest controller/handler reflection metadata: the exception
 * filter already has the path on every request (thrown or not, routed or
 * not), while reflection metadata is only available for routes Nest actually
 * matched — an unmatched-route 404 or a guard rejection before the handler
 * resolves would have no controller to reflect on. Path-based derivation
 * degrades to a plain string instead of losing the field.
 *
 * A handful of path prefixes are shared by many unrelated features
 * (`platform/...`, `super-admin/...`, `settings/...`) — for those, the second
 * segment is appended so "platform" does not become a bucket for two dozen
 * different platform-ops modules. Every other route uses its first segment
 * unchanged, which lines up with `services/api/src/modules/<domain>/`.
 */
const GENERIC_ROUTE_PREFIXES = new Set([
  'platform',
  'super-admin',
  'settings',
]);

export function deriveErrorModule(
  path: string | null | undefined,
): string | null {
  if (!path) return null;

  const withoutQuery = path.split('?')[0] ?? '';
  const segments = withoutQuery.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const relevant = apiIndex >= 0 ? segments.slice(apiIndex + 1) : segments;

  const [first, second] = relevant;
  if (!first) return null;

  if (GENERIC_ROUTE_PREFIXES.has(first) && second) {
    return `${first}/${second}`;
  }

  return first;
}
