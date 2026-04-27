import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";

type JsonRecord = Record<string, unknown>;
type RefreshSuccessResponse = JsonRecord & {
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { message: "Refresh token not found." },
      { status: 401 },
    );
  }

  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    const rawBody = await response.text();
    const data = rawBody ? safeParseJson(rawBody) : null;

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            extractErrorMessage(data) ??
            "Unable to refresh your session. Please login again.",
        },
        { status: response.status || 401 },
      );
    }

    const upstreamTokenPair = extractAuthTokensFromSetCookie(response);
    const jsonTokenPair = isRefreshSuccessResponse(data)
      ? {
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        }
      : null;
    const tokenPair = upstreamTokenPair ?? jsonTokenPair;

    if (!tokenPair) {
      return NextResponse.json(
        {
          message:
            "Refresh response did not include usable auth cookies or token payload.",
        },
        { status: 502 },
      );
    }

    const useSecureCookies = process.env.NODE_ENV === "production";
    cookieStore.set(ACCESS_TOKEN_COOKIE, tokenPair.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      path: "/",
      maxAge: 60 * 15,
    });
    cookieStore.set(REFRESH_TOKEN_COOKIE, tokenPair.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to refresh your session.",
      },
      { status: 502 },
    );
  }
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as JsonRecord;
  } catch {
    return null;
  }
}

function extractErrorMessage(data: JsonRecord | null) {
  if (!data) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (Array.isArray(data.message) && data.message.every((item) => typeof item === "string")) {
    return data.message.join(", ");
  }

  return null;
}

function isRefreshSuccessResponse(data: JsonRecord | null): data is RefreshSuccessResponse {
  if (!data || typeof data !== "object" || !("tokens" in data)) {
    return false;
  }

  const tokens = data.tokens;
  return (
    typeof tokens === "object" &&
    tokens !== null &&
    "accessToken" in tokens &&
    "refreshToken" in tokens &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string"
  );
}

function extractAuthTokensFromSetCookie(response: Response) {
  const setCookieHeaders = readSetCookieHeaders(response.headers);
  if (setCookieHeaders.length === 0) {
    return null;
  }

  const accessToken = extractCookieValue(setCookieHeaders, ACCESS_TOKEN_COOKIE);
  const refreshToken = extractCookieValue(setCookieHeaders, REFRESH_TOKEN_COOKIE);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function readSetCookieHeaders(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  if (!combined) {
    return [];
  }

  return splitSetCookieHeader(combined);
}

function splitSetCookieHeader(value: string) {
  return value
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractCookieValue(setCookieHeaders: string[], cookieName: string) {
  const prefix = `${cookieName}=`;

  for (const header of setCookieHeaders) {
    if (!header.startsWith(prefix)) {
      continue;
    }

    const firstSegment = header.split(";")[0];
    const rawValue = firstSegment.slice(prefix.length);
    return rawValue || null;
  }

  return null;
}
