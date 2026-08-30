/**
 * Redaction for audit snapshots.
 *
 * `AGENTS.md` forbids password hashes, refresh tokens, encrypted secrets, full
 * national ids and bank details from leaving a service in a response or a log.
 * An audit row is a log, and it is the longest-lived one the product keeps — a
 * snapshot written today is read by a compliance officer years from now.
 *
 * This runs centrally in `AuditService.log()` rather than at each call site,
 * because a call site is exactly what gets forgotten: BUG-2044 exists because a
 * call site was never written, and the existing `EMPLOYEE_UPDATED` writer
 * passed `mapEmployee()` straight through, carrying `cnic` and `taxIdentifier`
 * into `AuditLog` on every employee edit. Redacting here fixes both the new
 * writers and the ones already in the tree.
 *
 * A redacted field is replaced, not removed. "This person's national id
 * changed" is itself auditable information; the value is not.
 */

/*
 * Substring patterns, matched the way `sanitizeForErrorLog` matches them.
 * These are credential-shaped names where any containing key is unsafe.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'credential',
];

/*
 * Exact key names, because substring matching over-reaches badly here.
 * `accountnumber` must be redacted while `accounttitle`, `bankaccountid` and
 * `accountingcode` must not, and a snapshot that redacts the name of the bank
 * is less useful without being any safer.
 *
 * Money is deliberately absent. A compensation change is precisely the kind of
 * thing an audit trail exists to record, so salaries and amounts stay.
 */
const SENSITIVE_KEY_NAMES = new Set([
  'cnic',
  'nationalid',
  'nationalidnumber',
  'passportnumber',
  'taxidentifier',
  'taxidentificationnumber',
  'socialsecuritynumber',
  'ssn',
  'accountnumber',
  'bankaccountnumber',
  'iban',
  'swiftcode',
  'swiftorroutingcode',
  'routingnumber',
]);

const REDACTED = '[REDACTED]';

/** Depth guard, matching `sanitizeForErrorLog`. Audit snapshots are shallow. */
const MAX_DEPTH = 8;

export function redactAuditSnapshot<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[Max depth reached]' as T;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      redactAuditSnapshot(item, depth + 1),
    ) as T;
  }
  if (value instanceof Date) return value as T;
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveAuditKey(key)
      ? REDACTED
      : redactAuditSnapshot(item, depth + 1);
  }
  return result as T;
}

export function isSensitiveAuditKey(key: string) {
  const normalized = key.replace(/[-\s._]/g, '').toLowerCase();
  if (SENSITIVE_KEY_NAMES.has(normalized)) return true;
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalized.includes(pattern.replace(/_/g, '')),
  );
}
