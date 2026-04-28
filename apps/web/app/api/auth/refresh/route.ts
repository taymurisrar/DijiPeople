import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";
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

    if (!isRefreshSuccessResponse(data)) {
      return NextResponse.json(
        { message: "Refresh response missing tokens." },
        { status: 502 },
      );
    }

    const nextResponse = NextResponse.json({ ok: true });

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

function isRefreshSuccessResponse(
  data: JsonRecord | null,
): data is RefreshSuccessResponse {
  if (!data) return false;

  const tokens = data.tokens as JsonRecord | undefined;

  return (
    typeof tokens === "object" &&
    tokens !== null &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string"
  );
}
