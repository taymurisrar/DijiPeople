import {
  apiRequest,
  proxyApiFileResponse,
  proxyApiJsonResponse,
} from "@/lib/server-api";

/**
 * Proxy for the desktop-agent DLP surfaces (TASK-0020): tenant rule config and
 * investigator review. The API is the authority — it enforces `dlp.review` and
 * audits every content read — so this only forwards. A screenshot response is a
 * binary stream and is passed through untouched; everything else is JSON.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/agent/dlp/${path.map(encodeURIComponent).join("/")}`;
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

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
