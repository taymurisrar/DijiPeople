import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await context.params;
  try {
    const response = await apiRequest(
      `/platform/logs/events/${encodeURIComponent(traceId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
