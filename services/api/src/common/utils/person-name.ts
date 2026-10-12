/**
 * The name to store for a person whose source record may be incomplete.
 *
 * Provisioning used to fill a missing last name with the word "Owner" and a
 * missing first name with "Workspace", so a workspace owner entered as "Anou"
 * became the user "Anou Owner" — and every screen that names the owner, in
 * Platform Admin and in the tenant app, printed the placeholder as if it were
 * their surname (BUG-4111). `User.lastName` is required by the schema but may
 * be empty; an empty surname is the truth, a made-up one is not.
 *
 * The first name cannot be empty, so it falls back to the part of the email
 * before the `@` — something the person actually typed — rather than a word
 * nobody did.
 */
export function storedPersonName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): { firstName: string; lastName: string } {
  const firstName =
    input.firstName?.trim() || input.email.split('@')[0]?.trim() || input.email;
  return { firstName, lastName: input.lastName?.trim() ?? '' };
}

/** The placeholder words earlier provisioning wrote; see `storedPersonName`. */
export const LEGACY_PLACEHOLDER_FIRST_NAME = 'Workspace';
export const LEGACY_PLACEHOLDER_LAST_NAME = 'Owner';
