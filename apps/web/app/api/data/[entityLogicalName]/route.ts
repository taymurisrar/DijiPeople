import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ entityLogicalName: string }> },
) {
  const { entityLogicalName } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/data/${encodeURIComponent(entityLogicalName)}${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}
