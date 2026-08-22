import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;

  try {
    const response = await apiRequest(`/employees/${employeeId}/resend-invite`, {
      method: "POST",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to resend invitation.");
  }
}
