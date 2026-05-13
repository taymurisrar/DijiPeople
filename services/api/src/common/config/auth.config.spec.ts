import { ConfigService } from '@nestjs/config';
import {
  AUTH_CLIENT_IDS,
  buildAuthCookieOptions,
  getAccessTokenTtl,
  getAuthCookieNames,
  getRefreshTokenTtl,
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

    expect(getAccessTokenTtl(cfg)).toBe('1800');
    expect(getRefreshTokenTtl(cfg)).toBe('2592000');
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
