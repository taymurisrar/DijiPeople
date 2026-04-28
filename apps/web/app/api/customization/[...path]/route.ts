import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

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
  const body =
    method === "GET" || method === "DELETE"
      ? undefined
      : JSON.stringify(await request.json());

  try {
    const response = await apiRequest(apiPath, {
      method,
      body,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete customization request.",
      },
      { status: 500 },
    );
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
