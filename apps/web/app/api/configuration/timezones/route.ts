import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/configuration/timezones", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
