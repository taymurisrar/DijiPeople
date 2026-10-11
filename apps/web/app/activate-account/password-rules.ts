/*
 * Pure password-entry logic shared by the activation and reset forms, kept out
 * of the components so it can be tested without a DOM (web jest is node-only).
 */

/*
 * Mirrors ResolvedPasswordPolicy in
 * services/api/src/modules/auth/password-policy.service.ts. The policy is
 * per-tenant, so the client never hard-codes numbers: it only renders a
 * checklist for a policy the API handed it. The server stays the authority and
 * its own message is shown when it refuses a password.
 */
export type PasswordPolicy = {
  minimumPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialCharacter: boolean;
};

export type PasswordRule = { key: string; label: string; met: boolean };

/* Same definition of "special" as the server: not a letter, digit or space. */
const SPECIAL_CHARACTER = /[^A-Za-z0-9\s]/;

export function evaluatePasswordPolicy(
  password: string,
  policy: PasswordPolicy,
): PasswordRule[] {
  const rules: PasswordRule[] = [
    {
      key: "length",
      label: `At least ${policy.minimumPasswordLength} characters`,
      met: password.length >= policy.minimumPasswordLength,
    },
  ];
  if (policy.requireUppercase) {
    rules.push({ key: "upper", label: "An uppercase letter", met: /[A-Z]/.test(password) });
  }
  if (policy.requireLowercase) {
    rules.push({ key: "lower", label: "A lowercase letter", met: /[a-z]/.test(password) });
  }
  if (policy.requireNumber) {
    rules.push({ key: "number", label: "A number", met: /[0-9]/.test(password) });
  }
  if (policy.requireSpecialCharacter) {
    rules.push({
      key: "special",
      label: "A special character",
      met: SPECIAL_CHARACTER.test(password),
    });
  }
  return rules;
}

export type PasswordComparison =
  | { ok: true }
  | { ok: false; reason: "empty" | "mismatch" | "whitespace-only-difference" };

/*
 * Exact comparison, deliberately untrimmed: a password may legitimately start
 * or end with a space. When the two differ only by edge whitespace we say so,
 * because "does not match" on two identical-looking fields reads as a bug.
 */
export function comparePasswords(
  password: string,
  confirmation: string,
): PasswordComparison {
  if (!password || !confirmation) return { ok: false, reason: "empty" };
  if (password === confirmation) return { ok: true };
  if (password.trim() === confirmation.trim()) {
    return { ok: false, reason: "whitespace-only-difference" };
  }
  return { ok: false, reason: "mismatch" };
}

export function describeComparison(result: PasswordComparison): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case "whitespace-only-difference":
      return "The passwords differ only by a leading or trailing space.";
    case "mismatch":
      return "Passwords do not match.";
    default:
      return null;
  }
}

/*
 * Browser autofill and some password managers set a field's value without
 * firing the React change event, leaving state stale. At submit the DOM is the
 * truth, so prefer it and fall back to state.
 */
export function readPasswordsFromForm(
  form: HTMLFormElement,
  fallback: { password: string; confirmPassword: string },
) {
  const data = new FormData(form);
  const password = data.get("password");
  const confirmPassword = data.get("confirmPassword");
  return {
    password: typeof password === "string" ? password : fallback.password,
    confirmPassword:
      typeof confirmPassword === "string"
        ? confirmPassword
        : fallback.confirmPassword,
  };
}
