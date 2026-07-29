import {
  apiRequest,
  proxyApiFileResponse,
  proxyApiJsonResponse,
} from "@/lib/server-api";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const response = await apiRequest(
    `/timesheet-exports/${path.join("/")}${new URL(request.url).search}`,
  );
  return path[path.length - 1] === "download"
    ? proxyApiFileResponse(response)
    : proxyApiJsonResponse(response);
}
