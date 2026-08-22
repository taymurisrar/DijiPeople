import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { entryId } = await context.params;

  try {
    const response = await apiRequest(`/attendance/${entryId}`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load attendance record.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { entryId } = await context.params;

  try {
    const response = await apiRequest(`/attendance/${entryId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete attendance record.");
  }
}
