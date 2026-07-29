import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type PermissionRouteContext = {
  params: Promise<{ permissionId: string }>;
};

export async function GET(_request: Request, context: PermissionRouteContext) {
  const { permissionId } = await context.params;
  const response = await apiRequest(`/permissions/${permissionId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
