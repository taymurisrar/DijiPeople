import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/me/payslips");
  return proxyApiJsonResponse(response);
}
