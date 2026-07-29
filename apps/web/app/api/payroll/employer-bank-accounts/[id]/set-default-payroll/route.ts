import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/employer-bank-accounts/${id}/set-default-payroll`, {
      method: "POST",
    }),
  );
}
