import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;
  const response = await apiRequest(`/payroll/cycles/${cycleId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;
  const response = await apiRequest(`/payroll/cycles/${cycleId}`, {
    method: "PATCH",
    body: await request.text(),
  });

  return proxyApiJsonResponse(response);
}
