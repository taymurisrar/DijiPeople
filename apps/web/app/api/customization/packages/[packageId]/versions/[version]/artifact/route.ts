import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ packageId: string; version: string }> };

/*
 * TASK-0033 — streams the released `.djpkg` byte for byte. The JSON catch-all
 * would re-serialize it and drop the attachment headers, and the file's
 * checksum only verifies if the bytes are untouched.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { packageId, version } = await context.params;
  const response = await apiRequest(
    `/customization/packages/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(version)}/artifact`,
    { method: "GET" },
  );
  return proxyApiFileResponse(response);
}
