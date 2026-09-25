/**
 * Pure helpers for the platform audit trail screen (BUG-3564, TASK-0032
 * WP-10). Kept out of the page/table components because `apps/admin`'s jest
 * runs `testEnvironment: "node"` with no jsdom — a `.ts` file with no React
 * in it is directly testable; the components that use these are not.
 */

/** Query params `GET /platform/audit-logs` actually accepts. */
export const AUDIT_TRAIL_FILTER_KEYS = [
  "action",
  "entityType",
  "entityId",
  "actorUserId",
  "traceId",
  "search",
  "fromDate",
  "toDate",
  "page",
  "pageSize",
] as const;

export type AuditTrailFilterKey = (typeof AUDIT_TRAIL_FILTER_KEYS)[number];

/**
 * Builds the query string forwarded to `GET /platform/audit-logs`, keeping
 * only the keys the API DTO declares. A page passed straight through would
 * either 400 (`forbidNonWhitelisted: true`) on an unrelated param the URL
 * happens to carry, or silently ignore it — this makes "which params reach
 * the API" a single, testable list instead of a fact buried in JSX.
 */
export function buildAuditTrailQueryString(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const allowed = new Set<string>(AUDIT_TRAIL_FILTER_KEYS);
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (!allowed.has(key)) continue;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) params.set(key, normalized);
  }

  return params.toString();
}

export type SnapshotFieldDiff = {
  field: string;
  before: unknown;
  after: unknown;
};

/**
 * Reduces a before/after audit snapshot pair to the fields that actually
 * changed, for the detail drawer's diff view. A snapshot is whatever shape
 * the writing module chose (`AuditService.log`'s `beforeSnapshot`/
 * `afterSnapshot` are `unknown` on purpose) and is never re-keyed here — only
 * compared and passed through, redaction already having happened on the API
 * side (`redactAuditSnapshot`, re-applied on read as defence in depth).
 *
 * A field present in only one snapshot (added/removed) is included, with the
 * missing side reported as `undefined` rather than dropped — a field that
 * disappeared is itself a change worth showing, not something to hide.
 */
export function diffAuditSnapshotFields(
  before: unknown,
  after: unknown,
): SnapshotFieldDiff[] {
  const beforeRecord = asPlainRecord(before);
  const afterRecord = asPlainRecord(after);

  if (!beforeRecord && !afterRecord) {
    return [];
  }

  // Neither snapshot is a plain object (e.g. a bulk-delete action's
  // `{ ids, count }` afterSnapshot with no matching before) — there is
  // nothing field-shaped to diff, so the whole value is the one "field".
  if (!beforeRecord || !afterRecord) {
    return [{ field: "value", before, after }];
  }

  const fields = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
  ]);

  const diffs: SnapshotFieldDiff[] = [];
  for (const field of fields) {
    const beforeValue = beforeRecord[field];
    const afterValue = afterRecord[field];
    if (stableStringify(beforeValue) === stableStringify(afterValue)) {
      continue;
    }
    diffs.push({ field, before: beforeValue, after: afterValue });
  }

  return diffs.sort((a, b) => a.field.localeCompare(b.field));
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
