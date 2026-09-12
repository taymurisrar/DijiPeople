import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { getAuthCookieNames } from '../../common/config/auth.config';
import { TenantAuthPolicyService } from '../../common/security/tenant-auth-policy.service';
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
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  let prisma: {
    refreshToken: ReturnType<typeof tokenStore>;
    platformRefreshToken: ReturnType<typeof tokenStore>;
    tenantSetting: { findMany: jest.Mock };
  };
  let auditService: { log: jest.Mock };
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
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

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
      auditService as never,
      { assertPasswordMeetsPolicy: jest.fn() } as never,
      {
        isLocked: jest.fn().mockReturnValue(false),
        registerFailure: jest.fn(),
        registerSuccess: jest.fn(),
      } as never,
      {} as never,
      /*
       * A real `TenantAuthPolicyService`, wired to this suite's own `prisma`
       * and `configService` mocks, rather than a hand-rolled stub. This is
       * what lets `withPolicy()` below keep driving `buildAuthResponse`
       * through `prisma.tenantSetting.findMany` exactly as it did before
       * ITEM-0162 moved that lookup out of `AuthService` and into one shared
       * resolver — the resolver is the thing under test elsewhere
       * (`tenant-auth-policy.service.spec.ts`); here it is just plumbing.
       */
      new TenantAuthPolicyService(
        prisma as never,
        configService as unknown as ConfigService,
      ),
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

  describe('a revoked session is refused everywhere, not only behind the guard', () => {
    const payload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-abc',
      appClientId: 'web',
    };

    const isLive = (session: AuthService, p: unknown, clientId: string) =>
      (
        session as unknown as {
          isSessionStillLive: (p: unknown, c: string) => Promise<boolean>;
        }
      ).isSessionStillLive(p, clientId);

    it('asks the same question the guard asks, against the same row', async () => {
      /*
       * BUG-2547. `/auth/me` is `@Public()`, so it never reaches `JwtAuthGuard`
       * and so it never asked whether the session was still open. Verified on
       * production at `fba846d1`: after signing out, a request to `/employees`
       * with that access token was correctly refused `401 SESSION_REVOKED`,
       * while `/auth/me` returned `200` with the caller's identity, roles and
       * permission keys — and would have kept doing so for the remaining 7.98
       * hours of an eight-hour token.
       */
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'row-1' });

      await expect(isLive(service, payload, 'web')).resolves.toBe(true);

      expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: 'session-abc',
            appClientId: 'web',
            revokedAt: null,
            userId: 'user-1',
            tenantId: 'tenant-1',
          }) as unknown,
        }),
      );
    });

    it('reports a revoked session as closed', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(isLive(service, payload, 'web')).resolves.toBe(false);
    });

    it('reads the platform store for a platform subject', async () => {
      prisma.platformRefreshToken.findFirst.mockResolvedValue({ id: 'row-2' });

      await expect(
        isLive(
          service,
          { ...payload, authSubjectType: 'platform-user' },
          'admin',
        ),
      ).resolves.toBe(true);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    });

    it('leaves the desktop agent to its own device-session assertion', async () => {
      // The guard does not use this check for `agent-desktop` either. Answering
      // for it here would be a second opinion rather than the same one.
      await expect(isLive(service, payload, 'agent-desktop')).resolves.toBe(
        true,
      );
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    });

    it('does not sign out a token issued before sessions were recorded', async () => {
      await expect(
        isLive(service, { ...payload, sessionId: undefined }, 'web'),
      ).resolves.toBe(true);
      expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    });
    it('/auth/me itself refuses a revoked session, not merely the helper', async () => {
      /*
       * The assertion that matters. The five above prove `isSessionStillLive`
       * answers correctly; only this one proves `getProfileFromRequest` asks it.
       *
       * Testing the helper alone would repeat the mistake that produced
       * BUG-2505 — a rule asserted from one side, green, while the path that
       * had to honour it did not.
       */
      const names = cookieNames('web');
      const payloadForToken = {
        sub: 'user-1',
        tenantId: 'tenant-1',
        sessionId: 'session-abc',
        appClientId: 'web',
        aud: 'web',
        tokenUse: 'access',
        type: 'access',
      };
      (
        service as unknown as {
          jwtService: { verifyAsync: jest.Mock };
        }
      ).jwtService.verifyAsync.mockResolvedValue(payloadForToken);

      // The session is gone, and no refresh cookie is offered, so the fall
      // through to the refresh path ends in an expired session rather than a
      // profile.
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      const { res, clearCookie } = response();
      await expect(
        (
          service as unknown as {
            getProfileFromRequest: (
              req: Request,
              res: Response,
            ) => Promise<unknown>;
          }
        ).getProfileFromRequest(
          request('web', { [names.access]: 'an-access-token' }),
          res,
        ),
      ).rejects.toMatchObject({ status: 401 });

      expect(prisma.refreshToken.findFirst).toHaveBeenCalled();
      expect(clearCookie).toHaveBeenCalled();
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

  describe('concurrent sessions are allowed unless a tenant opts out', () => {
    /*
     * BUG-3355 — `persistRefreshToken` used to revoke every other live
     * refresh token for the user on this client unless the tenant had
     * explicitly stored `allowMultipleActiveSessions: true`; an absent
     * settings row read as "single session only" and silently signed out
     * anyone who opened a second tab. The owner decided the default should be
     * the other way round: an absent row now means concurrent sessions are
     * permitted, and only an explicit `false` turns single-session back on.
     */
    const persist = (
      session: AuthService,
      overrides: { sessionId?: string } = {},
    ) =>
      (
        session as unknown as {
          persistRefreshToken: (
            userId: string,
            tenantId: string,
            sessionId: string,
            clientId: 'web',
            refreshToken: string,
            refreshTokenTtl: string,
          ) => Promise<void>;
        }
      ).persistRefreshToken(
        'user-1',
        'tenant-1',
        overrides.sessionId ?? 'session-new',
        'web',
        'a-refresh-token',
        '8h',
      );

    it('does not revoke other sessions for a tenant with no security settings row', async () => {
      prisma.tenantSetting.findMany.mockResolvedValue([]);

      await persist(service);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('still revokes other sessions when a tenant explicitly opts out', async () => {
      prisma.tenantSetting.findMany.mockResolvedValue([
        { key: 'allowMultipleActiveSessions', value: false },
      ]);

      await persist(service);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('does not revoke other sessions when a tenant explicitly opts in', async () => {
      prisma.tenantSetting.findMany.mockResolvedValue([
        { key: 'allowMultipleActiveSessions', value: true },
      ]);

      await persist(service);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('refresh rotation grace window (BUG-3359, EXECPLAN-0037)', () => {
    const tenantUser = {
      id: 'user-1',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      email: 'employee@example.test',
      firstName: 'Ada',
      lastName: 'Employee',
      userRoles: [],
      teamMemberships: [],
      userPermissions: [],
      tenant: {
        id: 'tenant-1',
        name: 'Example',
        slug: 'example',
        status: 'ACTIVE',
        ownerUserId: 'someone-else',
      },
    };

    const payload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      appClientId: 'web',
      aud: 'web',
      tokenUse: 'refresh',
      type: 'refresh',
      tokenVersion: 0,
      rememberMe: false,
    };

    const wiring = () =>
      service as unknown as {
        jwtService: { verifyAsync: jest.Mock };
        usersService: { findByIdWithAccess: jest.Mock };
      };

    beforeEach(() => {
      wiring().jwtService.verifyAsync.mockResolvedValue(payload);
      wiring().usersService.findByIdWithAccess.mockResolvedValue(tenantUser);
    });

    it('lets the losing side of a rotation race succeed instead of revoking the session', async () => {
      const staleToken = 'stale-refresh-token';
      const staleHash = await bcrypt.hash(staleToken, 4);
      const recentlyRevokedRow = {
        id: 'row-superseded',
        tokenHash: staleHash,
        revokedAt: new Date(), // just now — well within the grace window
      };

      prisma.refreshToken.findMany
        // hasActiveRefreshToken: nothing live matches the stale token.
        .mockResolvedValueOnce([])
        // wasRotatedWithinGraceWindow: the stale token matches a row the
        // winning request's rotation revoked moments ago.
        .mockResolvedValueOnce([recentlyRevokedRow])
        // rotateRefreshToken: still nothing live matches (it was the winner's
        // rotation that revoked it, not this request).
        .mockResolvedValueOnce([]);

      prisma.refreshToken.findFirst
        // wasRotatedWithinGraceWindow: the family has a live successor.
        .mockResolvedValueOnce({ id: 'live-successor' })
        // rotateRefreshToken: the successor's absolute expiry to inherit.
        .mockResolvedValueOnce({ absoluteExpiresAt: new Date('2027-01-01') });

      await expect(service.refresh(staleToken)).resolves.toMatchObject({
        tokens: expect.objectContaining({ accessToken: expect.any(String) }),
      });

      // The losing request must not itself trigger a revoke-all-other-sessions
      // sweep — it is continuing an existing session, not starting a new one.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      // And it must not have logged a reuse event — this was a race, not abuse.
      expect(auditService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        }),
      );
    });

    it('still refuses a token reused well after it was superseded, and records it', async () => {
      const staleToken = 'long-dead-refresh-token';
      const staleHash = await bcrypt.hash(staleToken, 4);
      const longAgo = new Date(Date.now() - 5 * 60_000); // 5 minutes ago
      const recentlyRevokedRow = {
        id: 'row-long-superseded',
        tokenHash: staleHash,
        revokedAt: longAgo,
      };

      prisma.refreshToken.findMany
        .mockResolvedValueOnce([]) // hasActiveRefreshToken: no live match
        .mockResolvedValueOnce([recentlyRevokedRow]); // outside the window

      await expect(service.refresh(staleToken)).rejects.toMatchObject({
        status: 401,
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
        }),
      );
      // A refused reuse must never be treated as a session to continue.
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('an ordinary successful rotation never revokes other sessions, even for a single-session tenant', async () => {
      prisma.tenantSetting.findMany.mockResolvedValue([
        { key: 'allowMultipleActiveSessions', value: false },
      ]);

      const liveToken = 'currently-live-refresh-token';
      const liveHash = await bcrypt.hash(liveToken, 4);
      const liveRow = {
        id: 'row-live',
        tokenHash: liveHash,
        absoluteExpiresAt: new Date('2027-01-01'),
        expiresAt: new Date(Date.now() + 3_600_000),
        lastActivityAt: new Date(),
      };

      prisma.refreshToken.findMany
        .mockResolvedValueOnce([liveRow]) // hasActiveRefreshToken: live match
        .mockResolvedValueOnce([liveRow]); // rotateRefreshToken: activeTokens

      await expect(service.refresh(liveToken)).resolves.toBeDefined();

      /*
       * BUG-3359 requirement 4 — a rotation must never run the
       * revoke-other-sessions sweep, regardless of the tenant's
       * `allowMultipleActiveSessions` setting. That sweep exists for a new
       * sign-in (`login()`), not for a session continuing itself; running it
       * here is exactly what let two racing rotations destroy each other's
       * successor before this fix.
       */
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'row-live' } }),
      );
    });
  });
});
