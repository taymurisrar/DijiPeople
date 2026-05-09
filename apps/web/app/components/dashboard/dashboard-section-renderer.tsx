import type { DashboardSection } from "./types";
import { DashboardWidgetRenderer } from "./dashboard-widget-renderer";

type DashboardSectionRendererProps = {
  section: DashboardSection;
};

export function DashboardSectionRenderer({
  section,
}: DashboardSectionRendererProps) {
  const widgets = [...section.widgets].sort((a, b) => a.order - b.order);

  if (!widgets.length) {
    return null;
  }

  const gridClass =
    section.layout === "table" || section.layout === "list"
      ? "grid gap-4"
      : "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {section.title}
        </h2>
        {section.description ? (
          <p className="mt-1 text-sm text-muted">{section.description}</p>
        ) : null}
      </div>
      <div className={gridClass}>
        {widgets.map((widget) => (
          <DashboardWidgetRenderer key={widget.key} widget={widget} />
        ))}
      </div>
    </section>
  );
}
