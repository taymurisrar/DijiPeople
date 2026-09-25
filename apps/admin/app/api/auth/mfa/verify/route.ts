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

/**
 * Second step of a platform sign-in (ADR-0019). The body — `challengeToken`
 * and one of `code`/`recoveryCode` — is forwarded untouched; cookies are set
 * only when the API answers with tokens.
 */
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
    const response = await fetch(`${apiBaseUrl}/admin/auth/mfa/verify`, {
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
            "The code could not be verified.",
          errorCode: extractAdminErrorCode(data),
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

    const result = classifyAdminLoginResponse(data);

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
