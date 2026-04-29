import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type TeamRouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function GET(_request: Request, context: TeamRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}`, { method: "GET" });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: TeamRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}`, {
    method: "PATCH",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: TeamRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}`, { method: "DELETE" });

  return proxyApiJsonResponse(response);
}
