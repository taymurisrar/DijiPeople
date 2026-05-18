import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/leave-requests/available-types", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
