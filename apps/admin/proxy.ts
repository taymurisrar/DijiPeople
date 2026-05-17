import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
  DEFAULT_ADMIN_ROUTE,
  LOGIN_ROUTE,
  getApiBaseUrl,
  isAdminAuthRoute,
  isProtectedAdminRoute,
  sanitizeAdminNextPath,
} from "@/lib/auth-config";

type JwtValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "missing"
        | "expired"
        | "not-yet-valid"
        | "malformed"
        | "invalid-payload"
        | "missing-exp"
        | "unknown";
    };

const CLOCK_SKEW_SECONDS = 5;
const ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;
type JwtInvalidReason = Exclude<JwtValidationResult, { valid: true }>["reason"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  try {
    const { search } = request.nextUrl;

    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    const validation = validateJwt(accessToken);
    const isAuthenticated = validation.valid;
    const isProtectedRoute = isProtectedAdminRoute(pathname);
    const isAuthRoute = isAdminAuthRoute(pathname);

    if (
      isProtectedRoute &&
      refreshToken &&
      shouldRefreshForRequest(request) &&
      shouldRefreshAccessToken(accessToken)
    ) {
      const refreshed = await refreshSessionTokens(refreshToken);

      if (refreshed.ok) {
        return continueWithRefreshedTokens(request, refreshed);
      }

      if (refreshed.shouldLogout) {
        const loginUrl = new URL(LOGIN_ROUTE, request.url);
        loginUrl.searchParams.set(
          "next",
          sanitizeAdminNextPath(`${pathname}${search}`),
        );
        loginUrl.searchParams.set("reason", "session-expired");
        const response = NextResponse.redirect(loginUrl);
        clearAuthCookies(response);
        return response;
      }
    }

    if (isProtectedRoute && !isAuthenticated) {
      const loginUrl = new URL(LOGIN_ROUTE, request.url);
      const nextPath = sanitizeAdminNextPath(`${pathname}${search}`);

      loginUrl.searchParams.set("next", nextPath);

      if (validation.reason === "expired") {
        loginUrl.searchParams.set("reason", "session-expired");
      }

      const response = NextResponse.redirect(loginUrl);
      if (validation.reason !== "missing") {
        clearAuthCookies(response);
      }
      logAuthRedirect({
        pathname,
        isProtectedRoute,
        isAuthRoute,
        reason: validation.reason,
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        redirectTarget: `${loginUrl.pathname}${loginUrl.search}`,
      });

      return response;
    }

    if (isAuthRoute && isAuthenticated) {
      const redirectUrl = new URL(DEFAULT_ADMIN_ROUTE, request.url);
      logAuthRedirect({
        pathname,
        isProtectedRoute,
        isAuthRoute,
        reason: "authenticated-login",
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        redirectTarget: redirectUrl.pathname,
      });
      return NextResponse.redirect(redirectUrl);
    }

    if (isAuthRoute && !isAuthenticated) {
      const response = NextResponse.next();

      if (validation.reason === "expired") {
        clearAuthCookies(response);
      }

      return response;
    }

    return NextResponse.next();
  } catch {
    if (isAdminAuthRoute(pathname)) {
      const response = NextResponse.next();
      clearAuthCookies(response);
      logAuthRedirect({
        pathname,
        isProtectedRoute: false,
        isAuthRoute: true,
        reason: "exception",
        hasAccessToken: Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value),
        hasRefreshToken: Boolean(
          request.cookies.get(REFRESH_TOKEN_COOKIE)?.value,
        ),
        redirectTarget: "render-login",
      });
      return response;
    }

    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("reason", "session-expired");

    const response = NextResponse.redirect(loginUrl);
    clearAuthCookies(response);

    return response;
  }
}

