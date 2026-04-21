import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserPermissionRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PUT(request: Request, context: UserPermissionRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/permissions`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
