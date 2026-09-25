import { NextResponse } from "next/server";
import { AUTH_APP_CLIENT_ID, TENANT_SLUG_COOKIE } from "@/lib/auth-config";
import { getAuthCookieOptions } from "@/lib/auth-cookies";
import { buildAuthSessionCookies } from "@/lib/auth-session-cookies";
import { getApiBaseUrl } from "@/lib/auth";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";
import {
  classifyLoginResponse,
  isRecord,
  type JsonRecord,
  type LoginResponseClassification,
  type MfaChallenge,
} from "@/lib/auth-login-classify";

export { classifyLoginResponse };

/*
 * ADR-0019 — what an API sign-in answer is, and what the browser is allowed to
 * receive for it.
 *
 * Before MFA the sign-in route knew two outcomes: tokens (set cookies) or an
 * error. A correct password on an enrolled account is now a third — a
 * challenge with no tokens — and the route used to report that shape as
 * "Login response missing tokens." (502). Classifying in one pure function,
 * shared by the sign-in route and the MFA verify/setup routes, is what keeps
 * the rule in one place: **cookies are written only for a response that
 * carries tokens**, and a challenge goes to the browser without any.
 */

/** POSTs to a public API auth endpoint on behalf of the browser. */
export async function postToAuthApi(
  request: Request,
  path: string,
  body: unknown,
) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
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
  return { response, data: rawBody ? safeParseJson(rawBody) : null };
}

/**
 * The browser response for a sign-in that produced a session, with the three
 * session cookies and the tenant cookie set. `extra` carries anything the page
 * must see once, such as recovery codes issued during enrolment.
 */
export function sessionResponse(
  session: Extract<LoginResponseClassification, { kind: "session" }>,
  requestedRememberMe: boolean,
  extra: JsonRecord = {},
) {
  const nextResponse = NextResponse.json({
    ok: true,
    user: session.user,
    tenant: session.tenant,
    ...extra,
  });
  const cookies = buildAuthSessionCookies({
    ...session.tokens,
    rememberMe: session.tokens.rememberMe ?? requestedRememberMe,
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

  const tenantSlug = readTenantSlug(session.tenant);
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
}

/** A challenge, passed through with no cookie of any kind. */
export function challengeResponse(challenge: MfaChallenge) {
  return NextResponse.json({ ok: true, ...challenge });
}

export function upstreamErrorResponse(
  data: JsonRecord | null,
  status: number,
  fallback: string,
) {
  return NextResponse.json(
    {
      message: extractErrorMessage(data) ?? fallback,
      errorCode: readErrorCode(data),
      upstreamStatus: status,
    },
    { status },
  );
}

export function unreachableApiResponse(error: unknown) {
  const apiBaseUrl = getApiBaseUrl();
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

function readTenantSlug(value: unknown) {
  if (!isRecord(value)) return "";
  const slug = value.slug;
  return typeof slug === "string" ? slug.trim().toLowerCase() : "";
}

function safeParseJson(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readErrorCode(data: JsonRecord | null): string | undefined {
  if (!data) return undefined;
  for (const key of ["errorCode", "code"]) {
    if (typeof data[key] === "string") return data[key] as string;
  }
  return undefined;
}

export function extractErrorMessage(data: JsonRecord | null): string | null {
  if (!data) return null;

  if (isRecord(data.error) && typeof data.error.message === "string") {
    return data.error.message;
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

