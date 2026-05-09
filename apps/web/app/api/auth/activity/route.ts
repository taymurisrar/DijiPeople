import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST() {
  const response = await apiRequest("/auth/activity", {
    method: "POST",
  });

  return proxyApiJsonResponse(response);
}
