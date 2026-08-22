import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;

  try {
    const response = await apiRequest(`/payroll/cycles/${cycleId}/preview`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to preview payroll generation.");
  }
}
