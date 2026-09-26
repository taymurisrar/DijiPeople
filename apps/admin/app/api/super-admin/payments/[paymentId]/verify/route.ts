import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { paymentId } = await context.params;

  try {
    const response = await apiRequest(
      `/super-admin/payments/${encodeURIComponent(paymentId)}/verify`,
      { method: "POST" },
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
