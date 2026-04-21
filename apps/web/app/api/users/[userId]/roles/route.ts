import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserRoleRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PUT(request: Request, context: UserRoleRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/roles`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
