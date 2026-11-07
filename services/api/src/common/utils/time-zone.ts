/**
 * Whether `value` names a time zone `Intl.DateTimeFormat` can use.
 *
 * Probing the constructor is deliberate. `Intl.supportedValuesOf('timeZone')`
 * omits `UTC` on some runtimes and canonical aliases on others, so a list lookup
 * would reject values every browser formats without complaint. What matters is
 * "will formatting a date with this throw", and the constructor answers that
 * directly (DP-QA-012).
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** A stored value that is no longer usable degrades to `fallback`, never throws. */
export function resolveValidTimeZone(value: unknown, fallback = 'UTC'): string {
  return isValidTimeZone(value) ? value.trim() : fallback;
}
