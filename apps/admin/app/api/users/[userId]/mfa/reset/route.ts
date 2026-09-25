import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Reset another platform user's MFA (ADR-0019). The API decides who may: the
 * same manage-platform-users check as editing or disabling the account.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const response = await apiRequest(
    `/platform-users/${encodeURIComponent(userId)}/mfa/reset`,
    { method: "POST" },
  );
  return proxyApiJsonResponse(response);
}
