import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST() {
  const response = await apiRequest("/billing/subscription/cancel", {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
