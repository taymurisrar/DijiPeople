import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

/**
 * Proxy for the work-profiles API (units, profiles, versions, assignments and
 * the `.djpkg` export/import). The API is the authority: it enforces
 * `work-profiles.read` / `work-profiles.manage` and tenant scope on every
 * route, so this only forwards the method, path, query and body.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/work-profiles${path
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
    return proxyErrorResponse(error, "Unable to reach work profiles.");
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
