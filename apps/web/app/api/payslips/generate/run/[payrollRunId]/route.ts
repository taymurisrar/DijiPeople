import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ payrollRunId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { payrollRunId } = await context.params;
  const response = await apiRequest(`/payslips/generate/run/${payrollRunId}`, {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
