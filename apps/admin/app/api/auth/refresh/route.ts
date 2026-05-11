import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
  getApiBaseUrl,
} from "@/lib/auth-config";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";

type JsonRecord = Record<string, unknown>;

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return clearSessionResponse();
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      { message: "Unable to refresh your session." },
      { status: 502 },
    );
  }

  const data = (await response.json().catch(() => null)) as JsonRecord | null;
  if (!response.ok || !data) {
    return clearSessionResponse();
  }

  const tokens = data.tokens as JsonRecord | undefined;
  if (
    !tokens ||
    typeof tokens.accessToken !== "string" ||
    typeof tokens.refreshToken !== "string"
  ) {
    return NextResponse.json(
      { message: "Refresh response missing tokens." },
      { status: 502 },
    );
  }

  const nextResponse = NextResponse.json({ ok: true });
  nextResponse.cookies.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    getAuthCookieOptions(ACCESS_TOKEN_MAX_AGE_SECONDS),
  );
  nextResponse.cookies.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
  );
  if (typeof tokens.sessionId === "string") {
    nextResponse.cookies.set(
      SESSION_COOKIE,
      tokens.sessionId,
      getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
    );
  }

  return nextResponse;
}

function clearSessionResponse() {
  const response = NextResponse.json(
    {
      message: "Your session expired. Please sign in again to continue.",
      code: "SESSION_EXPIRED",
    },
    { status: 401 },
  );

  response.cookies.set(ACCESS_TOKEN_COOKIE, "", getClearAuthCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", getClearAuthCookieOptions());
  response.cookies.set(SESSION_COOKIE, "", getClearAuthCookieOptions());
  return response;
}
