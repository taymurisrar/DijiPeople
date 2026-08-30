/*
 * The vocabulary every chart in this directory speaks.
 *
 * Deliberately a plain `.ts` module with no imports at all — not React, not the
 * formatting context. `apps/web/jest.config.js` runs in `testEnvironment:
 * "node"` and matches `**\/*.spec.ts` only, so anything a spec needs to reach
 * has to be importable without a DOM. Keeping the shapes here means
 * `chart-geometry.spec.ts` can build a `ChartSeries` and assert on it without
 * pulling a component — the same technique `dashboard-widget-renderer.tsx` uses
 * when it exports `formatValue` purely so `dashboard-widget-formatting.spec.ts`
 * can reach it.
 */

/**
 * One measured value.
 *
 * `key` identifies the point for React keys, drill-down and stacking across
 * series; it is a record id or a stable slug, never a display string. `label`
 * is what a human reads — and, because of BUG-2148, it is also what assistive
 * technology reads: no chart in this directory may distinguish two points by
 * colour without also distinguishing them by label.
 *
 * `secondaryValue` carries the other half of a paired metric — a previous
 * period, a target, a headcount behind a rate — for charts that draw two
 * numbers per category without needing a second full series.
 */
export type ChartPoint = {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
};

/** A named run of points. Series are matched to each other by `ChartPoint.key`. */
export type ChartSeries = {
  key: string;
  label: string;
  points: ChartPoint[];
};

/**
 * How a raw number should read once it reaches a person.
 *
 * The chart never formats a number itself: `chart-format.ts` maps each of these
 * onto `formatNumber` / `formatMoney` / `formatWorkHours` from
 * `lib/formatting-context.ts`, which read the tenant's resolved settings.
 * Calling `toLocaleString` here instead is BUG-2010, which shipped a dashboard
 * showing the visiting browser's locale rather than the tenant's.
 */
export type ChartValueFormat = "number" | "percent" | "duration" | "currency";

/**
 * Props shared by every chart component in this directory.
 *
 * `ariaDescription` is required rather than optional, and that is the whole
 * point of it being here. BUG-2148 shipped because the accessible rendering was
 * something a caller could forget; a required prop cannot be forgotten, only
 * filled in badly. It should say what the chart shows and what the shape of it
 * is ("Headcount by department, 6 departments, ranging 4 to 61"), not restate
 * the title — the per-point values are already exposed through the chart's own
 * table representation.
 */
export type BaseChartProps = {
  series: ChartSeries[];
  /** Default `"number"`. */
  valueFormat?: ChartValueFormat;
  /** ISO 4217 code. Read only when `valueFormat === "currency"`. */
  currencyCode?: string | null;
  /**
   * A CSS-pixel *hint*, used to derive the drawing aspect ratio and a
   * `min-height`. It is never a fixed width: charts scale to their container
   * through `viewBox` + `preserveAspectRatio`.
   */
  height?: number;
  /** Names the overlaid series when one is a previous-period comparison. */
  comparisonLabel?: string | null;
  emptyMessage?: string;
  /** REQUIRED text alternative. See the note above. */
  ariaDescription: string;
  /** When present, points become focusable and Enter/Space activate them. */
  onPointSelect?: (point: ChartPoint, series: ChartSeries) => void;
};

/** Time bucketing granularity for `bucketByPeriod`. */
export type ChartGranularity = "day" | "week" | "month" | "quarter";

/**
 * `true` when there is nothing to draw: no series, or every series empty.
 *
 * Split out because "has no data" is decided identically by seven components
 * and getting it subtly different in one of them is how a chart ends up
 * rendering an empty axis box instead of the shared `EmptyState`.
 *
 * A series of all-zero values is *not* empty — zero is a measurement, and a bar
 * chart of six zeroes is a meaningful answer to "how many exceptions today".
 */
export function hasChartData(series: readonly ChartSeries[] | null | undefined) {
  if (!series || series.length === 0) {
    return false;
  }

  return series.some((entry) => entry.points.length > 0);
}
