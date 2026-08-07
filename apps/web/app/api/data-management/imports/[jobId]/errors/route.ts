import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  const response = await apiRequest(
    `/data-management/imports/${encodeURIComponent(jobId)}/errors`,
    { method: "GET" },
  );

  return proxyApiFileResponse(response);
}
