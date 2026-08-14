import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Proxy for the attendance integration APIs.
 *
 * Follows the same shape as the other catch-all settings proxies: the browser
 * never talks to the API directly, so the access token stays in an httpOnly
 * cookie and the API origin is never exposed to client code.
 *
 * The gateway machine endpoints under `/integrations/gateway` authenticate with
 * a service credential rather than a user session, so they are deliberately not
 * reachable through this proxy.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;

  if (path[0] === "gateway") {
    return new Response(
      JSON.stringify({
        code: "NOT_PROXIED",
        message: "Gateway service endpoints are not reachable from the web app.",
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const targetPath = `/integrations/${path.map(encodeURIComponent).join("/")}`;
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

  return proxyApiJsonResponse(response);
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
