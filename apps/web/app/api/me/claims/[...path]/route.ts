import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ path: string[] }> };

function target(path: string[]) {
  return `/me/claims/${path.join("/")}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(await apiRequest(target(path)));
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path), { method: "POST", body: await request.text() }),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path), { method: "PATCH", body: await request.text() }),
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(await apiRequest(target(path), { method: "DELETE" }));
}
