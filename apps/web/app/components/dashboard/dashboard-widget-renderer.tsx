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

  if (widget.type === "chart") {
    return <ChartCard widget={widget} />;
  }

  if (widget.type === "insight-list" || widget.type === "exception-list") {
    return <RowsCard mode="list" widget={widget} />;
  }

  return <SummaryCard widget={widget} />;
}

/*
 * Distribution widgets answer "how is this split up", so the chart leads with
 * the total and each slice's share. Bare bars scaled to the largest value made
 * every chart look full regardless of how lopsided the split actually was.
 *
 * Drawn with plain elements rather than a charting library: these are ranked
 * proportions, and a dependency would cost more than it explains.
 */

const CHART_SERIES_COLORS = [
  "#2563eb",
  "#0891b2",
  "#7c3aed",
  "#c026d3",
  "#ea580c",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
];

/* Beyond this the bars stop being readable and the tail is rolled into Other. */
const MAX_CHART_SLICES = 7;

function ChartCard({ widget }: { widget: DashboardWidget }) {
  const rows = getRows(widget)
    .map((row) => ({
      label: formatValue(row.label ?? row.key ?? row.id ?? "Item"),
      value: Number(row.value ?? 0),
    }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((left, right) => right.value - left.value);

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  /*
   * The tail is summed rather than dropped so the segments always add up to the
   * total shown above them.
   */
  const head = rows.slice(0, MAX_CHART_SLICES);
  const tail = rows.slice(MAX_CHART_SLICES);
  const slices = tail.length
    ? [
        ...head,
        {
          label: `Other (${tail.length})`,
          value: tail.reduce((sum, row) => sum + row.value, 0),
        },
      ]
    : head;

  const share = (value: number) => (total ? (value / total) * 100 : 0);

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <CardHeader widget={widget} />

      {slices.length ? (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {total.toLocaleString()}
            </span>
            <span className="text-sm text-muted">
              across {slices.length} {slices.length === 1 ? "group" : "groups"}
            </span>
          </div>

          {/* One stacked bar so the whole split reads at a glance. */}
          <div
            aria-hidden
            className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted/15"
          >
            {slices.map((slice, index) => (
              <div
                className="h-full first:rounded-l-full last:rounded-r-full"
                key={`segment-${slice.label}`}
                style={{
                  width: `${share(slice.value)}%`,
                  backgroundColor:
                    CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
                }}
              />
            ))}
          </div>

          <ul className="mt-4 grid gap-2.5">
            {slices.map((slice, index) => (
              <li className="grid gap-1" key={slice.label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        backgroundColor:
                          CHART_SERIES_COLORS[
                            index % CHART_SERIES_COLORS.length
                          ],
                      }}
                    />
                    <span className="truncate text-foreground">
                      {slice.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    <span className="font-medium text-foreground">
                      {slice.value.toLocaleString()}
                    </span>{" "}
                    ({share(slice.value).toFixed(share(slice.value) < 10 ? 1 : 0)}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/15">
                  <div
                    className="h-full rounded-full"
                    style={{
                      /* A visible sliver beats an invisible bar for small shares. */
                      width: `${Math.max(1.5, share(slice.value))}%`,
                      backgroundColor:
                        CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState message={widget.emptyState} />
      )}

      <WidgetAction action={widget.action} context={widget.title} />
    </article>
  );
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
      <WidgetAction action={widget.action} context={widget.title} />
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
      <WidgetAction action={widget.action} context={widget.title} />
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
      <WidgetAction action={widget.action} context={widget.title} />
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

function WidgetAction({
  action,
  context,
}: {
  action?: DashboardAction;
  context?: string;
}) {
  if (!action) {
    return null;
  }

  /*
   * BUG-2149 — the API builds every metric card's action with the constant
   * label "Open", so six cards on the overview offered six links whose
   * accessible names were identical. A link list read "Open, Open, Open,
   * Open, Open, Open".
   *
   * Fixed in the renderer rather than in `dashboard.service.ts`, which keeps a
   * presentation string out of the API contract: the renderer already has the
   * card title in scope, and the visible text stays "Open" because six cards
   * reading "Open" is a deliberate visual rhythm. The defect is the accessible
   * name, not the visible one.
   */
  const accessibleName = context ? `${action.label} ${context}` : undefined;

  return (
    <Link
      aria-label={accessibleName}
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

/*
 * BUG-2148 — one map, read by both renderings of the same idea.
 *
 * The dot and the pill answer the same question about the same union and each
 * owned its own copy of the answer. Two maps drift, and the dot's copy was the
 * one that had already stopped being a copy: it held colours, not words.
 */
const SEVERITY_LABELS: Record<DashboardSeverity, string> = {
  critical: "Critical",
  warning: "Review",
  good: "OK",
  neutral: "Info",
};

const SEVERITY_DOT_COLORS: Record<DashboardSeverity, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  good: "bg-success",
  neutral: "bg-muted",
};

function SeverityDot({
  severity = "neutral",
}: {
  severity?: DashboardSeverity;
}) {
  /*
   * BUG-2148 — this was `aria-hidden` with a background colour as its entire
   * output, so a widget's state reached sighted users as hue and reached
   * everyone else not at all. The number beside it is the metric; the dot is
   * the judgement about the metric, and nothing else carried that.
   *
   * Named rather than replaced by the pill: the visual design is right, and a
   * pill in a card header would be heavier than the header wants.
   */
  return (
    <span
      aria-label={`Status: ${SEVERITY_LABELS[severity]}`}
      className={`mt-1 h-2.5 w-2.5 rounded-full ${SEVERITY_DOT_COLORS[severity]}`}
      role="img"
    />
  );
}

function SeverityPill({
  severity = "neutral",
}: {
  severity?: DashboardSeverity;
}) {
  return (
    <span className="rounded-full border border-border px-2 py-1 text-xs text-muted">
      {SEVERITY_LABELS[severity]}
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

/*
 * Widget rows arrive as raw API values, so timestamps reach the screen as
 * "2026-08-07T16:44:50.051Z" unless they are recognised here. Dates are the
 * only type that needs interpreting; everything else is shown as sent.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string") {
    if (ISO_TIMESTAMP.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }

    if (ISO_DATE.test(value)) {
      // Parsed as UTC so a date-only value cannot slip a day in a west offset.
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
      }
    }

    return value;
  }

  if (typeof value === "number") {
    return value.toLocaleString();
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return JSON.stringify(value);
}
