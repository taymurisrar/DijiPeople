import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function buildPath(context: RouteContext) {
  const params = await context.params;
  return `/holiday-calendars/${params.path.map(encodeURIComponent).join("/")}`;
}

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const response = await apiRequest(
    `${await buildPath(context)}${url.search ? url.search : ""}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request, context: RouteContext) {
  const response = await apiRequest(await buildPath(context), {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const response = await apiRequest(await buildPath(context), {
    method: "PATCH",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const response = await apiRequest(await buildPath(context), {
    method: "DELETE",
  });
  return proxyApiJsonResponse(response);
}
