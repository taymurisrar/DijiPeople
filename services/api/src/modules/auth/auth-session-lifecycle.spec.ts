import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { getAuthCookieNames } from '../../common/config/auth.config';
import { AuthService } from './auth.service';

/**
 * Signing out, staying signed in, and the difference between the two.
 *
 * These are the assertions behind the auth validation of SESSION-0084 — login,
 * logout, refresh, expiry and remember-me. They are unit tests against the
 * service rather than an e2e sweep because the live sweep cannot be re-run on
 * demand: `POST /auth/login` is budgeted at twenty writes per ten minutes per
 * IP, so a validation run exhausts the budget long before it has covered
 * anything, and every 429 after that looks exactly like a broken login.
 *
 * What is deliberately NOT here: the rate-limit budgets themselves, which
 * `public-rate-limit.guard.spec.ts` and
 * `public-write-rate-limit.invariant.spec.ts` already assert route by route —
 * including that `/auth/refresh` carries the machine-traffic budget and that the
 * credential routes did not inherit it.
 */
describe('auth session lifecycle', () => {
  /** Only the fields these tests read back. */
  type TokenBundle = {
    tokens: {
      rememberMe: boolean;
      accessTokenExpiresIn: string;
      refreshTokenExpiresIn: string;
    };
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'JWT_REFRESH_SECRET' ? 'refresh-secret' : undefined,
    ),
  };

  const tokenStore = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  let prisma: {
    refreshToken: ReturnType<typeof tokenStore>;
    platformRefreshToken: ReturnType<typeof tokenStore>;
    tenantSetting: { findMany: jest.Mock };
  };
  let service: AuthService;

  /**
   * The two token builders, which are private.
   *
   * Reached through one typed view rather than a cast at each call site, so the
   * results stay typed — `Function.prototype.call` would erase them back to
   * `any` and take every assertion below with it.
   */
  const builders = () =>
    service as unknown as {
      buildAuthResponse: (
        user: unknown,
        rememberMe: boolean,
      ) => Promise<TokenBundle>;
      buildPlatformAuthResponse: (
        user: unknown,
        rememberMe: boolean,
      ) => TokenBundle;
    };

  beforeEach(() => {
    prisma = {
      refreshToken: tokenStore(),
      platformRefreshToken: tokenStore(),
      tenantSetting: { findMany: jest.fn().mockResolvedValue([]) },
    };

    service = new AuthService(
      prisma as never,
      {
        verifyAsync: jest.fn(),
        sign: jest.fn((payload: unknown) => JSON.stringify(payload)),
      } as unknown as JwtService,
      configService as unknown as ConfigService,
      {} as never,
      {} as never,
      {
        findByIdWithAccess: jest.fn(),
        findManyByEmailWithAccess: jest.fn(),
        markLastLogin: jest.fn(),
      } as never,
      { bootstrapTenantRbac: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { sendEmail: jest.fn() } as never,
      { log: jest.fn() } as never,
      { assertPasswordMeetsPolicy: jest.fn() } as never,
      {
        isLocked: jest.fn().mockReturnValue(false),
        registerFailure: jest.fn(),
        registerSuccess: jest.fn(),
      } as never,
    );
  });

  const cookieNames = (clientId: 'web' | 'admin') =>
    getAuthCookieNames(configService as unknown as ConfigService, clientId);

  const request = (
    clientId: 'web' | 'admin',
    cookies: Record<string, string>,
  ) =>
    ({
      cookies,
      headers: { 'x-dijipeople-app': clientId },
    }) as unknown as Request;

  /** The response plus a direct handle on its spy, so no method is unbound. */
  const response = () => {
    const clearCookie = jest.fn();
    const cookie = jest.fn();
    return {
      res: { clearCookie, cookie } as unknown as Response,
      clearCookie,
    };
  };

  const revokedBySession = (sessionId: string, appClientId: 'web' | 'admin') =>
    expect.objectContaining({
      where: { sessionId, appClientId, revokedAt: null },
    }) as unknown;

  describe('logout revokes the session, not just the browser', () => {
    it('revokes by session id even when the refresh cookie is present', async () => {
      /*
       * BUG-2506. This is the ordinary sign-out — every cookie present — and it
       * used to skip the exact revocation entirely, falling through to a scan of
       * the twenty most recently created live tokens for the client across the
       * whole deployment, bcrypt-comparing each one. On a tenant that has issued
       * more than twenty refresh tokens since the session began, the
       * signer-out's own token is simply not in that list: cookies cleared,
       * screen says signed out, refresh token still valid for its full lifetime.
       */
      const names = cookieNames('web');
      await service.logout(
        request('web', {
          [names.refresh]: 'a-live-refresh-token',
          [names.session]: 'session-abc',
        }),
        response().res,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        revokedBySession('session-abc', 'web'),
      );
    });

    it('still revokes when only the session cookie survives', async () => {
      // The sign-out that follows a session-expired modal, which is the flow
      // BUG-0627 was raised about: the refresh cookie is the shortest-lived of
      // the three and is usually already gone by then.
      const names = cookieNames('web');
      await service.logout(
        request('web', { [names.session]: 'session-def' }),
        response().res,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        revokedBySession('session-def', 'web'),
      );
    });

    it('revokes the platform table for an admin sign-out, and never the tenant one', async () => {
      // Platform admin is a separate identity system with a separate token
      // store. Crossing them would either leave a platform session live or
      // revoke a tenant user who was not signing out.
      const names = cookieNames('admin');
      await service.logout(
        request('admin', {
          [names.refresh]: 'a-live-platform-token',
          [names.session]: 'platform-session-1',
        }),
        response().res,
      );

      expect(prisma.platformRefreshToken.updateMany).toHaveBeenCalledWith(
        revokedBySession('platform-session-1', 'admin'),
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('clears the cookies whether or not a session was named', async () => {
      const { res, clearCookie } = response();
      await service.logout(request('web', {}), res);

      expect(clearCookie).toHaveBeenCalled();
      // Nothing to revoke, and nothing pretends otherwise.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('keeps an already-closed session at the moment it was actually closed', async () => {
      const names = cookieNames('web');
      await service.logout(
        request('web', { [names.session]: 'session-ghi' }),
        response().res,
      );

      // `revokedAt: null` in the filter is what stops a second sign-out moving
      // the first one's timestamp forward.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }) as unknown,
        }),
      );
    });
  });

  describe('remember me changes how long a session lives', () => {
    const tenantUser = {
      id: 'user-1',
      email: 'employee@example.test',
      firstName: 'Ada',
      lastName: 'Employee',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      // Empty rather than representative: these tests are about token
      // lifetimes, and the user summary only has to survive being built.
      userRoles: [],
      teamMemberships: [],
      userPermissions: [],
      tenant: {
        id: 'tenant-1',
        name: 'Example',
        slug: 'example',
        status: 'Active',
        ownerUserId: 'someone-else',
      },
    };

    const platformUser = {
      id: 'platform-user-1',
      email: 'owner@example.test',
      firstName: 'Platform',
      lastName: 'Owner',
      role: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };

    const withPolicy = (allowRememberMe: boolean) => {
      prisma.tenantSetting.findMany.mockResolvedValue([
        { key: 'allowRememberMe', value: allowRememberMe },
        { key: 'refreshTokenExpiryDays', value: 14 },
      ]);
    };

    it('extends the tenant refresh token to the policy lifetime', async () => {
      withPolicy(true);

      const result = await builders().buildAuthResponse(tenantUser, true);

      expect(result.tokens.rememberMe).toBe(true);
      expect(result.tokens.refreshTokenExpiresIn).toBe('14d');
    });

    it('refuses remember-me when the tenant policy disallows it', async () => {
      // The client asks; the tenant decides. A browser sending
      // `rememberMe: true` against a tenant that turned it off gets an ordinary
      // session, not a long one.
      withPolicy(false);

      const result = await builders().buildAuthResponse(tenantUser, true);

      expect(result.tokens.rememberMe).toBe(false);
      expect(result.tokens.refreshTokenExpiresIn).not.toBe('14d');
    });

    it('issues an ordinary session when remember-me was not asked for', async () => {
      withPolicy(true);

      const result = await builders().buildAuthResponse(tenantUser, false);

      expect(result.tokens.rememberMe).toBe(false);
      expect(result.tokens.refreshTokenExpiresIn).not.toBe('14d');
    });

    it('the platform path honours remember-me with no policy able to refuse it', () => {
      /*
       * PINNED, NOT ENDORSED. The handoff for this work expected remember-me to
       * extend nothing on the platform admin path. It does: both the access and
       * the refresh lifetime grow, to 30m and 30d by default.
       *
       * The asymmetry is the point of this test. A tenant can switch remember-me
       * off for its own users through `allowRememberMe`; the platform path has
       * no equivalent, so the most privileged identity in the system has its
       * session lifetime decided by a boolean the client sends. Recorded as
       * BUG-2509 — this pins today's behaviour so that changing it is a decision
       * rather than an accident.
       */
      const remembered = builders().buildPlatformAuthResponse(
        platformUser,
        true,
      );
      const ordinary = builders().buildPlatformAuthResponse(
        platformUser,
        false,
      );

      expect(remembered.tokens.refreshTokenExpiresIn).toBe('30d');
      expect(remembered.tokens.accessTokenExpiresIn).toBe('30m');
      expect(ordinary.tokens.refreshTokenExpiresIn).not.toBe('30d');
      expect(ordinary.tokens.accessTokenExpiresIn).not.toBe('30m');
    });
  });
});
