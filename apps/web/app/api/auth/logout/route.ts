import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
  TENANT_SLUG_COOKIE,
} from "@/lib/auth-config";
import { getClearAuthCookieOptions } from "@/lib/auth-cookies";
import { getApiBaseUrl } from "@/lib/auth";
import { sanitizeLocalNextPath } from "@/lib/routes";
import { getTenantHintFromRequest } from "@/lib/tenant-resolution";
import { buildTenantLoginUrl } from "@/lib/tenant-url";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const tenantSlug = await resolveLogoutTenantSlug(request);
  await revokeApiSession();

  const response = NextResponse.json({
    ok: true,
    redirectUrl: buildLogoutLoginUrl(requestUrl, tenantSlug),
  });
  clearAuthCookies(response);
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = sanitizeLocalNextPath(requestUrl.searchParams.get("next"));
  const reason = requestUrl.searchParams.get("reason");
  const tenantSlug = await resolveLogoutTenantSlug(request, {
    skipSessionLookup: reason === "session-expired",
  });
  await revokeApiSession();

  const redirectUrl = new URL(
    buildLogoutLoginUrl(requestUrl, tenantSlug, reason ? nextPath : null),
  );

  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }

  const response = NextResponse.redirect(redirectUrl);
  clearAuthCookies(response);
  return response;
}

async function resolveLogoutTenantSlug(
  request: Request,
  options: { skipSessionLookup?: boolean } = {},
) {
  const requestUrl = new URL(request.url);
  const sessionTenantSlug = options.skipSessionLookup
    ? ""
    : await getSessionTenantSlug().catch(() => "");

  if (sessionTenantSlug) {
    return sessionTenantSlug;
  }

  const hint = getTenantHintFromRequest({
    host: request.headers.get("host"),
    queryTenant: requestUrl.searchParams.get("tenant"),
    cookieTenant: requestUrl.searchParams.get("tenant")
      ? null
      : (await cookies()).get(TENANT_SLUG_COOKIE)?.value,
  });

  return hint.type === "slug" && hint.value ? hint.value : "";
}

function buildLogoutLoginUrl(
  requestUrl: URL,
  tenantSlug: string,
  nextPath?: string | null,
) {
  if (tenantSlug) {
    return buildTenantLoginUrl(tenantSlug, nextPath ? { next: nextPath } : {});
  }

  const url = new URL(LOGIN_ROUTE, requestUrl.origin);
  if (nextPath) {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

async function getSessionTenantSlug() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return "";
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    method: "GET",
    headers: {
      "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      Cookie: [
        accessToken
          ? `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)}`
          : "",
        refreshToken
          ? `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return "";
  }

  const data = (await response.json().catch(() => null)) as
    | { tenant?: { slug?: unknown } }
    | null;
  return typeof data?.tenant?.slug === "string" ? data.tenant.slug : "";
}

async function revokeApiSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const cookieHeader = [
    accessToken
      ? `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)}`
      : "",
    refreshToken
      ? `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}`
      : "",
    sessionId ? `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  if (!cookieHeader) {
    return;
  }

  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: {
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });
  } catch {
    // Logout must still clear local cookies even if the API is unreachable.
  }
}

function clearAuthCookies(response: NextResponse) {
  const cookieNames = [
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    SESSION_COOKIE,
  ] as const;
  const fallbackOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 0,
  };
  const baseOptions = getSafeClearAuthCookieOptions();

  for (const cookieName of cookieNames) {
    try {
      response.cookies.set(cookieName, "", baseOptions);
    } catch {
      response.cookies.set(cookieName, "", fallbackOptions);
    }
  }
}

function getSafeClearAuthCookieOptions() {
  try {
    return getClearAuthCookieOptions();
  } catch {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
      maxAge: 0,
    };
  }
}
