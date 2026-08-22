import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Forwards. Decides nothing — see the sibling collection handler for why the
 * payload reshaping that used to live here is now in the compensation runtime
 * spec. BUG-0041 / ITEM-0050.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ compensationId: string }> },
) {
  const { compensationId } = await context.params;
  const response = await apiRequest(`/payroll/compensations/${compensationId}`, {
    method: "GET",
  });
  return proxyApiJsonResponse(response);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ compensationId: string }> },
) {
  const { compensationId } = await context.params;
  const response = await apiRequest(`/payroll/compensations/${compensationId}`, {
    method: "PATCH",
    body: await request.text(),
  });

  return proxyApiJsonResponse(response);
}
