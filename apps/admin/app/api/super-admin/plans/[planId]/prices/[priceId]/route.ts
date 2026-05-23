import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ planId: string; priceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { planId, priceId } = await context.params;
  const body = await request.text();

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices/${encodeURIComponent(priceId)}`,
      {
        method: "PATCH",
        body,
        headers: {
          "Content-Type": "application/json",
        },
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

export async function DELETE(_request: Request, context: RouteContext) {
  const { planId, priceId } = await context.params;

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices/${encodeURIComponent(priceId)}`,
      { method: "DELETE" },
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
