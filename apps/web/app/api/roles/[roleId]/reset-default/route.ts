import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RoleResetDefaultRouteContext = {
  params: Promise<{ roleId: string }>;
};

export async function POST(
  _request: Request,
  context: RoleResetDefaultRouteContext,
) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}/reset-default`, {
    method: "POST",
  });

  return proxyApiJsonResponse(response);
}
