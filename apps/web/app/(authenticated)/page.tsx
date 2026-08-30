/* The server data boundary intentionally converts loader failures into DashboardError. */
/* eslint-disable react-hooks/error-boundaries */
import Link from "next/link";
import { DashboardShell } from "@/app/components/dashboard/dashboard-shell";
import type { DashboardSummary } from "@/app/components/dashboard/types";
import { ModuleViewSelector } from "@/app/components/runtime/module-view-selector";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { DashboardRefreshButton } from "@/app/components/dashboard/dashboard-refresh-button";
import type { TenantResolvedSettingsResponse } from "./settings/types";

type DashboardPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  try {
    const [summary, resolvedSettings] = await Promise.all([
      apiRequestJson<DashboardSummary>("/dashboard/summary"),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
    ]);
    const visibleViews = summary.views.filter((view) => view.visible);
    const configuredDefaultView =
      resolvedSettings?.system.defaultDashboardView || summary.defaultView;
    const selectedView =
      visibleViews.find((view) => view.key === resolvedSearchParams?.view) ??
      visibleViews.find((view) => view.key === configuredDefaultView) ??
      visibleViews.find((view) => view.key === summary.defaultView) ??
      visibleViews[0] ??
      null;
    const dashboardViews = visibleViews.map((view) => ({
      id: view.key,
      name: view.label,
      type: "system" as const,
      description: view.description,
      isDefault: view.key === configuredDefaultView,
      badgeCount: view.badgeCount,
    }));

    return (
      <div className="dp-theme-scope grid gap-6 px-1 py-2 md:px-2 lg:px-4">
        <div className="flex flex-col px-2 py-1 gap-4 lg:flex-row lg:items-center rounded-xl bg-surface lg:justify-between">
          <ModuleViewSelector
            mode="dropdown"
            configureHref="/settings/customization/modules"
            activeViewId={selectedView?.key}
            views={dashboardViews}
          />
          <DashboardRefreshButton />
        </div>

        <DashboardShell selectedViewKey={selectedView?.key} summary={summary} />
      </div>
    );
  } catch (error) {
    return <DashboardError error={error} />;
  }
}

function DashboardError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiRequestError
      ? error.message
      : "The dashboard could not be loaded.";

  return (
    <div className="dp-theme-scope px-4 py-6 md:px-6 lg:px-8">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase text-danger">
          Dashboard unavailable
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
          We could not load your dashboard
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{message}</p>
        <Link
          className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
          href="/"
        >
          Retry
        </Link>
      </div>
    </div>
  );
}
