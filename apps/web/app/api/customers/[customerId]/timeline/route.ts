import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { customerId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/customers/${customerId}/timeline`, { method: "GET" }),
  );
}
