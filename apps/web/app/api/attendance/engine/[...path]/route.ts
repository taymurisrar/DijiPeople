import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Proxy for the reconciled attendance API.
 *
 * Same shape as the other catch-all proxies: the browser never talks to the API
 * directly, so the access token stays in an httpOnly cookie and the API origin is
 * never exposed to client code.
 *
 * Every route behind this is tenant-scoped and employee-scoped server-side. This
 * proxy passes the session through and adds no authority of its own — in
 * particular it cannot widen who a caller may see, which is decided in the
 * engine service.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;

  const targetPath = `/attendance/engine/${path.map(encodeURIComponent).join("/")}`;
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
