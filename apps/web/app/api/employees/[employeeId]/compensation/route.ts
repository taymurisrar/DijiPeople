import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const response = await apiRequest(`/employees/${employeeId}/compensation`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PUT(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/employees/${employeeId}/compensation`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update employee compensation.");
  }
}
