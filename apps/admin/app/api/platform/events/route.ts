import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyApiJsonResponse(await apiRequest(`/platform/events${query}`));
}
