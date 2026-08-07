import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  try {
    const response = await apiRequest(
      `/data-management/imports/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to cancel the import.",
      },
      { status: 500 },
    );
  }
}
