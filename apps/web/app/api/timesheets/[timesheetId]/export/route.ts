import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ timesheetId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;
  const query = new URL(request.url).search;
  return proxyApiFileResponse(
    await apiRequest(`/timesheets/${timesheetId}/export${query}`),
  );
}
