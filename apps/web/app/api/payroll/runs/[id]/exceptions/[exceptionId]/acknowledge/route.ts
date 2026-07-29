import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string; exceptionId: string }> };

export async function POST(request: Request, context: Context) {
  const { id, exceptionId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/exceptions/${exceptionId}/acknowledge`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}
