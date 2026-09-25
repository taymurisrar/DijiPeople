import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REMEMBER_ME_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieDiagnostics,
  getAuthCookieOptions,
  getSessionAuthCookieOptions,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";
import type { AdminLoginClassification } from "@/lib/admin-login-classify";

/**
 * The browser response for an admin sign-in that produced a session: the
 * access, refresh, session and remember-me cookies, exactly as the sign-in
 * route has always written them. Shared by `/api/auth/login` and
 * `/api/auth/mfa/verify` (ADR-0019) so a session completed through MFA is
 * indistinguishable from one completed by password alone.
 */
export function adminSessionResponse(
  session: Extract<AdminLoginClassification, { kind: "session" }>,
) {
  const { tokens } = session;
  const nextResponse = NextResponse.json({
    ok: true,
    user: session.user,
    tenant: session.tenant,
    cookies: {
      accessToken: true,
      refreshToken: true,
      session: Boolean(tokens.sessionId),
    },
  });

  let accessCookieOptions:
    | ReturnType<typeof getAuthCookieOptions>
    | ReturnType<typeof getSessionAuthCookieOptions>;
  let refreshCookieOptions:
    | ReturnType<typeof getAuthCookieOptions>
    | ReturnType<typeof getSessionAuthCookieOptions>;

  try {
    const remembered = tokens.rememberMe === true;
    accessCookieOptions = remembered
      ? getAuthCookieOptions(ACCESS_TOKEN_MAX_AGE_SECONDS)
      : getSessionAuthCookieOptions();
    refreshCookieOptions = remembered
      ? getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS)
      : getSessionAuthCookieOptions();
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

  nextResponse.cookies.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    accessCookieOptions,
  );
  nextResponse.cookies.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    refreshCookieOptions,
  );
  if (tokens.sessionId) {
    nextResponse.cookies.set(
      SESSION_COOKIE,
      tokens.sessionId,
      refreshCookieOptions,
    );
  }
  nextResponse.cookies.set(
    REMEMBER_ME_COOKIE,
    tokens.rememberMe === true ? "true" : "false",
    refreshCookieOptions,
  );

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
}

export function extractAdminErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;

  if (typeof record.message === "string") return record.message;
  if (
    Array.isArray(record.message) &&
    record.message.every((item) => typeof item === "string")
  ) {
    return record.message.join(", ");
  }
  const nested = record.error;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { message?: unknown }).message === "string"
  ) {
    return (nested as { message: string }).message;
  }
  return null;
}

export function extractAdminErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.errorCode === "string") return record.errorCode;
  if (typeof record.code === "string") return record.code;
  return undefined;
}

export function safeParseAdminJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
