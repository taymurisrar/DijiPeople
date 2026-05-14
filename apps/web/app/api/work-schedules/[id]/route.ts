import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/work-schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/work-schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return proxyApiJsonResponse(response);
}
