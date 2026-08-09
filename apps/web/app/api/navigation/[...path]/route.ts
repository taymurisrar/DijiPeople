import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

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
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete navigation request.",
      },
      { status: 500 },
    );
  }
}

export function GET(request: Request, context: RouteContext) {
  return proxyNavigationRequest(request, context, "GET");
}

export function PUT(request: Request, context: RouteContext) {
  return proxyNavigationRequest(request, context, "PUT");
}
