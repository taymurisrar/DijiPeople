import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ promotionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(await context.params, "PATCH", await request.text());
}

export async function DELETE(_request: Request, context: RouteContext) {
  return proxy(await context.params, "DELETE");
}

async function proxy(
  { promotionId }: { promotionId: string },
  method: "PATCH" | "DELETE",
  body?: string,
) {
  try {
    const response = await apiRequest(
      `/super-admin/promotions/${encodeURIComponent(promotionId)}`,
      {
        method,
        body,
        headers: body ? { "Content-Type": "application/json" } : undefined,
      },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
