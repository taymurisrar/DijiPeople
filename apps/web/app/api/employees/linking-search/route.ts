import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/employees/linking-search${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}
