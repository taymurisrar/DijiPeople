import { NextResponse } from "next/server";
import {
  classifyLoginResponse,
  postToAuthApi,
  sessionResponse,
  unreachableApiResponse,
  upstreamErrorResponse,
} from "@/lib/auth-login-response";

/**
 * Completes enrolment during sign-in (ADR-0019): the API turns MFA on, issues
 * the session and returns the recovery codes, which are passed to the page
 * once so it can show them before continuing.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);

  try {
    const { response, data } = await postToAuthApi(
      request,
      "/auth/mfa/challenge/setup/confirm",
      body,
    );

    if (!response.ok) {
      return upstreamErrorResponse(
        data,
        response.status,
        "The code could not be verified.",
      );
    }

    const result = classifyLoginResponse(data);
    if (result.kind !== "session") {
      return NextResponse.json(
        { message: "Verification response missing tokens." },
        { status: 502 },
      );
    }

    const recoveryCodes = Array.isArray(data?.recoveryCodes)
      ? data.recoveryCodes.filter(
          (code): code is string => typeof code === "string",
        )
      : [];

    return sessionResponse(result, false, { recoveryCodes });
  } catch (error: unknown) {
    return unreachableApiResponse(error);
  }
}
