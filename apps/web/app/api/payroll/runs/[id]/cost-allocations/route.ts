import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const query = new URL(request.url).search;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/cost-allocations${query}`),
  );
}
