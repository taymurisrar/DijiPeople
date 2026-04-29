import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, context: UserRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}`, { method: "GET" });

  return proxyApiJsonResponse(response);
}

export async function PUT(request: Request, context: UserRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: UserRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
