import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(await apiRequest(`/payroll/gl-accounts/${id}`));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/gl-accounts/${id}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/gl-accounts/${id}`, { method: "DELETE" }),
  );
}
