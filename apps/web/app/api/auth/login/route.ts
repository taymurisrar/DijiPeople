import { NextResponse } from "next/server";
import {
  challengeResponse,
  classifyLoginResponse,
  postToAuthApi,
  sessionResponse,
  unreachableApiResponse,
  upstreamErrorResponse,
} from "@/lib/auth-login-response";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  try {
    const { response, data } = await postToAuthApi(
      request,
      "/auth/login",
      body,
    );

    if (!response.ok) {
      return upstreamErrorResponse(
        data,
        response.status,
        `Login failed with status ${response.status}.`,
      );
    }

    const result = classifyLoginResponse(data);

    /*
     * ADR-0019 — the password was right and a second factor is owed. The
     * challenge goes to the browser as it is, and no cookie is set: there is
     * no session until `/api/auth/mfa/verify` (or the setup confirm route)
     * completes.
     */
    if (result.kind === "challenge") {
      return challengeResponse(result.challenge);
    }

    if (result.kind !== "session") {
      return NextResponse.json(
        {
          message: "Login response missing tokens.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    return sessionResponse(result, isRememberMe(body));
  } catch (error: unknown) {
    return unreachableApiResponse(error);
  }
}

function isRememberMe(body: unknown) {
  return Boolean(
    body &&
      typeof body === "object" &&
      (body as { rememberMe?: unknown }).rememberMe === true,
  );
}
