import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  try {
    const response = await apiRequest(
      `/data-management/imports/${encodeURIComponent(jobId)}/status`,
      { method: "GET" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to read import progress.");
  }
}
