import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RoleRouteContext = {
  params: Promise<{ roleId: string }>;
};

export async function GET(_request: Request, context: RoleRouteContext) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PUT(request: Request, context: RoleRouteContext) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: RoleRouteContext) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
