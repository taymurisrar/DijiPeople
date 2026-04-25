import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/organization-hierarchy/tree", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
