import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(
    `/documents/types/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(
    `/documents/types/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(await request.json()) },
  );
  return proxyApiJsonResponse(response);
}
