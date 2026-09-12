import { NextResponse } from "next/server";
import { AUTH_APP_CLIENT_ID, TENANT_SLUG_COOKIE } from "@/lib/auth-config";
import { getAuthCookieOptions } from "@/lib/auth-cookies";
import { buildAuthSessionCookies } from "@/lib/auth-session-cookies";
import { getApiBaseUrl } from "@/lib/auth";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

type JsonRecord = Record<string, unknown>;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
  rememberMe?: boolean;
};

type LoginSuccessResponse = JsonRecord & {
  user: unknown;
  tenant: { slug?: unknown } | unknown;
  tokens: TokenPair;
};

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        ...forwardedClientHeaders(request),
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
    const requestedRememberMe =
      isRecord(body) && body.rememberMe === true;
    const persistSession = data.tokens.rememberMe ?? requestedRememberMe;
    const cookies = buildAuthSessionCookies({
      ...data.tokens,
      rememberMe: persistSession,
    });

    nextResponse.cookies.set(
      cookies.access.name,
      cookies.access.value,
      cookies.access.options,
    );
    nextResponse.cookies.set(
      cookies.refresh.name,
      cookies.refresh.value,
      cookies.refresh.options,
    );
    if (cookies.session) {
      nextResponse.cookies.set(
        cookies.session.name,
        cookies.session.value,
        cookies.session.options,
      );
    }

    const tenantSlug = readTenantSlug(data.tenant);
    if (tenantSlug) {
      // Not one of the three session-lifetime cookies `buildAuthSessionCookies`
      // owns, but it should still live as long as the session it identifies.
      nextResponse.cookies.set(
        TENANT_SLUG_COOKIE,
        tenantSlug,
        getAuthCookieOptions(cookies.refresh.options.maxAge),
      );
    }

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

function readTenantSlug(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const slug = (value as { slug?: unknown }).slug;
  return typeof slug === "string" ? slug.trim().toLowerCase() : "";
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

  if (
    data.error &&
    typeof data.error === "object" &&
    !Array.isArray(data.error) &&
    typeof (data.error as { message?: unknown }).message === "string"
  ) {
    return (data.error as { message: string }).message;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
