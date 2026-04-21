import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/permissions", { method: "GET" });
  return proxyApiJsonResponse(response);
}
