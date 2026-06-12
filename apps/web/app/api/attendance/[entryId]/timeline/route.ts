import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ entryId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { entryId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/attendance/${entryId}/timeline`, { method: "GET" }),
  );
}
