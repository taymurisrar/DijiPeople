import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/employees/export${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  return proxyApiFileResponse(response);
}
