import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ planId: string; priceId: string }>;
};

/*
 * Publish or withdraw a custom plan's price (DP-QA-044).
 *
 * The body is read for one allow-listed word and nothing else is forwarded, so
 * the browser cannot reach any other route on the API through this proxy. The
 * API is the authority on whether the plan and price may be published.
 */
export async function POST(request: Request, context: RouteContext) {
  const { planId, priceId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const action = body?.action;

  if (action !== "publish" && action !== "unpublish") {
    return NextResponse.json(
      { message: "action must be publish or unpublish." },
      { status: 400 },
    );
  }

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices/${encodeURIComponent(priceId)}/${action}`,
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
