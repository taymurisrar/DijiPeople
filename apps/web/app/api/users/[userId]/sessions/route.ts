import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserSessionsRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, context: UserSessionsRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/sessions`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(
  _request: Request,
  context: UserSessionsRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/sessions`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
