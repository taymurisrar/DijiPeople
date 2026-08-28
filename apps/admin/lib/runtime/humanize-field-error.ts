/*
 * Turning an API validation message into something the operator can act on.
 *
 * Admin error modals showed raw implementation detail: "Database constraint
 * failed", and "primaryContactFirstName must be shorter than or equal to 100
 * characters" — a Postgres failure class and a DTO property name, neither of
 * which corresponds to anything visible on screen (BUG-1549).
 *
 * class-validator composes its messages as `<property> <constraint>`, and the
 * property is the DTO's name for the field, not the form's. The form already
 * knows what it calls that field, so the substitution is a rename rather than a
 * rewrite — the constraint half is left exactly as it came, because it is the
 * part that says what is actually wrong and inventing wording for it would mean
 * guessing at rules this file cannot see.
 */

/**
 * Replace a leading DTO property name with the label the operator sees.
 *
 * Only the *leading* occurrence, and only when the message starts with it. A
 * property name appearing mid-sentence is usually being quoted for a reason,
 * and a blanket replace would corrupt messages that name a field deliberately.
 */
export function humanizeFieldError(
  fieldKey: string,
  message: string,
  label?: string,
): string {
  if (!label || !message) return message;
  if (!message.startsWith(fieldKey)) return message;

  const rest = message.slice(fieldKey.length);
  // Only when the property name is a whole word — `partner` must not rename
  // the start of `partnerId must be a UUID`.
  if (rest && /^[A-Za-z0-9_]/.test(rest)) return message;

  return `${label}${rest}`;
}

/**
 * Messages that name an internal failure and tell the operator nothing.
 *
 * These are not field errors and cannot be renamed into usefulness — a
 * Postgres constraint class is not a sentence about the form. Replaced with
 * something that says what happened and what to do, and deliberately not with
 * something that pretends to know which field caused it.
 */
const INTERNAL_MESSAGES: Array<{ match: RegExp; replacement: string }> = [
  {
    match: /^database constraint failed/i,
    replacement:
      "This change conflicts with an existing record. Check any fields that must be unique, such as a code, key or email address.",
  },
  {
    match: /^(internal server error|unexpected error)/i,
    replacement:
      "Something went wrong on our side. The failure has been recorded; try again, and quote the trace id if it keeps happening.",
  },
];

/** Whether this message is implementation detail rather than user-facing text. */
export function humanizeErrorMessage(message: string): string {
  if (!message) return message;
  for (const { match, replacement } of INTERNAL_MESSAGES) {
    if (match.test(message.trim())) return replacement;
  }
  return message;
}
