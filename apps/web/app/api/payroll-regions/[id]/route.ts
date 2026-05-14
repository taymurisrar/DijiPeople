import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll-regions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(await request.json()),
    }),
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll-regions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}
