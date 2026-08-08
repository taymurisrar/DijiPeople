import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/*
 * An optional catch-all so the collection route (/api/workflows) and the record
 * routes (/api/workflows/<id>/runs) are served by the same proxy.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const targetPath = suffix ? `/workflows/${suffix}` : "/workflows";
  const url = new URL(request.url);
  const query = url.searchParams.toString();

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
