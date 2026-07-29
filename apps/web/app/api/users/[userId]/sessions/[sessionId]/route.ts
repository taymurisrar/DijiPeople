import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserSessionRouteContext = {
  params: Promise<{ userId: string; sessionId: string }>;
};

export async function DELETE(_request: Request, context: UserSessionRouteContext) {
  const { userId, sessionId } = await context.params;
  const response = await apiRequest(`/users/${userId}/sessions/${sessionId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
