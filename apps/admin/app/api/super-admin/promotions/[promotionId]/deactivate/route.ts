import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ promotionId: string }> };

/*
 * Deactivation is its own route because `DELETE` now deletes.
 *
 * The two were one handler: `DELETE /promotions/:id` called
 * `deactivatePromotion`, answered 200 with the record body, and left the row in
 * place. The verb said one thing and the handler did another, and since the UI
 * offered only Deactivate there was no way to remove a promotion at all
 * (BUG-1757).
 */
export async function POST(_request: Request, context: RouteContext) {
  const { promotionId } = await context.params;
  try {
    const response = await apiRequest(
      `/super-admin/promotions/${encodeURIComponent(promotionId)}/deactivate`,
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
