import { NextResponse } from "next/server";
import type { DashboardSummary } from "@/app/components/dashboard/types";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

const DEFAULT_DASHBOARD_OPTION = {
  id: "admin",
  name: "Administration",
  subtitle: "Default administration dashboard",
};

export async function GET() {
  try {
    const summary = await apiRequestJson<DashboardSummary>(
      "/dashboard/summary",
    );
    const visibleViews = summary.views.filter((view) => view.visible);
    const options = visibleViews
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

    if (options.length > 0) {
      logDashboardLookup("resolved", {
        status: 200,
        defaultView: summary.defaultView,
        optionCount: options.length,
      });
      return NextResponse.json({ options, source: "resolved" });
    }

    logDashboardLookup("defaulted", {
      status: 200,
      fallback: DEFAULT_DASHBOARD_OPTION.id,
      reason: "no-visible-views",
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return NextResponse.json(
        {
          errorCode: error.errorCode ?? "SESSION_EXPIRED",
          message: error.message,
          traceId: error.traceId,
        },
        { status: 401 },
      );
    }

    logDashboardLookup("defaulted", {
      status: errorStatus(error),
      fallback: DEFAULT_DASHBOARD_OPTION.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return NextResponse.json({
    options: [DEFAULT_DASHBOARD_OPTION],
    source: "default",
  });
}

function errorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return "unknown";
}

function logDashboardLookup(
  result: "resolved" | "defaulted",
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[settings/dashboard-views] ${result}`, details);
}
