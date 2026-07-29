import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserLoginHistoryRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(
  _request: Request,
  context: UserLoginHistoryRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/login-history`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
