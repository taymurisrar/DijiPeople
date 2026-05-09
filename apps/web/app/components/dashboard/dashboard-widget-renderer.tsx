import Link from "next/link";
import type {
  DashboardAction,
  DashboardSeverity,
  DashboardWidget,
} from "./types";

type DashboardWidgetRendererProps = {
  widget: DashboardWidget;
};

type DashboardRow = Record<string, unknown> & {
  key?: string;
  id?: string;
  label?: string;
  value?: string | number;
  href?: string;
  status?: DashboardSeverity;
};

export function DashboardWidgetRenderer({
  widget,
}: DashboardWidgetRendererProps) {
  if (widget.type === "quick-actions") {
    return <QuickActions widget={widget} />;
  }

  if (widget.type === "metric-card" || widget.type === "kpi-card") {
    return <MetricCard widget={widget} />;
  }

  if (widget.type === "table") {
    return <RowsCard mode="table" widget={widget} />;
  }

  if (widget.type === "insight-list" || widget.type === "exception-list") {
    return <RowsCard mode="list" widget={widget} />;
  }

  return <SummaryCard widget={widget} />;
}

function MetricCard({ widget }: { widget: DashboardWidget }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{widget.title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
            {widget.value ?? "-"}
          </p>
        </div>
        <SeverityDot severity={widget.severity} />
      </div>
      {widget.subtitle ? (
        <p className="mt-3 min-h-10 text-sm leading-5 text-muted">
          {widget.subtitle}
        </p>
      ) : null}
      <WidgetAction action={widget.action} />
    </article>
  );
}

function SummaryCard({ widget }: { widget: DashboardWidget }) {
  const entries = objectEntries(widget.data);

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <CardHeader widget={widget} />
      {entries.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {entries.slice(0, 8).map(([key, value]) => (
            <div
              className="rounded-lg border border-border/70 bg-muted/5 px-3 py-2"
              key={key}
            >
              <p className="text-xs font-medium uppercase text-muted">
                {humanize(key)}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatValue(value)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message={widget.emptyState} />
      )}
      <WidgetAction action={widget.action} />
    </article>
  );
}

function RowsCard({
  mode,
  widget,
}: {
  mode: "list" | "table";
  widget: DashboardWidget;
}) {
  const rows = getRows(widget);

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <CardHeader widget={widget} />
      {rows.length ? (
        mode === "table" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody className="divide-y divide-border">
                {rows.slice(0, 8).map((row, index) => (
                  <tr key={getRowKey(row, index)}>
                    {visibleCells(row).map(([key, value]) => (
                      <td className="py-3 pr-4 text-muted" key={key}>
                        <span className="block text-xs uppercase text-muted/80">
                          {humanize(key)}
                        </span>
                        <RowValue row={row} value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {rows.slice(0, 8).map((row, index) => (
              <li
                className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/5 p-3"
                key={getRowKey(row, index)}
              >
                <div>
                  <LinkedLabel row={row} />
                  {"value" in row ? (
                    <p className="mt-1 text-sm text-muted">
                      {formatValue(row.value)}
                    </p>
                  ) : null}
                </div>
                <SeverityPill severity={row.status} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <EmptyState message={widget.emptyState} />
      )}
      <WidgetAction action={widget.action} />
    </article>
  );
}

function QuickActions({ widget }: { widget: DashboardWidget }) {
  const actions = widget.actions ?? [];

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <CardHeader widget={widget} />
      {actions.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => (
            <Link
              className={[
                "rounded-lg border px-4 py-3 text-sm font-semibold transition",
                action.variant === "primary"
                  ? "border-accent bg-accent text-white hover:bg-accent/90"
                  : "border-border bg-white text-foreground hover:bg-muted/10",
              ].join(" ")}
              href={action.href}
              key={action.key}
            >
              {action.label}
              {action.description ? (
                <span className="mt-1 block text-xs font-normal opacity-80">
                  {action.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState message={widget.emptyState} />
      )}
    </article>
  );
}

function CardHeader({ widget }: { widget: DashboardWidget }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {widget.title}
        </h3>
        {widget.description ? (
          <p className="mt-1 text-sm text-muted">{widget.description}</p>
        ) : null}
      </div>
      <SeverityDot severity={widget.severity} />
    </div>
  );
}

function WidgetAction({ action }: { action?: DashboardAction }) {
  if (!action) {
    return null;
  }

  return (
    <Link
      className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
      href={action.href}
    >
      {action.label}
    </Link>
  );
}

function LinkedLabel({ row }: { row: DashboardRow }) {
  const label = formatValue(
    row.label ?? row.type ?? row.key ?? row.id ?? "Item",
  );

  if (typeof row.href === "string" && row.href) {
    return (
      <Link
        className="font-semibold text-foreground hover:underline"
        href={row.href}
      >
        {label}
      </Link>
    );
  }

  return <p className="font-semibold text-foreground">{label}</p>;
}

function RowValue({ row, value }: { row: DashboardRow; value: unknown }) {
  if (typeof row.href === "string" && row.href && typeof value === "string") {
    return (
      <Link
        className="font-medium text-foreground hover:underline"
        href={row.href}
      >
        {value}
      </Link>
    );
  }

  return (
    <span className="font-medium text-foreground">{formatValue(value)}</span>
  );
}

function SeverityDot({
  severity = "neutral",
}: {
  severity?: DashboardSeverity;
}) {
  const color =
    severity === "critical"
      ? "bg-danger"
      : severity === "warning"
        ? "bg-warning"
        : severity === "good"
          ? "bg-success"
          : "bg-muted";

  return (
    <span aria-hidden className={`mt-1 h-2.5 w-2.5 rounded-full ${color}`} />
  );
}

function SeverityPill({
  severity = "neutral",
}: {
  severity?: DashboardSeverity;
}) {
  const label =
    severity === "critical"
      ? "Critical"
      : severity === "warning"
        ? "Review"
        : severity === "good"
          ? "OK"
          : "Info";

  return (
    <span className="rounded-full border border-border px-2 py-1 text-xs text-muted">
      {label}
    </span>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
      {message ?? "No data to show."}
    </div>
  );
}

function getRows(widget: DashboardWidget): DashboardRow[] {
  if (!widget.data || typeof widget.data !== "object") {
    return [];
  }

  const data = widget.data as Record<string, unknown>;
  const rows = data.rows ?? data.items;

  return Array.isArray(rows)
    ? rows.filter(
        (row): row is DashboardRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}

function objectEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).filter(
    ([, entry]) =>
      !Array.isArray(entry) && (typeof entry !== "object" || entry === null),
  );
}

function visibleCells(row: DashboardRow) {
  return Object.entries(row).filter(
    ([key]) => !["id", "key", "href", "status"].includes(key),
  );
}

function getRowKey(row: DashboardRow, index: number) {
  return String(row.key ?? row.id ?? index);
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return JSON.stringify(value);
}
