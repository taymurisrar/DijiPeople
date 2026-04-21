import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function DELETE(_request: Request, context: UserRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
