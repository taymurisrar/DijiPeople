import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await context.params;
  const response = await apiRequest(`/error-logs/${encodeURIComponent(traceId)}/download`);
  return proxyApiFileResponse(response);
}
