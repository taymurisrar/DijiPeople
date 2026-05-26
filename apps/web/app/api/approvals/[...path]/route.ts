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
