import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * Thin proxy. The API decides whether the code is right — repeating any of that
 * judgement here would put a second, weaker copy of an authorization decision in
 * a place an attacker can reach without it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/verify-email`,
      {
        method: "POST",
        headers: {
          ...forwardedClientHeaders(request),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(await request.json()),
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
          error instanceof Error ? error.message : "Unable to verify the code.",
      },
      { status: 500 },
    );
  }
}
