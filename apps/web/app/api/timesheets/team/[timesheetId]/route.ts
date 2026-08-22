import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    timesheetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;

  try {
    const response = await apiRequest(`/timesheets/team/${timesheetId}`);
    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load team timesheet.");
  }
}
