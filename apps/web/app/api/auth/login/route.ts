import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";

type JsonRecord = Record<string, unknown>;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

type LoginSuccessResponse = JsonRecord & {
  user: unknown;
  tenant: unknown;
  tokens: TokenPair;
};

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const rawBody = await response.text();
    const data: JsonRecord | null = rawBody ? safeParseJson(rawBody) : null;

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            extractErrorMessage(data) ??
            `Login failed with status ${response.status}.`,
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

    const loginData: LoginSuccessResponse | null = isLoginSuccessResponse(data)
      ? data
      : null;

    const upstreamTokenPair = extractAuthTokensFromSetCookie(response);
    const jsonTokenPair: TokenPair | null = loginData
      ? {
          accessToken: loginData.tokens.accessToken,
          refreshToken: loginData.tokens.refreshToken,
        }
      : null;

    const tokenPair: TokenPair | null = upstreamTokenPair ?? jsonTokenPair;

    if (!tokenPair) {
      return NextResponse.json(
        {
          message:
            "API login response did not include usable auth cookies or token payload.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const cookieStore = await cookies();

    cookieStore.set(ACCESS_TOKEN_COOKIE, tokenPair.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15,
    });

    cookieStore.set(REFRESH_TOKEN_COOKIE, tokenPair.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({
      ok: true,
      user: loginData?.user ?? null,
      tenant: loginData?.tenant ?? null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? `Unable to reach API at ${apiBaseUrl}: ${error.message}`
        : `Unable to reach API at ${apiBaseUrl}.`;

    return NextResponse.json(
      {
        message,
      },
      { status: 502 },
    );
  }
}

function safeParseJson(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : null;
  } catch {
    return null;
  }
}

function extractErrorMessage(data: JsonRecord | null): string | null {
  if (!data) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data.message) &&
    data.message.every((item) => typeof item === "string")
  ) {
    return data.message.join(", ");
  }

  const nestedError = data.error;
  if (typeof nestedError === "object" && nestedError !== null) {
    const message = (nestedError as JsonRecord).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return null;
}

function isLoginSuccessResponse(
  data: JsonRecord | null,
): data is LoginSuccessResponse {
  if (!data) {
    return false;
  }

  const tokens = data.tokens;

  return (
    typeof tokens === "object" &&
    tokens !== null &&
    typeof (tokens as JsonRecord).accessToken === "string" &&
    typeof (tokens as JsonRecord).refreshToken === "string"
  );
}

function extractAuthTokensFromSetCookie(response: Response): TokenPair | null {
  const setCookieHeaders = readSetCookieHeaders(response.headers);
  if (setCookieHeaders.length === 0) {
    return null;
  }

  const accessToken = extractCookieValue(setCookieHeaders, ACCESS_TOKEN_COOKIE);
  const refreshToken = extractCookieValue(
    setCookieHeaders,
    REFRESH_TOKEN_COOKIE,
  );

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function readSetCookieHeaders(headers: Headers): string[] {
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

function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractCookieValue(
  setCookieHeaders: string[],
  cookieName: string,
): string | null {
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