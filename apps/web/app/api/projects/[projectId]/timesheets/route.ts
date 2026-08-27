import { NextRequest } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const response = await apiRequest(`/projects/${projectId}/timesheets`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
