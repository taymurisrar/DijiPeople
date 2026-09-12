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
   * ITEM-0162 — an explicitly configured AUTH_* environment variable becomes
   * the *default* the policy falls back to for a tenant with no setting row,
   * rather than being silently ignored on the tenant path.
   */
  it('uses an explicit AUTH_IDLE_SESSION_TIMEOUT_SECONDS as the fallback default', async () => {
    const { service } = buildService([], {
      AUTH_IDLE_SESSION_TIMEOUT_SECONDS: '1800',
    });

    const policy = await service.resolveEffectivePolicy('tenant-env-idle');

    expect(policy.idleTimeoutMinutes).toBe(30);
  });

  it('still lets a tenant setting win over an explicit env var', async () => {
    const { service } = buildService(
      [{ key: 'idleTimeoutMinutes', value: 60 }],
      { AUTH_IDLE_SESSION_TIMEOUT_SECONDS: '1800' },
    );

    const policy = await service.resolveEffectivePolicy('tenant-setting-wins');

    expect(policy.idleTimeoutMinutes).toBe(60);
  });
});
