import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { DashboardRefreshButton } from "./dashboard-refresh-button";
import { DashboardShell } from "./dashboard-shell";
import type { DashboardSummary } from "./types";

export async function RoleDashboardPage({
  title,
  viewKey,
}: {
  title: string;
  viewKey: "hr" | "manager" | "employee" | "executive";
}) {
  let summary: DashboardSummary;
  try {
    summary = await apiRequestJson<DashboardSummary>("/dashboard/summary");
  } catch (error) {
    const message =
      error instanceof ApiRequestError
        ? error.message
        : "This dashboard could not be loaded.";
    return (
      <div className="dp-theme-scope px-4 py-6">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm font-medium uppercase text-danger">Dashboard unavailable</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted">{message}</p>
          <Link className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white" href="/">
            Open my overview
          </Link>
        </div>
      </div>
    );
  }
  const selectedView = summary.views.find((view) => view.key === viewKey);
  if (!selectedView) {
    return (
      <div className="dp-theme-scope px-4 py-6">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm font-medium uppercase text-danger">Access denied</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted">This dashboard is not available for your role or organization scope.</p>
          <Link className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white" href="/">Open my overview</Link>
        </div>
      </div>
    );
  }
  summary = { defaultView: viewKey, views: [selectedView] };
  return (
    <div className="dp-theme-scope grid gap-6 px-1 py-2 md:px-2 lg:px-4">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-surface">
        <div>
          <p className="text-sm font-medium text-muted">Operational dashboard</p>
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        </div>
        <DashboardRefreshButton />
      </div>
      <DashboardShell selectedViewKey={viewKey} summary={summary} />
    </div>
  );
}
