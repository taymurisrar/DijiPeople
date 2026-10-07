/**
 * Where a signed-in user manages their own two-factor authentication.
 *
 * The MFA card lives on My Profile, below the whole employee form, and nothing
 * pointed at it — users reported that MFA could not be found at all. The
 * account menu now links straight to the card through this anchor.
 *
 * A plain module rather than an export of the client card: a constant imported
 * from a "use client" file into a server component arrives as a client
 * reference, not a string.
 */
export const ACCOUNT_SECURITY_ANCHOR = "security";

export function accountSecurityHref(profileHref: string): string {
  return `${profileHref}#${ACCOUNT_SECURITY_ANCHOR}`;
}
