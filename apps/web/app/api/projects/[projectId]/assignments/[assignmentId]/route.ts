import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    assignmentId: string;
    projectId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { assignmentId, projectId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/projects/${projectId}/assignments/${assignmentId}`, {
      method: "DELETE",
    }),
  );
}
