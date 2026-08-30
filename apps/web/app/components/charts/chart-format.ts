import {
  formatDate,
  formatMoney,
  formatNumber,
  formatWorkHours,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import type { ChartGranularity, ChartValueFormat } from "./chart-types";
import type { TimeBucket } from "./chart-geometry";

/*
 * The only place a chart turns a number into words.
 *
 * Two separate rules meet here, both of which have already cost this repository
 * a defect.
 *
 * BUG-2010 — the dashboard called `Date.prototype.toLocaleString(undefined,
 * {...})` directly, which reads the *visiting browser's* locale and timezone
 * rather than the tenant's. A tenant configured for MM/dd/yyyy, 12h, UTC saw
 * whatever the visitor's laptop happened to be set to. AGENTS.md's rule follows
 * from it: never call `toLocaleString` / `toLocaleDateString` / `Intl` from a
 * component; go through `lib/formatting-context.ts`, which reads the settings
 * `resolved-settings-provider.tsx` installs for the whole authenticated shell.
 * There is no `Intl` reference anywhere in this directory, and this module is
 * the choke point that keeps it that way.
 *
 * BUG-2148 — severity was conveyed by colour alone and hidden from assistive
 * technology. `pointAccessibleLabel` below is the countermeasure every chart in
 * this directory routes through: whatever a sighted reader gets from hue and
 * position, a screen reader gets as "series, category: value (share)".
 *
 * Kept as a plain `.ts` module for the same reason as `chart-geometry.ts` —
 * jest here is node-only and matches `*.spec.ts`, so this is reachable by a
 * test while a component is not.
 */

/** What a missing or unmeasurable number reads as. Matches the dashboard. */
export const MISSING_VALUE_TEXT = "-";

/**
 * Render one measured number the way the tenant has asked for numbers to be
 * rendered.
 *
 * `currencyCode` is read only for `"currency"`; passing it with any other
 * format is harmless and ignored, which keeps callers from having to branch.
 */
export function formatChartValue(
  value: number | null | undefined,
  format: ChartValueFormat = "number",
  options: {
    currencyCode?: string | null;
    context?: ResolvedFormattingContext | null;
  } = {},
): string {
  /*
   * `null` and `undefined` are checked *before* the numeric coercion, not
   * after. `Number(null)` is `0`, so the obvious one-line guard silently
   * renders an unmeasured category as a measured zero — the exact confusion
   * this module elsewhere insists on preserving. Caught by its own spec.
   */
  if (value === null || value === undefined) {
    return MISSING_VALUE_TEXT;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return MISSING_VALUE_TEXT;
  }

  const context = options.context ?? null;

  switch (format) {
    case "currency":
      return formatMoney(numeric, options.currencyCode, context) || MISSING_VALUE_TEXT;

    case "duration":
      /* Chart durations are hours; `formatWorkHours` renders "7.5 h". */
      return formatWorkHours(numeric, context) || MISSING_VALUE_TEXT;

    case "percent": {
      const rendered = formatNumber(numeric, context);
      return rendered ? `${rendered}%` : MISSING_VALUE_TEXT;
    }

    case "number":
    default:
      return formatNumber(numeric, context) || MISSING_VALUE_TEXT;
  }
}

/**
 * A proportion, rendered.
 *
 * Small shares keep a decimal and large ones do not: "0%" next to a visible
 * segment reads as a rendering fault, while "23.0%" is just noise. The
 * threshold mirrors the convention the dashboard's chart card already uses.
 */
export function formatShare(
  share: number | null | undefined,
  context?: ResolvedFormattingContext | null,
): string {
  /* See `formatChartValue`: `Number(null)` is `0`, so null is checked first. */
  if (share === null || share === undefined) {
    return MISSING_VALUE_TEXT;
  }

  const numeric = Number(share);
  if (!Number.isFinite(numeric)) {
    return MISSING_VALUE_TEXT;
  }

  const decimals = Math.abs(numeric) < 10 ? 1 : 0;
  const rendered = formatNumber(Number(numeric.toFixed(decimals)), context ?? null);

  return rendered ? `${rendered}%` : MISSING_VALUE_TEXT;
}

/**
 * The accessible name for a single plotted point — the BUG-2148 countermeasure.
 *
 * Every chart in this directory puts this on the element a reader can focus or
 * hover, so the information carried by colour and position is also carried by
 * text. The series name comes first because in a multi-series chart it is the
 * thing colour was encoding; in a single-series chart it is omitted rather than
 * repeated for every point, which would make a twelve-point line chart read as
 * the same word twelve times.
 */
export function pointAccessibleLabel(input: {
  pointLabel: string;
  valueText: string;
  seriesLabel?: string | null;
  /** Include only when the chart actually shows proportions. */
  shareText?: string | null;
  /** Marks a comparison overlay, e.g. "previous period". */
  qualifier?: string | null;
}): string {
  const parts: string[] = [];

  if (input.seriesLabel) {
    parts.push(input.seriesLabel);
  }

  parts.push(input.pointLabel);

  const head = parts.join(", ");
  const tail = input.shareText
    ? `${input.valueText} (${input.shareText})`
    : input.valueText;

  const named = `${head}: ${tail}`;

  return input.qualifier ? `${named}, ${input.qualifier}` : named;
}

/**
 * The accessible name for an interactive point.
 *
 * BUG-2149 shipped six links whose accessible name was the word "Open" — six
 * identical entries in a screen reader's link list. A drill-down bar has the
 * same failure mode waiting: forty focusable rects all named "bar". The action
 * verb is prepended to the point's own description so every target in a chart
 * is uniquely and meaningfully named.
 */
export function pointActionAccessibleLabel(
  description: string,
  actionVerb = "View details for",
): string {
  return `${actionVerb} ${description}`;
}

/**
 * A time bucket's axis label, in the tenant's date format where that is
 * meaningful.
 *
 * Day and week buckets go through `formatDate`, so they honour the tenant's
 * configured format. Month and quarter deliberately do not: `formatDate` can
 * only render a whole date, so an August bucket would print as "08/01/2026" and
 * read as the first of the month rather than as the month. The ISO-style token
 * `bucketByPeriod` already produced ("2026-08", "2026-Q3") is unambiguous,
 * locale-free and shorter on a crowded axis.
 */
export function formatTimeBucketLabel(
  bucket: Pick<TimeBucket, "start" | "end" | "label">,
  granularity: ChartGranularity,
  context?: ResolvedFormattingContext | null,
): string {
  if (granularity === "day") {
    return formatDate(bucket.start, context ?? null) || bucket.label;
  }

  if (granularity === "week") {
    const start = formatDate(bucket.start, context ?? null);
    const end = formatDate(bucket.end, context ?? null);
    return start && end ? `${start} - ${end}` : bucket.label;
  }

  return bucket.label;
}

/**
 * A one-line summary of what a chart contains, for the caption beneath it.
 *
 * This does not replace `ariaDescription` — a caller knows what the chart
 * *means* and this only knows its shape — but it gives every chart a consistent
 * factual footer, and it is what the "View as table" toggle is announced
 * against.
 */
export function summarizeChartShape(input: {
  seriesCount: number;
  pointCount: number;
  valueFormat?: ChartValueFormat;
}): string {
  const { seriesCount, pointCount } = input;

  const points = `${pointCount} ${pointCount === 1 ? "data point" : "data points"}`;

  if (seriesCount <= 1) {
    return points;
  }

  return `${seriesCount} series, ${points}`;
}
