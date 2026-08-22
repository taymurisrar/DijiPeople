import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    employeeId: string;
    previousEmploymentId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId, previousEmploymentId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/previous-employments/${previousEmploymentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update previous employment.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId, previousEmploymentId } = await context.params;

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/previous-employments/${previousEmploymentId}`,
      {
        method: "DELETE",
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete previous employment.");
  }
}
