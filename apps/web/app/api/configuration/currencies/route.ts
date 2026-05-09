import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/configuration/currencies", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
