import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/super-admin/tenants/${tenantId}/access-users`, {
      method: "POST",
      body: await request.text(),
      headers: { "Content-Type": "application/json" },
    }),
  );
}
