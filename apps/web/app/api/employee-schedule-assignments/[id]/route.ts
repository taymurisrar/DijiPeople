import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(
      `/employee-schedule-assignments/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  );
}
