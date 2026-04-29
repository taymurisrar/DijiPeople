import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ payrollRunEmployeeId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { payrollRunEmployeeId } = await context.params;
  const response = await apiRequest(
    `/payslips/generate/run-employee/${payrollRunEmployeeId}`,
    { method: "POST" },
  );
  return proxyApiJsonResponse(response);
}
