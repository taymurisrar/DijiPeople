import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

/**
 * Proxy for the work-meetings API. The API is the authority: it enforces the
 * `work-items.*` permissions, tenant scope and row-level scope on every route, so
 * this only forwards the method, path, query and body.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/work-meetings${path
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join("")}`;
  const query = new URL(request.url).searchParams.toString();

  try {
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
  } catch (error) {
    return proxyErrorResponse(error, "Unable to reach work meetings.");
  }
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

export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
