import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/approvals/${path.map(encodeURIComponent).join("/")}`;
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(query ? `${targetPath}?${query}` : targetPath, {
    method: request.method,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text(),
  });

  return proxyApiJsonResponse(response);
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

/*
 * `proxy` has always forwarded a body for any non-GET method; only GET was
 * exported, so `POST /api/approvals/<id>/approve` answered 405 and the inbox
 * had no way to act even once the API grew the route.
 *
 * This stays a pass-through. Which permission governs the decision, whether the
 * step belongs to this caller, and which module applies it are all settled by
 * the API — a route handler here must never re-make an authorization decision.
 */
export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}
