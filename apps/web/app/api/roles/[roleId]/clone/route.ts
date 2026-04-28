import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RoleCloneRouteContext = {
  params: Promise<{ roleId: string }>;
};

export async function POST(_request: Request, context: RoleCloneRouteContext) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}/clone`, {
    method: "POST",
  });

  return proxyApiJsonResponse(response);
}
