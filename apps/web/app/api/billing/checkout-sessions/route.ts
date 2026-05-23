import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  const response = await apiRequest("/billing/checkout-sessions", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}
