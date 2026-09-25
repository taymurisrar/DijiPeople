import { NextResponse } from "next/server";
import { AUTH_APP_CLIENT_ID, getApiBaseUrl } from "@/lib/auth-config";
import { classifyAdminLoginResponse } from "@/lib/admin-login-classify";
import {
  adminSessionResponse,
  extractAdminErrorCode,
  extractAdminErrorMessage,
  safeParseAdminJson,
} from "@/lib/admin-session-response";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

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
        ...forwardedClientHeaders(request),
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const rawBody = await response.text();
    const data = rawBody ? safeParseAdminJson(rawBody) : null;

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            extractAdminErrorMessage(data) ??
            `Login failed with status ${response.status}.`,
          errorCode: extractAdminErrorCode(data),
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

    const result = classifyAdminLoginResponse(data);

    /*
     * ADR-0019 — the password was right and the operator is enrolled in MFA.
     * The challenge goes back with no cookie; `/api/auth/mfa/verify` sets them
     * once a code is accepted.
     */
    if (result.kind === "challenge") {
      return NextResponse.json({ ok: true, ...result.challenge });
    }

    if (result.kind !== "session") {
      return NextResponse.json(
        {
          message: "API login response did not include usable token payload.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    return adminSessionResponse(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? `Unable to reach API at ${apiBaseUrl}: ${error.message}`
        : `Unable to reach API at ${apiBaseUrl}.`;

    return NextResponse.json({ message }, { status: 502 });
  }
}
