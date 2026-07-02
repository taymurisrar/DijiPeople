import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type RouteContext = { params: Promise<{ employeeId: string }> };
export async function GET(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  return proxyApiJsonResponse(await apiRequest(`/employees/${encodeURIComponent(employeeId)}/timesheet-history`, { method: "GET" }));
}
