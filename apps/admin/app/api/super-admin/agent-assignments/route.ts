import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Proxy for the desktop-agent rollout list (TASK-0027): every tenant with its
 * agent assignment. The API enforces the platform guard and audits changes; this
 * only forwards.
 */
export async function GET() {
  try {
    const response = await apiRequest("/super-admin/agent-assignments", {
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
