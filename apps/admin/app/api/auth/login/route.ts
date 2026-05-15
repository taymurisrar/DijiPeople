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
  getAuthCookieDiagnostics,
  getAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";

type JsonRecord = Record<string, unknown>;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
};

type LoginSuccessResponse = JsonRecord & {
  user: unknown;
  tenant: unknown;
  tokens: TokenPair;
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body. Expected valid JSON." },
      { status: 400 },
    );
  }

  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/admin/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const rawBody = await response.text();
    const data = rawBody ? safeParseJson(rawBody) : null;

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

    if (!isLoginSuccessResponse(data)) {
      return NextResponse.json(
        {
          message: "API login response did not include usable token payload.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const nextResponse = NextResponse.json({
      ok: true,
      user: data.user,
      tenant: data.tenant,
      cookies: {
        accessToken: true,
        refreshToken: true,
        session: Boolean(data.tokens.sessionId),
      },
    });

    let accessCookieOptions: ReturnType<typeof getAuthCookieOptions>;
    let refreshCookieOptions: ReturnType<typeof getAuthCookieOptions>;

    try {
      accessCookieOptions = getAuthCookieOptions(
        ACCESS_TOKEN_MAX_AGE_SECONDS,
      );
      refreshCookieOptions = getAuthCookieOptions(
        REFRESH_TOKEN_MAX_AGE_SECONDS,
      );
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? `Admin auth cookie configuration error: ${error.message}`
              : "Admin auth cookie configuration error.",
        },
        { status: 500 },
      );
    }

    nextResponse.cookies.set(ACCESS_TOKEN_COOKIE, data.tokens.accessToken, accessCookieOptions);

    nextResponse.cookies.set(
      REFRESH_TOKEN_COOKIE,
      data.tokens.refreshToken,
      refreshCookieOptions,
    );
    if (data.tokens.sessionId) {
      nextResponse.cookies.set(
        SESSION_COOKIE,
        data.tokens.sessionId,
        refreshCookieOptions,
      );
    }

    console.info("[admin-auth-login-cookies]", {
      cookies: {
        access: ACCESS_TOKEN_COOKIE,
        refresh: REFRESH_TOKEN_COOKIE,
        session: SESSION_COOKIE,
      },
      access: getAuthCookieDiagnostics(ACCESS_TOKEN_MAX_AGE_SECONDS),
      refresh: getAuthCookieDiagnostics(REFRESH_TOKEN_MAX_AGE_SECONDS),
    });

    return nextResponse;
  } catch (error) {
    const message =
      error instanceof Error
        ? `Unable to reach API at ${apiBaseUrl}: ${error.message}`
        : `Unable to reach API at ${apiBaseUrl}.`;

    return NextResponse.json({ message }, { status: 502 });
  }
}

function safeParseJson(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  if (isJsonRecord(data.error) && typeof data.error.message === "string") {
    return data.error.message;
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
    isJsonRecord(tokens) &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string" &&
    tokens.accessToken.trim().length > 20 &&
    tokens.refreshToken.trim().length > 20
  );
}
