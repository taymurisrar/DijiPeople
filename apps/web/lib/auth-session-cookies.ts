import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  parseDurationToMilliseconds,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * BUG-3357 — the single source of auth cookie lifetime.
 *
 * Three places write the access/refresh/session cookies: the sign-in route
 * (`app/api/auth/login/route.ts`), the server-side refresh path
 * (`lib/server-api.ts`'s `persistRefreshedAuthCookies`), and the middleware's
 * refresh path (`proxy.ts`'s `continueWithRefreshedTokens`). Two of the three
 * read the lifetimes the API actually returned for the session (`rememberMe`,
 * `accessTokenExpiresIn`, `refreshTokenExpiresIn`); the third — the
 * middleware, which refreshes on more navigations than either of the other
 * two — used a hardcoded `15 * 60` for the access cookie and an
 * independently-resolved env var for the refresh cookie, neither of which had
 * anything to do with the session actually in hand. A thirty-day remembered
 * session became a fifteen-minute one the first time the middleware
 * refreshed it.
 *
 * This is the one function all three now call. There is no literal maxAge
 * anywhere else that writes one of these three cookies — `*.spec.ts` beside
 * this file fails if one reappears.
 */
export type RefreshedSessionTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  rememberMe?: boolean;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
};

export type AuthSessionCookieValues = {
  access: { name: string; value: string; options: Partial<ResponseCookie> };
  refresh: { name: string; value: string; options: Partial<ResponseCookie> };
  session?: { name: string; value: string; options: Partial<ResponseCookie> };
};

/**
 * Build the `{ name, value, options }` triples for all three auth cookies from
 * a token response, applying Remember me exactly the way the sign-in route
 * always has: a remembered session gets an explicit `maxAge` computed from the
 * lifetimes the API returned (falling back to this app's own configured
 * defaults if the API omitted them); an ordinary session gets no `maxAge` at
 * all, which is what makes it a browser-session cookie.
 */
export function buildAuthSessionCookies(
  tokens: RefreshedSessionTokens,
): AuthSessionCookieValues {
  const persistSession = tokens.rememberMe === true;
  const accessMaxAge = persistSession
    ? durationSeconds(tokens.accessTokenExpiresIn, ACCESS_TOKEN_MAX_AGE_SECONDS)
    : undefined;
  const refreshMaxAge = persistSession
    ? durationSeconds(
        tokens.refreshTokenExpiresIn,
        REFRESH_TOKEN_MAX_AGE_SECONDS,
      )
    : undefined;

  const result: AuthSessionCookieValues = {
    access: {
      name: ACCESS_TOKEN_COOKIE,
      value: tokens.accessToken,
      options: getAuthCookieOptions(accessMaxAge),
    },
    refresh: {
      name: REFRESH_TOKEN_COOKIE,
      value: tokens.refreshToken,
      options: getAuthCookieOptions(refreshMaxAge),
    },
  };

  if (tokens.sessionId) {
    result.session = {
      name: SESSION_COOKIE,
      value: tokens.sessionId,
      options: getAuthCookieOptions(refreshMaxAge),
    };
  }

  return result;
}

function durationSeconds(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  try {
    return Math.floor(parseDurationToMilliseconds(value) / 1000);
  } catch {
    return fallback;
  }
}
