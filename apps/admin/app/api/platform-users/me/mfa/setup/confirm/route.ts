import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/** Thin proxy (ADR-0019); the API acts on the signed-in operator only. */
export async function POST(request: Request) {
  const response = await apiRequest("/platform-users/me/mfa/setup/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  return proxyApiJsonResponse(response);
}
