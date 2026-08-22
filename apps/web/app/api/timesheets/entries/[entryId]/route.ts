import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { entryId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/timesheets/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update timesheet entry.");
  }
}
