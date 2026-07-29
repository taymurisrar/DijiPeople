import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ timesheetId: string; path: string[] }>;
};

async function proxy(request: Request, context: RouteContext, method: string) {
  const { timesheetId, path } = await context.params;
  const target = `/timesheets/${timesheetId}/weeks/${path.join("/")}${new URL(request.url).search}`;
  return proxyApiJsonResponse(
    await apiRequest(target, {
      method,
      body: method === "GET" ? undefined : await request.text(),
    }),
  );
}

export function GET(request: Request, context: RouteContext) {
  return proxy(request, context, "GET");
}
export function POST(request: Request, context: RouteContext) {
  return proxy(request, context, "POST");
}
export function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context, "PATCH");
}
