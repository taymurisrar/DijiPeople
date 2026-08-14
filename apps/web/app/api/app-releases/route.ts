import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Release catalogue.
 *
 * The sibling `[...path]` route only matches when there is at least one path
 * segment, so the collection endpoint needs its own handler.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(
    query ? `/app-releases?${query}` : "/app-releases",
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/app-releases", {
    method: "POST",
    body: await request.text(),
  });
  return proxyApiJsonResponse(response);
}
