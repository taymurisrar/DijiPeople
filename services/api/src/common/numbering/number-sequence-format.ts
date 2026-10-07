/**
 * The pure half of platform numbering (ADR-0027): how a sequence value becomes
 * a human-readable number, and which configurations are acceptable.
 *
 * Kept free of Prisma and Nest so the settings screen's preview, the API's
 * validation and the allocation path all format with the same function — a
 * preview that disagreed with the number actually issued would be worse than
 * no preview.
 */

export type NumberSequenceFormat = {
  prefix: string;
  separator: string;
  suffix: string;
  padding: number;
};

/**
 * The formatted number is
 *
 *     prefix + separator + lpad(value, padding, '0') + suffix
 *
 * exactly as the `PlatformNumberSequence` model documents it. The separator
 * sits between the prefix and the digits only; a suffix that wants one carries
 * it itself (`-Q`), which keeps the rule one sentence long. `padding` is a
 * minimum width: a value with more digits than `padding` is written whole and
 * never truncated, because a truncated number is a duplicate waiting to
 * happen (the migration's backfill follows the same rule).
 *
 *     { prefix: 'PART-', separator: '', suffix: '', padding: 6 }, 1  -> PART-000001
 *     { prefix: 'PART',  separator: '/', suffix: '-Q', padding: 4 }, 12 -> PART/0012-Q
 *     { prefix: '',      separator: '',  suffix: '', padding: 2 }, 1234 -> 1234
 */
export function formatSequenceNumber(
  format: NumberSequenceFormat,
  value: number,
): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('A sequence value must be a non-negative integer.');
  }
  return `${format.prefix}${format.separator}${String(value).padStart(
    format.padding,
    '0',
  )}${format.suffix}`;
}

/**
 * Uppercase letters, digits and `- _ / .`, at most 12 characters.
 *
 * Bounded because the result is printed on agreements, invoices and partner
 * correspondence, searched for, and pasted into URLs and file names: spaces,
 * lowercase look-alikes and punctuation outside this set have no business in an
 * identifier and each one is a way to make two numbers look alike.
 */
export const NUMBER_SEQUENCE_PART_PATTERN = /^[A-Z0-9\-_/.]{0,12}$/;
export const NUMBER_SEQUENCE_PART_MAX_LENGTH = 12;
export const NUMBER_SEQUENCE_MIN_PADDING = 1;
export const NUMBER_SEQUENCE_MAX_PADDING = 12;
/** `PlatformNumberSequence.nextValue` is a PostgreSQL INTEGER. */
export const NUMBER_SEQUENCE_MAX_VALUE = 2_147_483_647;

/** Sequence keys are code identifiers (`partner`), never operator text. */
export const NUMBER_SEQUENCE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export type NumberSequenceChange = Partial<NumberSequenceFormat> & {
  nextValue?: number;
};

/**
 * Every problem with a proposed change, as field -> message. Empty means
 * valid. `currentNextValue` is the value the sequence would issue now; the
 * proposed `nextValue` may equal it or exceed it, never undercut it.
 *
 * WHY RAISE-ONLY. Every value below `nextValue` has already been issued to a
 * record (or was released by a rolled-back create and is simply skipped).
 * Lowering the counter would make the next allocation return a number a
 * partner already carries; the unique index on the record would then refuse
 * the create, so in practice "lowering" means "partner creation fails until
 * the counter climbs back past the highest issued number". Raising is always
 * safe — it only leaves a gap — which is why it is the one direction an
 * operator may move it (to align with an external register, say).
 */
export function validateNumberSequenceChange(
  change: NumberSequenceChange,
  currentNextValue: number,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of ['prefix', 'separator', 'suffix'] as const) {
    const value = change[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !NUMBER_SEQUENCE_PART_PATTERN.test(value))
      errors[field] =
        `Use up to ${NUMBER_SEQUENCE_PART_MAX_LENGTH} uppercase letters, digits or - _ / .`;
  }

  if (change.padding !== undefined) {
    if (
      !Number.isInteger(change.padding) ||
      change.padding < NUMBER_SEQUENCE_MIN_PADDING ||
      change.padding > NUMBER_SEQUENCE_MAX_PADDING
    )
      errors.padding = `Padding must be a whole number from ${NUMBER_SEQUENCE_MIN_PADDING} to ${NUMBER_SEQUENCE_MAX_PADDING}.`;
  }

  if (change.nextValue !== undefined) {
    if (
      !Number.isInteger(change.nextValue) ||
      change.nextValue < 1 ||
      change.nextValue > NUMBER_SEQUENCE_MAX_VALUE
    )
      errors.nextValue = `Next number must be a whole number from 1 to ${NUMBER_SEQUENCE_MAX_VALUE}.`;
    else if (change.nextValue < currentNextValue)
      errors.nextValue = `Next number can only increase (currently ${currentNextValue}).`;
  }

  return errors;
}
