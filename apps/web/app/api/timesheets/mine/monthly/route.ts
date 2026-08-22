import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const response = await apiRequest(
      `/timesheets/mine/monthly?${searchParams.toString()}`,
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load monthly timesheet.");
  }
}
