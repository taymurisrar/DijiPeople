import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * BUG-0038. `tenant-commercial-panel.tsx` has always fetched this path with no
 * method — so `GET` — while the route exported only `POST`. Next answered 405,
 * the panel's error handler turned that into "Unable to load plans", and the
 * plan dropdown on the tenant commercial panel never populated.
 *
 * The API endpoint it needs (`GET /super-admin/plans`) existed the whole time;
 * only this proxy was missing the half that reaches it.
 *
 * Found by `scripts/check-route-method-callers.mjs` on its first run — the check
 * built for ITEM-0012 after BUG-0008, which was this same defect on the admin
 * logout route.
 */
export async function GET() {
  try {
    const response = await apiRequest("/super-admin/plans", { method: "GET" });
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

export async function POST(request: Request) {
  const body = await request.text();

  try {
    const response = await apiRequest("/super-admin/plans", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
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
