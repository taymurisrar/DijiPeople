import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type TeamMembersRouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function PUT(request: Request, context: TeamMembersRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/members`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
