import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import {
  AUTH_CLIENT_IDS,
  buildAuthCookieOptions,
  getAccessTokenTtl,
  getAgentAccessTokenTtl,
  getAgentRefreshTokenTtl,
  getAuthCookieNames,
  getClientAccessTokenTtl,
  getClientRefreshTokenTtl,
  getRefreshTokenTtl,
  normalizeTokenTtl,
  parseDurationToMilliseconds,
} from './auth.config';

function config(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('auth config', () => {
  it('builds production-safe admin cookie options for Vercel', () => {
    const options = buildAuthCookieOptions(
      config({
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        AUTH_COOKIE_HTTP_ONLY: 'true',
        AUTH_COOKIE_SAME_SITE: 'lax',
        AUTH_COOKIE_PATH: '/',
        ADMIN_COOKIE_DOMAIN: '',
      }),
      1800_000,
      AUTH_CLIENT_IDS.ADMIN,
    );

    expect(options).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1800_000,
    });
    expect(options.domain).toBeUndefined();
  });

  it('rejects invalid Vercel cookie domains in production', () => {
    expect(() =>
      buildAuthCookieOptions(
        config({
          NODE_ENV: 'production',
          AUTH_COOKIE_SECURE: 'true',
          AUTH_COOKIE_SAME_SITE: 'lax',
          ADMIN_COOKIE_DOMAIN: '.vercel.app',
        }),
        1800_000,
        AUTH_CLIENT_IDS.ADMIN,
      ),
    ).toThrow(/domain must be unset/i);
  });

  it('supports requested JWT ttl second aliases', () => {
    const cfg = config({
      JWT_ACCESS_TOKEN_TTL_SECONDS: '1800',
      JWT_REFRESH_TOKEN_TTL_SECONDS: '2592000',
    });

    // BUG-3548 — a bare integer is seconds, and is now spelled so.
    expect(getAccessTokenTtl(cfg)).toBe('1800s');
    expect(getRefreshTokenTtl(cfg)).toBe('2592000s');
  });

  /*
   * BUG-3548. `jsonwebtoken` reads a bare digit string as milliseconds, so
   * `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800` signed tokens with
   * `exp = iat + 1`. These pin the lifetime of a token actually signed with the
   * configured value, not just the string the getter returns, and that the
   * cookie sized from the same value agrees with it.
   */
  describe('BUG-3548 — numeric TTLs are seconds everywhere they are consumed', () => {
    const jwt = new JwtService({ secret: 'test-secret' });

    function signedLifetimeSeconds(expiresIn: string) {
      const token = jwt.sign(
        { sub: 'user-1' },
        { expiresIn: expiresIn as StringValue },
      );
      const decoded = jwt.decode<{ iat: number; exp: number }>(token);
      return decoded.exp - decoded.iat;
    }

    it.each([
      ['admin', 'AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS'],
      ['web', 'AUTH_WEB_ACCESS_TOKEN_TTL_SECONDS'],
    ] as const)(
      'signs a %s access token for 1800 seconds when %s=1800',
      (clientId, key) => {
        const ttl = getClientAccessTokenTtl(
          config({ [key]: '1800' }),
          clientId,
        );

        expect(ttl).toBe('1800s');
        expect(signedLifetimeSeconds(ttl)).toBe(1800);
        expect(parseDurationToMilliseconds(ttl)).toBe(1_800_000);
      },
    );

    it('signs a refresh token for the configured number of seconds', () => {
      const ttl = getClientRefreshTokenTtl(
        config({ AUTH_ADMIN_REFRESH_TOKEN_TTL_SECONDS: '28800' }),
        AUTH_CLIENT_IDS.ADMIN,
      );

      expect(ttl).toBe('28800s');
      expect(signedLifetimeSeconds(ttl)).toBe(28_800);
      expect(parseDurationToMilliseconds(ttl)).toBe(28_800_000);
    });

    it('keeps duration strings such as 15m working unchanged', () => {
      const access = getClientAccessTokenTtl(
        config({ AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS: '15m' }),
        AUTH_CLIENT_IDS.ADMIN,
      );
      const refresh = getRefreshTokenTtl(config({ JWT_REFRESH_TTL: '7d' }));

      expect(access).toBe('15m');
      expect(signedLifetimeSeconds(access)).toBe(900);
      expect(refresh).toBe('7d');
      expect(signedLifetimeSeconds(refresh)).toBe(7 * 86_400);
    });

    it('sizes the cookie from the same value the token was signed with', () => {
      const ttl = getClientAccessTokenTtl(
        config({ AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS: '1800' }),
        AUTH_CLIENT_IDS.ADMIN,
      );
      const cookie = buildAuthCookieOptions(
        config({}),
        parseDurationToMilliseconds(ttl),
        AUTH_CLIENT_IDS.ADMIN,
      );

      expect(cookie.maxAge).toBe(signedLifetimeSeconds(ttl) * 1000);
    });

    it('applies to the agent-desktop TTLs too', () => {
      const cfg = config({
        AUTH_AGENT_ACCESS_TOKEN_TTL_SECONDS: '900',
        AUTH_AGENT_REFRESH_TOKEN_TTL_SECONDS: '86400',
      });

      expect(getAgentAccessTokenTtl(cfg)).toBe('900s');
      expect(getAgentRefreshTokenTtl(cfg)).toBe('86400s');
    });

    it('treats a blank value as unset rather than as a zero lifetime', () => {
      expect(
        getClientAccessTokenTtl(
          config({ AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS: '  ' }),
          AUTH_CLIENT_IDS.ADMIN,
        ),
      ).toBe('15m');
    });

    it('normalizes a numeric value the config layer has already coerced', () => {
      expect(normalizeTokenTtl(1800)).toBe('1800s');
      expect(normalizeTokenTtl('30m')).toBe('30m');
      expect(normalizeTokenTtl(undefined)).toBeNull();
    });
  });

  it('uses admin-specific cookie names including session cookie', () => {
    const names = getAuthCookieNames(
      config({
        ADMIN_ACCESS_TOKEN_COOKIE: 'admin_access_token',
        ADMIN_REFRESH_TOKEN_COOKIE: 'admin_refresh_token',
        ADMIN_SESSION_COOKIE: 'dp_admin_session_id',
      }),
      AUTH_CLIENT_IDS.ADMIN,
    );

    expect(names).toEqual({
      access: 'admin_access_token',
      refresh: 'admin_refresh_token',
      session: 'dp_admin_session_id',
    });
  });
});
