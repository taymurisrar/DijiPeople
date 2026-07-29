import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserRoleRecordRouteContext = {
  params: Promise<{ userId: string; userRoleId: string }>;
};

export async function DELETE(
  _request: Request,
  context: UserRoleRecordRouteContext,
) {
  const { userId, userRoleId } = await context.params;
  const response = await apiRequest(`/users/${userId}/roles/${userRoleId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
