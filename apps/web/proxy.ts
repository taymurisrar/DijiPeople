import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
  isProtectedRoute,
} from "@/lib/auth-config";
import { sanitizeLocalNextPath, toCanonicalPath } from "@/lib/routes";
import { getTenantHintFromRequest } from "@/lib/tenant-resolution";
import { buildTenantLoginUrl } from "@/lib/tenant-url";

const ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;

type RefreshResponse = {
  tokens?: {
    accessToken?: unknown;
    refreshToken?: unknown;
  };
};

type RefreshSessionResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
    }
  | {
      ok: false;
      shouldLogout: boolean;
    };

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const hasSessionCookie = Boolean(accessToken) || Boolean(refreshToken);

  if (isProtectedRoute(pathname) && !hasSessionCookie) {
    const loginUrl = buildTenantAwareLoginUrl(request, {
      next: `${pathname}${search}`,
    });
    return NextResponse.redirect(loginUrl);
  }

  if (
    isProtectedRoute(pathname) &&
    shouldRefreshForRequest(request) &&
    refreshToken &&
    shouldRefreshAccessToken(accessToken)
  ) {
    const refreshResult = await refreshSessionTokens(refreshToken);

    if (!refreshResult.ok && refreshResult.shouldLogout) {
      return redirectToLogout(request);
    }

    if (refreshResult.ok) {
      return continueWithRefreshedTokens(request, refreshResult);
    }
  }

  if (pathname === LOGIN_ROUTE && hasSessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

function shouldRefreshForRequest(request: NextRequest) {
  return (
    request.method === "GET" &&
    request.headers.get("purpose") !== "prefetch" &&
    request.headers.get("next-router-prefetch") !== "1"
  );
}

function shouldRefreshAccessToken(accessToken: string | undefined) {
  if (!accessToken) {
    return true;
  }

  const expiresAtSeconds = readJwtExpiresAt(accessToken);

  if (!expiresAtSeconds) {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return expiresAtSeconds - nowSeconds <= ACCESS_TOKEN_REFRESH_BUFFER_SECONDS;
}

async function refreshSessionTokens(
  refreshToken: string,
): Promise<RefreshSessionResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        shouldLogout: response.status === 401 || response.status === 403,
      };
    }

    const data = (await response
      .json()
      .catch(() => null)) as RefreshResponse | null;
    const accessToken = data?.tokens?.accessToken;
    const nextRefreshToken = data?.tokens?.refreshToken;

    if (
      typeof accessToken !== "string" ||
      typeof nextRefreshToken !== "string"
    ) {
      return {
        ok: false,
        shouldLogout: false,
      };
    }

    return {
      ok: true,
      accessToken,
      refreshToken: nextRefreshToken,
    };
  } catch {
    return {
      ok: false,
      shouldLogout: false,
    };
  }
}

function continueWithRefreshedTokens(
  request: NextRequest,
  tokens: Extract<RefreshSessionResult, { ok: true }>,
) {
  const requestHeaders = new Headers(request.headers);
  const requestCookieHeader = buildRequestCookieHeader(
    request.headers.get("cookie"),
    tokens.accessToken,
    tokens.refreshToken,
  );

  requestHeaders.set("cookie", requestCookieHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: isProduction() ? "none" : "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 15 * 60,
    ...getCookieDomainOption(),
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: isProduction() ? "none" : "lax",
    secure: isProduction(),
    path: "/",
    maxAge: getRefreshMaxAgeSeconds(),
    ...getCookieDomainOption(),
  });

  const sessionId = readJwtSessionId(tokens.accessToken);
  if (sessionId) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: isProduction() ? "none" : "lax",
      secure: isProduction(),
      path: "/",
      maxAge: getRefreshMaxAgeSeconds(),
      ...getCookieDomainOption(),
    });
  }

  return response;
}

function redirectToLogout(request: NextRequest) {
  const logoutUrl = new URL("/api/auth/logout", request.url);
  logoutUrl.searchParams.set("reason", "session-expired");
  logoutUrl.searchParams.set(
    "next",
    `${toCanonicalPath(request.nextUrl.pathname)}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(logoutUrl);
}

function buildTenantAwareLoginUrl(
  request: NextRequest,
  options: { next?: string | null } = {},
) {
  const tenantHint = getTenantHintFromRequest({
    host: request.headers.get("host"),
    queryTenant: request.nextUrl.searchParams.get("tenant"),
  });
  const safeNext = sanitizeLocalNextPath(options.next);

  if (tenantHint.type === "slug" && tenantHint.value) {
    return new URL(buildTenantLoginUrl(tenantHint.value, { next: safeNext }));
  }

  const fallbackSlug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG?.trim();
  if (fallbackSlug) {
    return new URL(buildTenantLoginUrl(fallbackSlug, { next: safeNext }));
  }

  const loginUrl = new URL(LOGIN_ROUTE, request.url);
  loginUrl.searchParams.set("next", safeNext);
  return loginUrl;
}

function readJwtExpiresAt(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as {
      exp?: unknown;
      aud?: unknown;
      appClientId?: unknown;
      tokenUse?: unknown;
      type?: unknown;
    };

    if (
      decoded.aud !== AUTH_APP_CLIENT_ID ||
      decoded.appClientId !== AUTH_APP_CLIENT_ID ||
      (decoded.tokenUse !== "access" && decoded.type !== "access")
    ) {
      return null;
    }

    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function readJwtSessionId(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as {
      sessionId?: unknown;
      aud?: unknown;
      appClientId?: unknown;
    };

    if (
      decoded.aud !== AUTH_APP_CLIENT_ID ||
      decoded.appClientId !== AUTH_APP_CLIENT_ID
    ) {
      return null;
    }

    return typeof decoded.sessionId === "string" ? decoded.sessionId : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return atob(padded);
}

function buildRequestCookieHeader(
  originalCookieHeader: string | null,
  accessToken: string,
  refreshToken: string,
) {
  const cookies = new Map<string, string>();

  for (const cookiePair of originalCookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValueParts] = cookiePair.trim().split("=");
    const name = rawName?.trim();

    if (!name) {
      continue;
    }

    cookies.set(name, rawValueParts.join("="));
  }

  cookies.set(ACCESS_TOKEN_COOKIE, accessToken);
  cookies.set(REFRESH_TOKEN_COOKIE, refreshToken);

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function getApiBaseUrl() {
  const value =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_BASE_URL ??
    process.env.API_URL ??
    "http://localhost:4000/api";

  return value.replace(/\/+$/, "");
}

function getCookieDomainOption() {
  const domain = isProduction() ? process.env.AUTH_COOKIE_DOMAIN : undefined;

  return domain ? { domain } : {};
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getRefreshMaxAgeSeconds() {
  return Math.floor(
    parseDurationToMilliseconds(
      process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ??
        process.env.JWT_REFRESH_TOKEN_TTL ??
        "1h",
    ) / 1000,
  );
}

function parseDurationToMilliseconds(value: string) {
  const match = value.trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return 3_600_000;
  const amount = Number.parseInt(match[1] ?? "1", 10);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
}
