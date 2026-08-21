import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST() {
  return proxyApiJsonResponse(
    await apiRequest("/platform/events/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
}
