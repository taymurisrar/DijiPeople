import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    timesheetId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/timesheets/${timesheetId}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to reject timesheet.");
  }
}
