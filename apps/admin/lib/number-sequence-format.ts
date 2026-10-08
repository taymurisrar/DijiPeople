/**
 * Live preview and client-side checks for Settings > Numbering (ADR-0027).
 *
 * The API is the authority: it formats every number it issues with
 * `formatSequenceNumber` in `services/api/src/common/numbering/
 * number-sequence-format.ts`, validates every change, and returns the saved
 * sequence's own `preview`. This file mirrors those rules only so the screen
 * can show "PART-000001" while the operator types and refuse an obviously
 * invalid value before a round trip. `number-sequence-format.spec.ts` pins
 * the same examples the API spec does, so a change to one side that is not
 * made to the other fails a test rather than a preview.
 */

export type NumberSequenceFormat = {
  prefix: string;
  separator: string;
  suffix: string;
  padding: number;
};

export type NumberSequence = NumberSequenceFormat & {
  key: string;
  label: string;
  nextValue: number;
  resetPolicy: string;
  updatedAt: string;
  updatedById: string | null;
  preview: string;
};

export const NUMBER_SEQUENCE_PART_PATTERN = /^[A-Z0-9\-_/.]{0,12}$/;
export const NUMBER_SEQUENCE_MIN_PADDING = 1;
export const NUMBER_SEQUENCE_MAX_PADDING = 12;
export const NUMBER_SEQUENCE_MAX_VALUE = 2_147_483_647;

/** prefix + separator + lpad(value, padding, '0') + suffix; never truncates. */
export function formatSequenceNumber(
  format: NumberSequenceFormat,
  value: number,
): string {
  const digits = Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
  const padding = Number.isInteger(format.padding) ? format.padding : 0;
  return `${format.prefix}${format.separator}${digits.padStart(padding, "0")}${format.suffix}`;
}

export type NumberSequenceDraft = {
  prefix: string;
  separator: string;
  suffix: string;
  padding: string;
  nextValue: string;
};

/**
 * Field -> message for a draft. `currentNextValue` is the value the sequence
 * would issue now; the next number may stay or rise, never fall, because
 * every lower number has already been issued.
 */
export function validateNumberSequenceDraft(
  draft: NumberSequenceDraft,
  currentNextValue: number,
): Partial<Record<keyof NumberSequenceDraft, string>> {
  const errors: Partial<Record<keyof NumberSequenceDraft, string>> = {};
  for (const field of ["prefix", "separator", "suffix"] as const) {
    if (!NUMBER_SEQUENCE_PART_PATTERN.test(draft[field]))
      errors[field] = "Use up to 12 of A-Z, 0-9, - _ / .";
  }
  const padding = Number(draft.padding);
  if (
    !Number.isInteger(padding) ||
    padding < NUMBER_SEQUENCE_MIN_PADDING ||
    padding > NUMBER_SEQUENCE_MAX_PADDING
  )
    errors.padding = `Enter ${NUMBER_SEQUENCE_MIN_PADDING} to ${NUMBER_SEQUENCE_MAX_PADDING}.`;
  const nextValue = Number(draft.nextValue);
  if (
    !Number.isInteger(nextValue) ||
    nextValue < 1 ||
    nextValue > NUMBER_SEQUENCE_MAX_VALUE
  )
    errors.nextValue = "Enter a whole number.";
  else if (nextValue < currentNextValue)
    errors.nextValue = `Can only increase (currently ${currentNextValue}).`;
  return errors;
}

export function draftFromSequence(
  sequence: NumberSequence,
): NumberSequenceDraft {
  return {
    prefix: sequence.prefix,
    separator: sequence.separator,
    suffix: sequence.suffix,
    padding: String(sequence.padding),
    nextValue: String(sequence.nextValue),
  };
}

/** Only the fields that changed, typed for `PATCH …/numbering/:key`. */
export function numberSequencePatch(
  sequence: NumberSequence,
  draft: NumberSequenceDraft,
): Partial<NumberSequenceFormat & { nextValue: number }> {
  const patch: Partial<NumberSequenceFormat & { nextValue: number }> = {};
  if (draft.prefix !== sequence.prefix) patch.prefix = draft.prefix;
  if (draft.separator !== sequence.separator) patch.separator = draft.separator;
  if (draft.suffix !== sequence.suffix) patch.suffix = draft.suffix;
  if (Number(draft.padding) !== sequence.padding)
    patch.padding = Number(draft.padding);
  if (Number(draft.nextValue) !== sequence.nextValue)
    patch.nextValue = Number(draft.nextValue);
  return patch;
}
