import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/*
 * BUG-3564. Thin proxy for the audit trail's detail drawer, same shape as
 * `app/api/platform/logs/events/[traceId]/route.ts`: never decides
 * authorization itself (the API's `PlatformPermissionsGuard` does), only
 * forwards cookies and normalizes an unreachable-API response.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const response = await apiRequest(
      `/platform/audit-logs/${encodeURIComponent(id)}`,
    );
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
