import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/runs/${id}/journal/reverse`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}
