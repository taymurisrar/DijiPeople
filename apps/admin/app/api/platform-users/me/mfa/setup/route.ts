import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/** Thin proxy (ADR-0019); the API acts on the signed-in operator only. */
export async function POST() {
  const response = await apiRequest("/platform-users/me/mfa/setup", {
    method: "POST",
  });
  return proxyApiJsonResponse(response);
}
