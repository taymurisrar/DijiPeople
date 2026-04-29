import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserEmployeeLinkRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(
  request: Request,
  context: UserEmployeeLinkRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/link-employee`, {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(
  _request: Request,
  context: UserEmployeeLinkRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/link-employee`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
