import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(query ? `/approvals?${query}` : "/approvals");
  return proxyApiJsonResponse(response);
}
