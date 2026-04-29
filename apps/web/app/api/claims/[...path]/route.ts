import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ path: string[] }> };

function target(path: string[], request: Request) {
  return `/claims/${path.join("/")}${new URL(request.url).search}`;
}

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(await apiRequest(target(path, request)));
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path, request), {
      method: "POST",
      body: await request.text(),
    }),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path, request), {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path, request), { method: "DELETE" }),
  );
}
