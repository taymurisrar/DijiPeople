import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";

type JsonRecord = Record<string, unknown>;
type LoginSuccessResponse = JsonRecord & {
  user: unknown;
  tenant: unknown;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

export async function POST(request: Request) {
  const body = await request.json();
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
          message: "API login response was missing the expected token payload.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(ACCESS_TOKEN_COOKIE, data.tokens.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15,
    });
    cookieStore.set(REFRESH_TOKEN_COOKIE, data.tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true, user: data.user, tenant: data.tenant });
  } catch (error) {
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

  const nestedError = data.error;
  if (typeof nestedError === "object" && nestedError !== null) {
    const message = (nestedError as JsonRecord).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return null;
}

function isLoginSuccessResponse(data: JsonRecord | null): data is LoginSuccessResponse {
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
