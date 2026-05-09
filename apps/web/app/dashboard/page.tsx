import Link from "next/link";
import { DashboardShell } from "@/app/components/dashboard/dashboard-shell";
import type { DashboardSummary } from "@/app/components/dashboard/types";
import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import type { ModuleViewOption } from "@/app/components/view-selector/types";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { DashboardRefreshButton } from "../components/dashboard/dashboard-refresh-button";

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
    const summary =
      await apiRequestJson<DashboardSummary>("/dashboard/summary");
    const visibleViews = summary.views.filter((view) => view.visible);
    const selectedView =
      visibleViews.find((view) => view.key === resolvedSearchParams?.view) ??
      visibleViews.find((view) => view.key === summary.defaultView) ??
      visibleViews[0] ??
      null;
    const dashboardViews: ModuleViewOption[] = visibleViews.map((view) => ({
      id: view.key,
      name: view.label,
      type: "system",
      description: view.description,
      isDefault: view.key === summary.defaultView,
      badgeCount: view.badgeCount,
      icon: view.icon,
    }));

    return (
      <main className="dp-theme-scope grid gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start rounded-xl bg-surface lg:justify-between">
            <ModuleViewSelector
              configureHref="/dashboard/settings/customization/views"
              enabled
              selectedViewId={selectedView?.key ?? ""}
              views={dashboardViews}
            />
          <DashboardRefreshButton />
        </div>

        <DashboardShell selectedViewKey={selectedView?.key} summary={summary} />
      </main>
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
    <main className="dp-theme-scope px-4 py-6 md:px-6 lg:px-8">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase text-danger">
          Dashboard unavailable
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
          We could not load your dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{message}</p>
        <Link
          className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
          href="/dashboard"
        >
          Retry
        </Link>
      </div>
    </main>
  );
}
