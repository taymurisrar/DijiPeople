import { AuthService } from './auth.service';

/**
 * DP-QA-007. Sign-out took 0.6-3.9 s because a fallback that bcrypt-compares up
 * to twenty stored refresh-token hashes ran on every sign-out that carried a
 * refresh cookie, even after the session had already been revoked by id.
 */
function build(revokedBySession: number) {
  const bcryptScan = jest.fn().mockResolvedValue([]);
  const service = Object.create(AuthService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    configService: { get: jest.fn() },
    prisma: { refreshToken: { findMany: bcryptScan, update: jest.fn() } },
    getClientId: () => 'web',
    extractTokenFromRequest: (_req: unknown, name: string) =>
      name.includes('session') ? 'session-1' : 'refresh-1',
    revokeSessionTokens: jest.fn().mockResolvedValue(revokedBySession),
    clearAuthCookies: jest.fn(),
  });
  return { service, bcryptScan };
}

const logout = (service: Record<string, unknown>) =>
  (
    AuthService.prototype.logout as (
      req: unknown,
      res: unknown,
    ) => Promise<void>
  ).call(service, {}, {});

describe('AuthService.logout', () => {
  it('does not run the bcrypt hash scan when the session revoked its tokens', async () => {
    const { service, bcryptScan } = build(1);
    await logout(service);
    expect(bcryptScan).not.toHaveBeenCalled();
    expect(service.clearAuthCookies).toHaveBeenCalled();
  });

  it('still falls back to the hash scan when the session id revoked nothing', async () => {
    const { service, bcryptScan } = build(0);
    await logout(service);
    expect(bcryptScan).toHaveBeenCalledTimes(1);
  });
});
