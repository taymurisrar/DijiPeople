import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/tenants/current/slug", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request) {
  const body = await request.text();
  const response = await apiRequest("/tenants/current/slug", {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}
