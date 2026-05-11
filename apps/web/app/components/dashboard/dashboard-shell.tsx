import { DashboardSectionRenderer } from "./dashboard-section-renderer";
import type { DashboardSummary } from "./types";

type DashboardShellProps = {
  selectedViewKey?: string;
  summary: DashboardSummary;
};

export function DashboardShell({
  selectedViewKey,
  summary,
}: DashboardShellProps) {
  const visibleViews = summary.views.filter((view) => view.visible);
  const selectedView =
    visibleViews.find((view) => view.key === selectedViewKey) ??
    visibleViews.find((view) => view.key === summary.defaultView) ??
    visibleViews[0];

  if (!selectedView) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        No dashboard views are available for your account.
      </div>
    );
  }

  const sections = [...selectedView.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="grid gap-6">

      <div className="grid gap-8">
        {sections.map((section) => (
          <DashboardSectionRenderer key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}
