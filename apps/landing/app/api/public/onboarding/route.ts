import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * Open a draft onboarding session.
 *
 * Thin proxy. `forwardedClientHeaders` matters because the API rate-limits this
 * per client address, and without it every visitor shares one bucket (BUG-0032)
 * — which on a draft-creating endpoint would mean one busy afternoon locking
 * everybody else out of starting a purchase.
 */
export async function POST(request: Request) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/public/onboarding`, {
      method: "POST",
      headers: {
        ...forwardedClientHeaders(request),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
    });

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
            : "Unable to start onboarding.",
      },
      { status: 500 },
    );
  }
}
