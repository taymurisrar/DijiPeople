import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/metadata/entities", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
