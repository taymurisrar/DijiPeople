import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * Which payment methods the server will offer for one price. The answer —
 * market, currency, approved receiving account, operator withdrawals — is
 * decided entirely by the API; this only relays it, uncached.
 */
export async function GET(request: Request) {
  const planPriceId =
    new URL(request.url).searchParams.get("planPriceId") ?? "";
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/payment-methods?planPriceId=${encodeURIComponent(planPriceId)}`,
      {
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
      { message: "Unable to load payment methods." },
      { status: 502 },
    );
  }
}
