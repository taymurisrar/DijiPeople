import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ pipelineId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { pipelineId } = await context.params;
  const response = await apiRequest(`/recruitment/pipelines/${pipelineId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { pipelineId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/recruitment/pipelines/${pipelineId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update recruitment pipeline.",
      },
      { status: 500 },
    );
  }
}
