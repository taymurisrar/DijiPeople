import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ timesheetId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/timesheets/${timesheetId}/payroll-handoff`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}
