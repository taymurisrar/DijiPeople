import type { Metadata } from "next";
import {
  PlatformDashboard,
  type OperationsDashboardSummary,
  type PlatformDashboardSummary,
} from "@/app/_components/dashboard/platform-dashboard";
import { requireSystemAdminUser } from "@/lib/auth";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Dashboard",
};


export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireSystemAdminUser("/");
  const requestedRange = (await searchParams).range;
  const range = ["30d", "3m", "6m", "12m"].includes(requestedRange ?? "")
    ? requestedRange
    : "6m";
  const result = await Promise.all([
      apiRequestJson<PlatformDashboardSummary>(
        `/super-admin/dashboard-summary?range=${range}`,
      ),
      apiRequestJson<{ defaultViewKey?: string | null }>(
        "/platform-users/me/module-preferences?moduleKey=dashboard",
      ),
    ])
    .then(([summary, preference]) => ({
      ok: true as const,
      summary,
      preference,
    }))
    .catch((error: unknown) => ({ ok: false as const, error }));
  /*
   * Fetched and failed independently of the block above.
   *
   * The Operations view is one screen among nine and its data comes from a
   * separate endpoint (`OperationsDashboardService`, itself section-isolated
   * on the API side). A network hiccup fetching *it* used to have no way to
   * avoid blanking the whole page, because the only failure path here was one
   * `Promise.all().catch()` shared with the commercial summary above — this
   * keeps the two failures from being able to take each other down.
   */
  const operationsResult = await apiRequestJson<OperationsDashboardSummary>(
    "/super-admin/dashboard/operations",
  )
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      reason: error instanceof Error ? error.message : "Request failed.",
    }));
  if (result.ok) {
    return (
      <PlatformDashboard
        summary={result.summary}
        operations={operationsResult.ok ? operationsResult.data : null}
        operationsError={operationsResult.ok ? null : operationsResult.reason}
        defaultViewKey={result.preference.defaultViewKey}
        roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      />
    );
  }
  {
    const error = result.error;
    const reference =
      error instanceof ApiRequestError && error.traceId
        ? ` Reference: ${error.traceId}.`
        : "";
    return (
      <main className="rounded-[30px] border border-rose-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">
          Dashboard unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          We could not load the dashboard right now.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {error instanceof Error
            ? error.message
            : "The dashboard request failed."}
          {reference}
        </p>
      </main>
    );
  }
}
