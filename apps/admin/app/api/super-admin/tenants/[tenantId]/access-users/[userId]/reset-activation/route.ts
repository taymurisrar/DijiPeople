import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantId: string; userId: string }> },
) {
  const { tenantId, userId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(
      `/super-admin/tenants/${tenantId}/access-users/${userId}/reset-activation`,
      { method: "POST" },
    ),
  );
}
