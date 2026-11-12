import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/** Withdraw an unclaimed invoice so the buyer can pick another method. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/bank-transfer/cancel`,
      {
        method: "POST",
        headers: {
          ...forwardedClientHeaders(request),
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "We could not reach the server. Please try again." },
      { status: 502 },
    );
  }
}
