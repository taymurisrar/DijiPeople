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

// BUG-2007 - real delete. Refused by the API with a reasoned error when the
// project has dependent assignments, timesheet entries or cost allocations;
// this route stays a thin proxy either way.
export async function DELETE(_: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const response = await apiRequest(`/projects/${projectId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete project.");
  }
}
