import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * The buyer's bank invoice: GET reads it (refreshable, never cached), POST
 * issues it for a verified order. The order id in the path is the capability.
 */
async function relay(
  request: Request,
  params: Promise<{ onboardingId: string }>,
  method: "GET" | "POST",
) {
  const { onboardingId } = await params;
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/bank-transfer`,
      {
        method,
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  return relay(request, params, "GET");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  return relay(request, params, "POST");
}
