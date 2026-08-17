import { NextResponse } from "next/server";
import type { DashboardSummary } from "@/app/components/dashboard/types";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

/**
 * Dashboard view options for the settings picker.
 *
 * BUG-0041 — this handler used to hold a `DEFAULT_DASHBOARD_OPTION` constant
 * (`admin` / "Administration") and return it whenever the API call failed for
 * any reason other than 401, or whenever the API returned no visible views.
 *
 * That is the BUG-0039 shape: a refusal converted into a `200`. A caller the API
 * denied with 403 received a fabricated administration dashboard the API had
 * never offered them, and a tenant that genuinely has no visible views was told
 * it had one. Both look identical to a successful response, so nothing
 * downstream could tell an answer from a guess.
 *
 * The handler now reshapes what the API returned and forwards what the API
 * refused. An empty list is a real answer and is returned as one.
 */
export async function GET() {
  try {
    const summary = await apiRequestJson<DashboardSummary>("/dashboard/summary");
    const options = summary.views
      .filter((view) => view.visible)
      .map((view) => ({
        id: view.key,
        name: view.label,
        subtitle: view.description ?? null,
      }))
      .sort((left, right) => {
        if (left.id === summary.defaultView) return -1;
        if (right.id === summary.defaultView) return 1;
        return 0;
      });

    return NextResponse.json({ options, source: "resolved" });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(
        {
          errorCode: error.errorCode ?? "DASHBOARD_VIEWS_UNAVAILABLE",
          message: error.message,
          traceId: error.traceId,
        },
        { status: error.status },
      );
    }

    throw error;
  }
}
