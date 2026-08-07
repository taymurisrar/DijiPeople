import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/tenant-settings/organizations", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
