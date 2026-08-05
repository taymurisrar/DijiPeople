import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  const response = await apiRequest("/error-logs/client", {
    method: "POST",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });
  return proxyApiJsonResponse(response);
}
