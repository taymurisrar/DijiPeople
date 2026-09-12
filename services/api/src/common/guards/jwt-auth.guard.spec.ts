import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantAuthPolicyService } from '../security/tenant-auth-policy.service';

describe('JwtAuthGuard tenant session policy', () => {
  it('uses the tenant idle timeout for web sessions', async () => {
    const tenantSetting = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ key: 'idleTimeoutMinutes', value: 120 }]),
    };
    const tenantAuthPolicyService = new TenantAuthPolicyService(
      { tenantSetting } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );
    const guard = new JwtAuthGuard(
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never,
      tenantAuthPolicyService,
    );

    const timeout = await (
      guard as unknown as {
        resolveIdleTimeoutMs: (
          payload: Record<string, unknown>,
          clientId: 'web',
        ) => Promise<number>;
      }
    ).resolveIdleTimeoutMs(
      {
        sub: 'user-1',
        tenantId: 'tenant-1',
        sessionId: 'session-1',
        tokenVersion: 0,
        authSubjectType: 'tenant-user',
      },
      'web',
    );

    expect(tenantSetting.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        category: 'security',
        key: {
          in: expect.arrayContaining(['idleTimeoutMinutes']) as string[],
        },
      },
      select: { key: true, value: true },
    });
    expect(timeout).toBe(120 * 60_000);
  });

  /*
   * ITEM-0162 — the number this test pins is the same number
   * `AuthService.buildAuthResponse` returns to the client as
   * `idleTimeoutMinutes` for the same tenant, because both now call
   * `TenantAuthPolicyService.resolveEffectivePolicy`. A regression that makes
   * them disagree again fails here, not just in production telemetry.
   */
  it('matches the idle timeout AuthService would advertise for the same tenant with no settings row', async () => {
    const tenantSetting = { findMany: jest.fn().mockResolvedValue([]) };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const tenantAuthPolicyService = new TenantAuthPolicyService(
      { tenantSetting } as never,
      configService as never,
    );
    const guard = new JwtAuthGuard(
      {} as never,
      {} as never,
      configService as never,
      {} as never,
      {} as never,
      tenantAuthPolicyService,
    );

    const [guardTimeoutMs, advertisedPolicy] = await Promise.all([
      (
        guard as unknown as {
          resolveIdleTimeoutMs: (
            payload: Record<string, unknown>,
            clientId: 'web',
          ) => Promise<number>;
        }
      ).resolveIdleTimeoutMs(
        {
          sub: 'user-1',
          tenantId: 'tenant-no-settings',
          sessionId: 'session-1',
          tokenVersion: 0,
          authSubjectType: 'tenant-user',
        },
        'web',
      ),
      tenantAuthPolicyService.resolveEffectivePolicy('tenant-no-settings'),
    ]);

    expect(guardTimeoutMs).toBe(advertisedPolicy.idleTimeoutMinutes * 60_000);
  });
});
