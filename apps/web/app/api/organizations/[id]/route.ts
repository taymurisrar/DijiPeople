import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/organizations/${id}`, { method: "GET" });
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/organizations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update organization.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/organizations/${id}`, { method: "DELETE" });
  return proxyApiJsonResponse(response);
}
