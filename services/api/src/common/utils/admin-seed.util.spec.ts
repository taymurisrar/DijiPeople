import {
  AdminSeedConfigurationError,
  decideAdminSeedAction,
  type AdminSeedInput,
} from './admin-seed.util';

/**
 * These are deployment behaviours, not helper behaviours. `seed:admin` runs
 * inside `npm run release`, which is `render.yaml`'s `preDeployCommand`, so
 * every case below describes something that happens on a real deploy.
 */
function input(overrides: Partial<AdminSeedInput> = {}): AdminSeedInput {
  return {
    email: 'ops@example.com',
    password: 'a-sufficiently-long-password',
    firstName: 'Platform',
    lastName: 'Administrator',
    passwordResetRequested: false,
    anyActiveSuperAdminExists: false,
    namedUserExists: false,
    ...overrides,
  };
}

describe('decideAdminSeedAction', () => {
  it('creates the first super admin when the database has none', () => {
    const action = decideAdminSeedAction(input());
    expect(action).toMatchObject({ kind: 'CREATE', email: 'ops@example.com' });
  });

  it('refuses to create one with a password too short to be worth having', () => {
    expect(() => decideAdminSeedAction(input({ password: 'short' }))).toThrow(
      AdminSeedConfigurationError,
    );
  });

  /*
   * The defect this file exists for. Before the fix, the upsert's `update`
   * branch wrote `passwordHash`, so every deploy reset the platform super
   * admin's password to whatever was still sitting in the Render dashboard —
   * including a password that had just been rotated because it leaked.
   *
   * Verified empirically before the fix against a real database: two runs of
   * `seed:admin` with different PLATFORM_SUPER_ADMIN_PASSWORD values produced
   * two different stored hashes.
   */
  it('does not touch an existing admin on a redeploy', () => {
    const action = decideAdminSeedAction(
      input({ namedUserExists: true, anyActiveSuperAdminExists: true }),
    );
    expect(action.kind).toBe('SKIP');
  });

  it('resets only when reset is explicitly requested', () => {
    const withoutFlag = decideAdminSeedAction(
      input({ namedUserExists: true, passwordResetRequested: false }),
    );
    const withFlag = decideAdminSeedAction(
      input({ namedUserExists: true, passwordResetRequested: true }),
    );

    // Asserted as a pair: the flag must be what makes the difference. Testing
    // only the `true` case would still pass if the decision ignored the flag
    // and reset unconditionally — which is precisely the bug being fixed.
    expect(withoutFlag.kind).toBe('SKIP');
    expect(withFlag.kind).toBe('RESET');
  });

  /*
   * The other half of the defect. `render.yaml` never declared
   * PLATFORM_SUPER_ADMIN_EMAIL, so on the first production deploy this threw
   * and aborted `preDeployCommand` — taking `seed:legal` and `legal:publish`
   * down with it, which are the steps that make a purchase record consent.
   *
   * The variable is now declared, but the script must also tolerate an operator
   * who removed it after bootstrapping, which is the right thing to do with a
   * password you do not want living in a dashboard.
   */
  it('is a no-op when unset and somebody can already sign in', () => {
    const action = decideAdminSeedAction(
      input({ email: '', password: '', anyActiveSuperAdminExists: true }),
    );
    expect(action.kind).toBe('SKIP');
  });

  it('still fails loudly when unset and nobody can sign in', () => {
    // Not a no-op: a platform with no super admin also has nobody to attribute
    // legal publication to, so continuing would produce a broken deployment
    // that looks successful.
    expect(() =>
      decideAdminSeedAction(
        input({ email: '', password: '', anyActiveSuperAdminExists: false }),
      ),
    ).toThrow(AdminSeedConfigurationError);
  });

  it('bootstraps a named admin even when another active super admin exists', () => {
    // Adding a second break-glass account is legitimate; the existing one is
    // not a reason to skip a name that has never been seen before.
    const action = decideAdminSeedAction(
      input({ anyActiveSuperAdminExists: true, namedUserExists: false }),
    );
    expect(action.kind).toBe('CREATE');
  });
});
