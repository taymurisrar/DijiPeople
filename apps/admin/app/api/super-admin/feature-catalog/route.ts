import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * The tenant feature catalog, for the client-side plan entitlements panel.
 *
 * The catalog is `TENANT_FEATURE_DEFINITIONS` in the API — the same list the
 * product gates modules on — and it deliberately has no copy in this app. The
 * legacy plan page read it in a server component; the runtime record page
 * needs it in the browser, and this is the proxy that gets it there rather
 * than a second hardcoded list going stale against the one that matters.
 */
export async function GET() {
  try {
    const response = await apiRequest("/super-admin/feature-catalog", {
      method: "GET",
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
