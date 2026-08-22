import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/projects/${projectId}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to assign employee to project.");
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/projects/${projectId}/assignments`, { method: "GET" }),
  );
}
