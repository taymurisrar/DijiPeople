import { NextResponse } from "next/server";
import {
  classifyLoginResponse,
  postToAuthApi,
  sessionResponse,
  unreachableApiResponse,
  upstreamErrorResponse,
} from "@/lib/auth-login-response";

/**
 * Second step of a tenant sign-in (ADR-0019). The body — `challengeToken` and
 * one of `code`/`recoveryCode` — is forwarded untouched; the API decides.
 * Cookies are set only when the API answers with tokens.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);

  try {
    const { response, data } = await postToAuthApi(
      request,
      "/auth/mfa/verify",
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

    return sessionResponse(result, false);
  } catch (error: unknown) {
    return unreachableApiResponse(error);
  }
}
