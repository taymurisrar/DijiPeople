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

export async function POST() {
  await revokeApiSession();
  await clearAuthCookies();

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  await revokeApiSession();
  await clearAuthCookies();

  const requestUrl = new URL(request.url);
  const nextPath = requestUrl.searchParams.get("next") || "/dashboard";
  const reason = requestUrl.searchParams.get("reason");

  const redirectUrl = new URL(LOGIN_ROUTE, requestUrl.origin);
  redirectUrl.searchParams.set("next", nextPath);

  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(redirectUrl);
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
