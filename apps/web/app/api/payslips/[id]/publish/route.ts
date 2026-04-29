import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/payslips/${id}/publish`, {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
