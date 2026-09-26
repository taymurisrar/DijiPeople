import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST() {
  const response = await apiRequest("/billing/subscription/resume", {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
