import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard tenant session policy', () => {
  it('uses the tenant idle timeout for web sessions', async () => {
    const tenantSetting = {
      findFirst: jest.fn().mockResolvedValue({ value: 120 }),
    };
    const guard = new JwtAuthGuard(
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      { tenantSetting } as never,
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

    expect(tenantSetting.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        category: 'security',
        key: 'idleTimeoutMinutes',
      },
      select: { value: true },
    });
    expect(timeout).toBe(120 * 60_000);
  });
});
