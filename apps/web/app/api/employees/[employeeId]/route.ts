import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const response = await apiRequest(`/employees/${employeeId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const body = await request.json();
  const response = await apiRequest(`/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const response = await apiRequest(`/employees/${employeeId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
