import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
  REMEMBER_ME_COOKIE,
  SESSION_COOKIE,
  getApiBaseUrl,
  sanitizeAdminNextPath,
} from "@/lib/auth-config";
import { getClearAuthCookieOptions } from "@/lib/auth-cookies";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

export async function POST(request: Request) {
  await revokeApiSession(request);

  const response = NextResponse.json({ ok: true }, { status: 200 });
  clearAuthCookies(response);
  return response;
}

/**
 * The session-expired error modal and any other plain-link sign-out affordance
 * navigate the browser here, which is a GET. Without this handler Next answers
 * 405 and the operator is stranded on an error page with no way back to /login
 * — the exact production failure this handler exists to prevent. Keep GET and
 * POST in step; do not delete this one because "logout should be a POST".
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const reason = requestUrl.searchParams.get("reason");
  const rawNextPath = requestUrl.searchParams.get("next");

  await revokeApiSession(request);

  const redirectUrl = new URL(LOGIN_ROUTE, requestUrl.origin);
  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }
  if (rawNextPath) {
    redirectUrl.searchParams.set("next", sanitizeAdminNextPath(rawNextPath));
  }

  const response = NextResponse.redirect(redirectUrl);
  clearAuthCookies(response);
  return response;
}

/**
 * Ask the API to revoke the platform refresh token. The API resolves the client
 * from `X-DijiPeople-App` and reads the refresh token from the forwarded Cookie
 * header, so both must be present or the session stays live server-side.
 */
async function revokeApiSession(request: Request) {
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
        ...forwardedClientHeaders(request),
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ refreshToken }),
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
    REMEMBER_ME_COOKIE,
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

/**
 * `getClearAuthCookieOptions` throws when the deployed cookie configuration is
 * rejected — for example an `ADMIN_COOKIE_DOMAIN` left pointing at the
 * `.vercel.app` host. Letting that escape would turn sign-out into a 500 and
 * trap the operator in the session-expired loop, so fall back to options that
 * still expire the cookie.
 */
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
