import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(query ? `/inbox?${query}` : "/inbox");
  return proxyApiJsonResponse(response);
}
