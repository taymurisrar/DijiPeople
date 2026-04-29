import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/payroll/runs/${id}/lock`, {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
