import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const body = await request.json();
  const response = await apiRequest(`/employees/${employeeId}/assign-owner`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}