function validateJwt(token: string | undefined): JwtValidationResult {
  try {
    if (!token || token.trim().length === 0) {
      return { valid: false, reason: "missing" };
    }

    const payload = decodeJwtPayload(token);

    if (!payload) {
      return { valid: false, reason: "malformed" };
    }

    const exp = readNumericClaim(payload.exp);
    const nbf = readNumericClaim(payload.nbf);

    if (typeof exp !== "number") {
      return { valid: false, reason: "missing-exp" };
    }

    if (
      payload.aud !== "admin" ||
      payload.appClientId !== "admin" ||
      (payload.tokenUse !== "access" && payload.type !== "access")
    ) {
      return { valid: false, reason: "invalid-payload" };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    if (exp <= nowSeconds + CLOCK_SKEW_SECONDS) {
      return { valid: false, reason: "expired" };
    }

    if (typeof nbf === "number" && nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
      return { valid: false, reason: "not-yet-valid" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "unknown" };
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");

  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const normalizedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    );

    const decodedPayload = atob(paddedPayload);
    const parsed: unknown = JSON.parse(decodedPayload);

    if (!isJsonRecord(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function readNumericClaim(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
}

function shouldRefreshForRequest(request: NextRequest) {
  return (
    request.method === "GET" &&
    request.headers.get("purpose") !== "prefetch" &&
    request.headers.get("next-router-prefetch") !== "1"
  );
}

function shouldRefreshAccessToken(accessToken: string | undefined) {
  if (!accessToken) return true;
  const payload = decodeJwtPayload(accessToken);
  const exp = payload ? readNumericClaim(payload.exp) : undefined;
  if (!exp) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp - nowSeconds <= ACCESS_TOKEN_REFRESH_BUFFER_SECONDS;
}

type RefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; sessionId?: string }
  | { ok: false; shouldLogout: boolean };

async function refreshSessionTokens(refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DijiPeople-App": "admin",
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, shouldLogout: response.status === 401 || response.status === 403 };
    }

    const data = (await response.json().catch(() => null)) as
      | { tokens?: { accessToken?: unknown; refreshToken?: unknown; sessionId?: unknown } }
      | null;
    if (
      typeof data?.tokens?.accessToken !== "string" ||
      typeof data?.tokens?.refreshToken !== "string"
    ) {
      return { ok: false, shouldLogout: false };
    }

    return {
      ok: true,
      accessToken: data.tokens.accessToken,
      refreshToken: data.tokens.refreshToken,
      sessionId: typeof data.tokens.sessionId === "string" ? data.tokens.sessionId : undefined,
    };
  } catch {
    return { ok: false, shouldLogout: false };
  }
}

function continueWithRefreshedTokens(
  request: NextRequest,
  tokens: Extract<RefreshResult, { ok: true }>,
) {
  const requestHeaders = new Headers(request.headers);
  const cookies = new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...rest] = item.split("=");
        return [key, rest.join("=")] as const;
      }),
  );
  cookies.set(ACCESS_TOKEN_COOKIE, encodeURIComponent(tokens.accessToken));
  cookies.set(REFRESH_TOKEN_COOKIE, encodeURIComponent(tokens.refreshToken));
  if (tokens.sessionId) cookies.set(SESSION_COOKIE, encodeURIComponent(tokens.sessionId));
  requestHeaders.set(
    "cookie",
    Array.from(cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; "),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  if (tokens.sessionId) {
    response.cookies.set(SESSION_COOKIE, tokens.sessionId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  return response;
}

type AuthRedirectLog = {
  pathname: string;
  isProtectedRoute: boolean;
  isAuthRoute: boolean;
  reason: JwtInvalidReason | "authenticated-login" | "exception";
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  redirectTarget: string;
};

function logAuthRedirect(details: AuthRedirectLog) {
  console.info("[admin-auth-proxy]", details);
}

export const config = {
  matcher: [
    "/",
    "/tenants/:path*",
    "/customers/:path*",
    "/settings/:path*",
    "/subscriptions/:path*",
    "/invoices/:path*",
    "/billing/:path*",
    "/plans/:path*",
    "/onboarding/:path*",
    "/leads/:path*",
    "/payments/:path*",
    "/login",
  ],
};
