import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ moduleKey: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { moduleKey } = await context.params;

  const response = await apiRequest(
    `/data-management/modules/${encodeURIComponent(moduleKey)}/template`,
    { method: "GET" },
  );

  return proxyApiFileResponse(response);
}
