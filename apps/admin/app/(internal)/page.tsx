import {
  PlatformDashboard,
  type PlatformDashboardSummary,
} from "@/app/_components/dashboard/platform-dashboard";
import { requireSystemAdminUser } from "@/lib/auth";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

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
  if (result.ok) {
    return (
      <PlatformDashboard
        summary={result.summary}
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
