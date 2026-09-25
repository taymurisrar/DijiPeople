import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/** Thin proxy (ADR-0019); the API acts on the signed-in account only. */
export async function POST(request: Request) {
  const response = await apiRequest("/auth/mfa/recovery-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });

  return proxyApiJsonResponse(response);
}
