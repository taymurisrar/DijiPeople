/**
 * The one masker for field-level security (BUG-3155).
 *
 * A masked value is a STRING. A value that is not a string (a number, a Decimal,
 * a date) cannot be masked into a string without changing its type for the
 * client, so it becomes `null`: restricted, and obviously so.
 *
 * `FULL` does not reveal the value's length: a fixed-width run of asterisks, so
 * a six-digit and a thirteen-digit national id look the same.
 */
export type MaskingPattern = 'FULL' | 'PARTIAL' | 'LAST_4' | 'CUSTOM';

const FULL_MASK = '********';

export function maskFieldValue(
  value: unknown,
  pattern: string | null | undefined,
  customMask?: string | null,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  if (value.length === 0) return '';

  switch (pattern) {
    case 'LAST_4':
      return value.length <= 4 ? FULL_MASK : `****${value.slice(-4)}`;
    case 'PARTIAL': {
      // Keep at most the first and last character; never the middle.
      if (value.length <= 2) return FULL_MASK;
      return `${value[0]}****${value[value.length - 1]}`;
    }
    case 'CUSTOM':
      // A custom mask is a fixed replacement string; without one, fail closed.
      return customMask && customMask.length > 0 ? customMask : FULL_MASK;
    case 'FULL':
    default:
      return FULL_MASK;
  }
}
