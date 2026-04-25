import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserBusinessUnitRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PUT(
  request: Request,
  context: UserBusinessUnitRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/business-unit`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
