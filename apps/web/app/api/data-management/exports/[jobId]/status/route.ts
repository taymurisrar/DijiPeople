import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  try {
    const response = await apiRequest(
      `/data-management/exports/${encodeURIComponent(jobId)}/status`,
      { method: "GET" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to read export progress.",
      },
      { status: 500 },
    );
  }
}
