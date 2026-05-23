import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/billing/invoices", { method: "GET" });
  return proxyApiJsonResponse(response);
}
