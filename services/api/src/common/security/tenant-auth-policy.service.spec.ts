import { TenantAuthPolicyService } from './tenant-auth-policy.service';

function buildService(
  rows: Array<{ key: string; value: unknown }>,
  env: Record<string, string> = {},
) {
  const tenantSetting = { findMany: jest.fn().mockResolvedValue(rows) };
  const configService = { get: jest.fn((key: string) => env[key]) };
  const service = new TenantAuthPolicyService(
    { tenantSetting } as never,
    configService as never,
  );
  return { service, tenantSetting, configService };
}

describe('TenantAuthPolicyService', () => {
  /*
   * BUG-3355 — the owner decided concurrent sessions are allowed by default.
   * `persistRefreshToken` used to read `setting?.value === true`, so a tenant
   * with no `security` settings row at all — which is every tenant that has
   * never visited Security & Access — got the *most* restrictive reading:
   * single session only, silently. This pins the inverted default so a future
   * change back to "absent means false" fails here rather than in production.
   */
  it('allows multiple active sessions by default for a tenant with no security settings row', async () => {
    const { service } = buildService([]);

    const policy = await service.resolveEffectivePolicy(
      'tenant-without-settings',
    );

    expect(policy.allowMultipleActiveSessions).toBe(true);
  });

  it('honours an explicit false for allowMultipleActiveSessions', async () => {
    const { service } = buildService([
      { key: 'allowMultipleActiveSessions', value: false },
    ]);

    const policy = await service.resolveEffectivePolicy(
      'tenant-single-session',
    );

    expect(policy.allowMultipleActiveSessions).toBe(false);
  });

  it('honours an explicit true for allowMultipleActiveSessions', async () => {
    const { service } = buildService([
      { key: 'allowMultipleActiveSessions', value: true },
    ]);

    const policy = await service.resolveEffectivePolicy('tenant-multi-session');

    expect(policy.allowMultipleActiveSessions).toBe(true);
  });

  it('falls back to the hardcoded defaults when no setting and no env var are present', async () => {
    const { service } = buildService([]);

    const policy = await service.resolveEffectivePolicy('tenant-plain');

    expect(policy.sessionTimeoutMinutes).toBe(480);
    expect(policy.idleTimeoutMinutes).toBe(480);
    expect(policy.absoluteSessionLifetimeDays).toBe(30);
    expect(policy.refreshTokenExpiryDays).toBe(30);
    expect(policy.allowRememberMe).toBe(true);
  });

  /*
   * ITEM-0162 — deliberately NOT wired: production has
   * `AUTH_IDLE_SESSION_TIMEOUT_SECONDS=30m` and
   * `AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h` set, far below the hardcoded
   * defaults every unconfigured tenant currently lives on (480 minutes, 30
   * days). Making these variables the policy's fallback would silently drop
   * every such tenant's absolute session lifetime from 30 days to 8 hours the
   * moment this ships — a product decision, not a bug-fix side effect. This
   * pins that an env var is currently inert on this path; wiring it in later
   * should be a deliberate, visible change to this test, not an accidental
   * regression of it.
   */
  it('does not let an AUTH_* environment variable override the hardcoded default', async () => {
    const { service } = buildService([], {
      AUTH_IDLE_SESSION_TIMEOUT_SECONDS: '1800',
      AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS: '28800',
    });

    const policy = await service.resolveEffectivePolicy('tenant-env-set');

    expect(policy.idleTimeoutMinutes).toBe(480);
    expect(policy.absoluteSessionLifetimeDays).toBe(30);
  });

  it('a tenant setting is still the only thing that can override the default', async () => {
    const { service } = buildService(
      [{ key: 'idleTimeoutMinutes', value: 60 }],
      { AUTH_IDLE_SESSION_TIMEOUT_SECONDS: '1800' },
    );

    const policy = await service.resolveEffectivePolicy('tenant-setting-wins');

    expect(policy.idleTimeoutMinutes).toBe(60);
  });
});
