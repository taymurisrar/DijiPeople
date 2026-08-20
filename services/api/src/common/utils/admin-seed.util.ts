/**
 * What `seed:admin` should do on this run.
 *
 * **Why this is a separate, pure function.** `seed:admin` is part of
 * `npm run release`, which `render.yaml` sets as `preDeployCommand` — so it runs
 * on *every* deploy, not just the first one. That makes "what should happen when
 * the admin already exists" a production behaviour, and production behaviour
 * deserves a test. The script itself cannot easily have one: it opens a Prisma
 * client at import time and calls `process.exit`.
 *
 * Two defects motivated it, both found by running the real release command
 * against an empty database before going live:
 *
 *  1. The script threw `PLATFORM_SUPER_ADMIN_EMAIL is required` whenever the
 *     variable was unset. `render.yaml` never declared it, so the first
 *     production deploy would have aborted in `preDeployCommand` — and taken
 *     `seed:legal` and `legal:publish` down with it, which are the steps that
 *     make a purchase record consent at all.
 *  2. The upsert wrote `passwordHash` in its `update` branch. Keeping the
 *     variable set — the only way to stop (1) — therefore reset the platform
 *     super admin's password to the environment value on every single deploy.
 *     Including a password that had just been changed *because it leaked*.
 *
 * So the two obvious configurations were "every deploy fails" and "every deploy
 * silently reverts the super admin's credential". The rule below is that a
 * deploy never modifies an existing platform user unless it is explicitly told
 * to.
 */

export const MINIMUM_ADMIN_PASSWORD_LENGTH = 12;

export type AdminSeedAction =
  | {
      kind: 'CREATE';
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }
  | {
      kind: 'RESET';
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }
  | { kind: 'SKIP'; reason: string };

export type AdminSeedInput = {
  /** Normalised; empty string when the variable is unset. */
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** `PLATFORM_SUPER_ADMIN_PASSWORD_RESET` — an explicit break-glass request. */
  passwordResetRequested: boolean;
  /** Is there any ACTIVE SUPER_ADMIN at all? */
  anyActiveSuperAdminExists: boolean;
  /** Does a PlatformUser with exactly this email already exist? */
  namedUserExists: boolean;
};

/** Configuration that cannot produce a usable outcome, as opposed to a no-op. */
export class AdminSeedConfigurationError extends Error {}

export function decideAdminSeedAction(input: AdminSeedInput): AdminSeedAction {
  const email = input.email.trim();

  if (!email) {
    /*
     * No variable set. If the platform already has someone who can sign in,
     * that is a complete, intentional configuration: the operator set the
     * credentials for the first deploy and then removed them, which is what
     * they should do with a password they no longer want living in a dashboard.
     */
    if (input.anyActiveSuperAdminExists) {
      return {
        kind: 'SKIP',
        reason:
          'PLATFORM_SUPER_ADMIN_EMAIL is not set and an active platform super admin already exists. Nothing to bootstrap.',
      };
    }

    /*
     * Nobody can sign in and nothing says who should. This genuinely cannot
     * proceed — and it must fail loudly, because a platform with no super admin
     * also has nobody to attribute legal publication to.
     */
    throw new AdminSeedConfigurationError(
      'PLATFORM_SUPER_ADMIN_EMAIL is required: this database has no active platform super admin, so there is nobody to bootstrap and nobody who could sign in to create one.',
    );
  }

  if (!input.namedUserExists) {
    assertUsablePassword(input.password);
    return {
      kind: 'CREATE',
      email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
    };
  }

  if (!input.passwordResetRequested) {
    /*
     * The named admin exists. Leaving them alone is the whole point: a redeploy
     * is not a reason to change somebody's password, name, role or status.
     * Re-activating here would be worse than pointless — it would silently undo
     * the suspension of a compromised account on the next deploy.
     */
    return {
      kind: 'SKIP',
      reason: `Platform super admin ${email} already exists; leaving the existing password, role and status untouched. Set PLATFORM_SUPER_ADMIN_PASSWORD_RESET=true to deliberately reset them.`,
    };
  }

  assertUsablePassword(input.password);
  return {
    kind: 'RESET',
    email,
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
  };
}

function assertUsablePassword(password: string): void {
  if (password.length < MINIMUM_ADMIN_PASSWORD_LENGTH) {
    throw new AdminSeedConfigurationError(
      `PLATFORM_SUPER_ADMIN_PASSWORD must be at least ${MINIMUM_ADMIN_PASSWORD_LENGTH} characters long.`,
    );
  }
}
