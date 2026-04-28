import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";
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
          message: "Login response missing tokens.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const nextResponse = NextResponse.json({
      ok: true,
      user: data.user,
      tenant: data.tenant,
    });

    nextResponse.cookies.set(
      ACCESS_TOKEN_COOKIE,
      data.tokens.accessToken,
      getAuthCookieOptions(ACCESS_TOKEN_MAX_AGE_SECONDS),
    );

    nextResponse.cookies.set(
      REFRESH_TOKEN_COOKIE,
      data.tokens.refreshToken,
      getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
    );

    return nextResponse;
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Unable to reach API at ${apiBaseUrl}: ${error.message}`
            : `Unable to reach API at ${apiBaseUrl}.`,
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
  if (!data) return null;

  if (typeof data.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data.message) &&
    data.message.every((item) => typeof item === "string")
  ) {
    return data.message.join(", ");
  }

  return null;
}

function isLoginSuccessResponse(
  data: JsonRecord | null,
): data is LoginSuccessResponse {
  if (!data) return false;

  const tokens = data.tokens as JsonRecord | undefined;

  return (
    typeof tokens === "object" &&
    tokens !== null &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string"
  );
}
