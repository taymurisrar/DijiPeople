import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  const response = await apiRequest(`/payslips${search}`);
  return proxyApiJsonResponse(response);
}
