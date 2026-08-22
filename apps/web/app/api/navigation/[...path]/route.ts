import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxyNavigationRequest(
  request: Request,
  context: RouteContext,
  method: "GET" | "PUT",
) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const apiPath = `/navigation/${path.join("/")}${query ? `?${query}` : ""}`;
  const requestBody = method === "GET" ? "" : await request.text();
  const body = requestBody.trim() ? requestBody : undefined;

  try {
    const response = await apiRequest(apiPath, { method, body });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to complete navigation request.");
  }
}

export function GET(request: Request, context: RouteContext) {
  return proxyNavigationRequest(request, context, "GET");
}

export function PUT(request: Request, context: RouteContext) {
  return proxyNavigationRequest(request, context, "PUT");
}
