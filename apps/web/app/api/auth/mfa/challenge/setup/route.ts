import { NextResponse } from "next/server";
import {
  postToAuthApi,
  unreachableApiResponse,
  upstreamErrorResponse,
} from "@/lib/auth-login-response";

/**
 * Enrolment during sign-in, when the tenant requires MFA (ADR-0019). Returns
 * the QR code and manual key; there is no session yet, so no cookie.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);

  try {
    const { response, data } = await postToAuthApi(
      request,
      "/auth/mfa/challenge/setup",
      body,
    );

    if (!response.ok) {
      return upstreamErrorResponse(
        data,
        response.status,
        "Two-factor setup could not be started.",
      );
    }

    return NextResponse.json(data ?? {});
  } catch (error: unknown) {
    return unreachableApiResponse(error);
  }
}
