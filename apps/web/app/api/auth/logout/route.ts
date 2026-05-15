import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
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
  await clearAuthCookies();

  return NextResponse.json({
    ok: true,
    redirectUrl: buildLogoutLoginUrl(requestUrl, tenantSlug),
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tenantSlug = await resolveLogoutTenantSlug(request);
  await revokeApiSession();
  await clearAuthCookies();

  const nextPath = sanitizeLocalNextPath(requestUrl.searchParams.get("next"));
  const reason = requestUrl.searchParams.get("reason");
  const redirectUrl = new URL(
    buildLogoutLoginUrl(requestUrl, tenantSlug, reason ? nextPath : null),
  );

  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(redirectUrl);
}

async function resolveLogoutTenantSlug(request: Request) {
  const requestUrl = new URL(request.url);
  const sessionTenantSlug = await getSessionTenantSlug();

  if (sessionTenantSlug) {
    return sessionTenantSlug;
  }

  const hint = getTenantHintFromRequest({
    host: request.headers.get("host"),
    queryTenant: requestUrl.searchParams.get("tenant"),
  });

  if (hint.type === "slug" && hint.value) {
    return hint.value;
  }

  return process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG?.trim() || "";
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

  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    headers: {
      "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      Cookie: cookieHeader,
    },
    cache: "no-store",
  }).catch(() => null);
}

async function clearAuthCookies() {
  const cookieStore = await cookies();
  const cookieNames = [
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    SESSION_COOKIE,
  ] as const;
  const baseOptions = getClearAuthCookieOptions();

  for (const cookieName of cookieNames) {
    cookieStore.set(cookieName, "", baseOptions);
  }
}
