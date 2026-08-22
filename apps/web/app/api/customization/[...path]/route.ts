import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxyCustomizationRequest(
  request: Request,
  context: RouteContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const apiPath = `/customization/${path.join("/")}${query ? `?${query}` : ""}`;
  const requestBody =
    method === "GET" || method === "DELETE" ? "" : await request.text();
  const body = requestBody.trim() ? requestBody : undefined;

  try {
    const response = await apiRequest(apiPath, {
      method,
      body,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to complete customization request.");
  }
}

export function GET(request: Request, context: RouteContext) {
  return proxyCustomizationRequest(request, context, "GET");
}

export function POST(request: Request, context: RouteContext) {
  return proxyCustomizationRequest(request, context, "POST");
}

export function PATCH(request: Request, context: RouteContext) {
  return proxyCustomizationRequest(request, context, "PATCH");
}

export function DELETE(request: Request, context: RouteContext) {
  return proxyCustomizationRequest(request, context, "DELETE");
}
