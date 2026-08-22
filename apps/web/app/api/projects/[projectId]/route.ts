import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const response = await apiRequest(`/projects/${projectId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update project.");
  }
}
