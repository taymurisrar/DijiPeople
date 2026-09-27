import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ tableKey: string }>;
};

/* A system module's published custom field definitions (TASK-0035). */
export async function GET(_request: Request, context: RouteContext) {
  const { tableKey } = await context.params;
  const response = await apiRequest(
    `/custom-fields/${encodeURIComponent(tableKey)}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}
