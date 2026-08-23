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

export async function DELETE(request: Request, context: RouteContext) {
  const { planId, priceId } = await context.params;

  /*
   * `mode` has to survive the hop, and only `mode`.
   *
   * The API distinguishes deactivate (bare DELETE) from delete
   * (`?mode=permanent`). This proxy took no `request` at all, so the query
   * string was dropped and every permanent delete arrived as a deactivation —
   * the row would disappear from the screen, having only been retired, and
   * come back on the next load.
   *
   * Forwarded by allowlist rather than by passing the whole search string
   * through: a proxy that reflects arbitrary caller-supplied query parameters
   * into an authenticated API call is a way to reach parameters the browser was
   * never meant to set.
   */
  const mode = new URL(request.url).searchParams.get("mode");
  const query = mode === "permanent" ? "?mode=permanent" : "";

  try {
    const response = await apiRequest(
      `/super-admin/plans/${encodeURIComponent(planId)}/prices/${encodeURIComponent(priceId)}${query}`,
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
