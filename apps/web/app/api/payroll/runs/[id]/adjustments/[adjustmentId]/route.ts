import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string; adjustmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id, adjustmentId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/adjustments/${adjustmentId}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

export async function DELETE(_request: Request, context: Context) {
  const { id, adjustmentId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/adjustments/${adjustmentId}`, {
      method: "DELETE",
    }),
  );
}
