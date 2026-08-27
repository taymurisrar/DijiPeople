import {
  apiRequest,
  proxyApiFileResponse,
  proxyApiJsonResponse,
} from "@/lib/server-api";

/**
 * Proxy for application releases.
 *
 * Downloads stream through the API so the same channel and permission checks
 * apply to the bytes as to the metadata, and no storage URL is ever exposed to
 * the browser.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/app-releases/${path.map(encodeURIComponent).join("/")}`;
  const query = new URL(request.url).searchParams.toString();

  const response = await apiRequest(
    query ? `${targetPath}?${query}` : targetPath,
    {
      method: request.method,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.text(),
    },
  );

  // A download is a binary stream, not JSON; pass it through untouched.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return proxyApiFileResponse(response);
  }

  return proxyApiJsonResponse(response);
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}
