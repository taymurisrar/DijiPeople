import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * The country list, proxied so the browser talks to this origin only.
 *
 * `forwardedClientHeaders` is carried through because the API rate-limits this
 * endpoint per client IP, and without it every visitor would share the proxy's
 * address and one busy afternoon would rate-limit the whole world — the defect
 * BUG-0032 filed against the other public routes.
 */
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("search");
  const query = search ? `?search=${encodeURIComponent(search)}` : "";

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/geography/countries${query}`,
      {
        headers: forwardedClientHeaders(request),
        cache: "no-store",
      },
    );
    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    /*
     * A 503 rather than an empty list. An empty array reads to the caller as
     * "there are no countries", which would render an empty select; a failure
     * status lets it fall back to a text input and still take the order.
     */
    return NextResponse.json(
      { message: "The country list is unavailable." },
      { status: 503 },
    );
  }
}
