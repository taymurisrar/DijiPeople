import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type TeamRolesRouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function PUT(request: Request, context: TeamRolesRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/roles`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
