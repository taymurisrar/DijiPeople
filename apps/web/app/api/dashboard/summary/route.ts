import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/dashboard/summary", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
