import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type ResetMfaRouteContext = {
  params: Promise<{ userId: string }>;
};

/**
 * Administrator MFA reset (ADR-0019). The API enforces `users.update`, the
 * tenant and the row scope; nothing is decided here.
 */
export async function POST(_request: Request, context: ResetMfaRouteContext) {
  const { userId } = await context.params;
  const response = await apiRequest(
    `/users/${encodeURIComponent(userId)}/mfa/reset`,
    { method: "POST" },
  );

  return proxyApiJsonResponse(response);
}
