import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/projects/${projectId}/timeline`, { method: "GET" }),
  );
}
