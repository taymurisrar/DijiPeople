import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    entityLogicalName: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { entityLogicalName } = await context.params;
  const response = await apiRequest(
    `/metadata/entities/${encodeURIComponent(entityLogicalName)}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}
