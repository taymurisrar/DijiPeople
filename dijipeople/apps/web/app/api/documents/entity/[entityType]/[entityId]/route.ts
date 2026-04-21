import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ entityType: string; entityId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { entityType, entityId } = await context.params;
  const response = await apiRequest(`/documents/entity/${entityType}/${entityId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
