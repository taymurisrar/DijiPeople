import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ planId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { planId } = await context.params;

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices`,
      { method: "GET" },
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

export async function POST(request: Request, context: RouteContext) {
  const { planId } = await context.params;
  const body = await request.text();

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices`,
      {
        method: "POST",
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
