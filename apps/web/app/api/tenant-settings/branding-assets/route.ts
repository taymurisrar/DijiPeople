import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Forwards. Decides nothing.
 *
 * This handler used to own the branding MIME allowlist and the 3 MB limit — a
 * policy the API had never heard of, so a caller reaching the API directly was
 * governed by nothing — and it orchestrated the upload in two steps that were
 * not atomic: create the document, then point the setting at it. When the
 * second step failed, the first had already created a document that nothing
 * referenced and nothing would ever find. BUG-0041 / ITEM-0050.
 *
 * `POST /tenant-settings/branding-assets` now owns both. The policy is enforced
 * on the authority, and the orchestration compensates: a failed settings write
 * archives the document it created before the error is returned.
 */
export async function POST(request: Request) {
  const response = await apiRequest("/tenant-settings/branding-assets", {
    method: "POST",
    body: await request.formData(),
  });

  return proxyApiJsonResponse(response);
}
