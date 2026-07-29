import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type AuditLogDetailRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: AuditLogDetailRouteContext,
) {
  const { id } = await context.params;
  const response = await apiRequest(`/audit-logs/${encodeURIComponent(id)}`);

  return proxyApiJsonResponse(response);
}
