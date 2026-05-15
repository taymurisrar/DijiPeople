import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;
  const body = await request.text();
  const response = await apiRequest(`/super-admin/tenants/${tenantId}/slug`, {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}
