import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(request: Request) {
  const body = await request.text();
  const response = await apiRequest("/tenants/current/slug", {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}
