import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * TASK-0032 WP-04, item 4. Thin proxy to the one audited path for changing a
 * lead's partner — `PATCH /super-admin/leads/:leadId/attribution`
 * (`LeadsService.correctAttribution`). The generic runtime PATCH this admin
 * app otherwise uses for every module refuses a `partnerId` change outright
 * (`updateLead()`), by design, so the partner-attribution panel calls this
 * route instead of the generic one.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await context.params;
  const body = await request.text();

  try {
    const response = await apiRequest(
      `/super-admin/leads/${leadId}/attribution`,
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
