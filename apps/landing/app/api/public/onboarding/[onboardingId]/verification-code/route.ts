import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * Resend a verification code.
 *
 * `forwardedClientHeaders` matters here more than on most proxies: without it
 * every visitor shares one rate-limit bucket at the API (BUG-0032), and this is
 * an endpoint whose whole risk is somebody using it to mail a stranger
 * repeatedly.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/verification-code`,
      {
        method: "POST",
        headers: {
          ...forwardedClientHeaders(request),
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to send a new code.",
      },
      { status: 500 },
    );
  }
}
