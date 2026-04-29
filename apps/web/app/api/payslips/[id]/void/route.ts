import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.text();
  const response = await apiRequest(`/payslips/${id}/void`, {
    method: "POST",
    body,
  });
  return proxyApiJsonResponse(response);
}
