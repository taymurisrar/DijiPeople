import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type TeamMemberRouteContext = {
  params: Promise<{ teamId: string; memberId: string }>;
};

export async function PATCH(
  request: Request,
  context: TeamMemberRouteContext,
) {
  const { teamId, memberId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/members/${memberId}`, {
    method: "PATCH",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(
  _request: Request,
  context: TeamMemberRouteContext,
) {
  const { teamId, memberId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/members/${memberId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
