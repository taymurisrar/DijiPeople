import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string; adjustmentId: string }> };

export async function POST(_request: Request, context: Context) {
  const { id, adjustmentId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/adjustments/${adjustmentId}/submit`, {
      method: "POST",
    }),
  );
}
