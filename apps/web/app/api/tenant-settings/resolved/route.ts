import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/tenant-settings/resolved", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
