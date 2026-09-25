import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/** Thin proxy (ADR-0019); the API acts on the signed-in account only. */
export async function GET() {
  const response = await apiRequest("/auth/mfa/status", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
