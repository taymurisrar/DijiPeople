import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/** Thin proxy (ADR-0019); the API acts on the signed-in operator only. */
export async function GET() {
  const response = await apiRequest("/platform-users/me/mfa", {
    method: "GET",
  });
  return proxyApiJsonResponse(response);
}
