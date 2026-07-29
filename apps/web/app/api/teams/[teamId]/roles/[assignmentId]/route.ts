import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type TeamRoleRouteContext = {
  params: Promise<{ teamId: string; assignmentId: string }>;
};

export async function DELETE(
  _request: Request,
  context: TeamRoleRouteContext,
) {
  const { teamId, assignmentId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/roles/${assignmentId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
