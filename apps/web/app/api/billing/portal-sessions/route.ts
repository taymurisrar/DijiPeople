import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST() {
  const response = await apiRequest("/billing/portal-sessions", {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
