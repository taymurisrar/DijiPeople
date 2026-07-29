import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  const response = await apiRequest(`/me/payslips${query}`);
  return proxyApiJsonResponse(response);
}
