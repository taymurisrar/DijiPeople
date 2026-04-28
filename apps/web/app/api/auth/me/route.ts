import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth-config";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";
import { getApiBaseUrl } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return clearSessionResponse(401);
  }

  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      method: "GET",
      headers: {
        Cookie: [
          accessToken ? `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)}` : "",
          refreshToken ? `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}` : "",
        ]
          .filter(Boolean)
          .join("; "),
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return clearSessionResponse(response.status);
    }

    const nextResponse = NextResponse.json(data);
    const setCookie = response.headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0) {
      for (const cookieValue of setCookie) {
        nextResponse.headers.append("Set-Cookie", cookieValue);
      }
    } else {
      const tokens = readTokens(data);
      if (tokens) {
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
      }
    }

    return nextResponse;
  } catch {
    return NextResponse.json(
      { message: "Unable to validate your session." },
      { status: 502 },
    );
  }
}

function clearSessionResponse(status: number) {
  const response = NextResponse.json(
    { message: "Your session expired. Please sign in again to continue." },
    { status: status === 403 ? 403 : 401 },
  );
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", getClearAuthCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", getClearAuthCookieOptions());
  return response;
}

function readTokens(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const tokens = (data as { tokens?: unknown }).tokens;
  if (!tokens || typeof tokens !== "object") return null;
  const record = tokens as { accessToken?: unknown; refreshToken?: unknown };
  return typeof record.accessToken === "string" &&
    typeof record.refreshToken === "string"
    ? { accessToken: record.accessToken, refreshToken: record.refreshToken }
    : null;
}
