/**
 * Whether a typed value is shaped like an email address.
 *
 * Deliberately loose — one "@", something either side, a dot in the domain, no
 * spaces. It exists to stop a submission the API's class-validator `@IsEmail`
 * would certainly refuse ("email must be an email", the commonest agreement
 * incident in production monitoring), not to decide what is deliverable. The
 * server stays the authority.
 */
export function isEmailShaped(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** An inline message for a non-empty value that is not email-shaped. */
export function emailFormatError(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && !isEmailShaped(trimmed)
    ? "Enter a valid email address, like name@company.com."
    : null;
}
