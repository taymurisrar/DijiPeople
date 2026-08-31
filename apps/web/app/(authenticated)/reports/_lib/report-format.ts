import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatWorkHours,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import type { ChartValueFormat } from "@/app/components/charts";
import type {
  AnalyticsMetricResult,
  MetricDirection,
  ReportValueFormat,
} from "./reporting-types";

/*
 * Turning a reporting number into words.
 *
 * Every date, number, duration and currency on the reporting surfaces comes
 * through here, and this module's only formatting imports are from
 * `lib/formatting-context.ts`. There is no `Intl`, no `toLocaleString` and no
 * `toLocaleDateString` anywhere under `reports/` — BUG-2010 shipped a dashboard
 * that read the *visiting browser's* locale instead of the tenant's, and a
 * reporting workspace is the surface where that error is most expensive,
 * because the numbers are the product.
 *
 * Plain `.ts` on purpose: `apps/web`'s jest is node-only and matches
 * `*.spec.ts`, so this is reachable by a test and a component is not.
 */

/** What an unmeasured value reads as. Matches the charts and the dashboard. */
export const MISSING_VALUE_TEXT = "-";

/**
 * Duration values arrive in two different units and the API does not say which.
 *
 * `/reporting/catalog` sends a metric's `format` but not its `valueType`, and
 * the server uses `format: "duration"` for both `valueType: "duration_minutes"`
 * (attendance: `attendance.average_worked_minutes`) and `valueType: "integer"`
 * holding seconds (desktop: `desktop.average_active_seconds`). Rendering the
 * second as minutes overstates it sixtyfold.
 *
 * The metric keys are unambiguous where the format is not — the server names
 * the unit in the key and repeats it in the label — so the unit is read from
 * the key. Minutes is the fallback because that is what the server's own export
 * formatter assumes, so screen and export agree on the same wrong guess rather
 * than disagreeing.
 *
 * This is a workaround for a gap in the contract, not a design: if the catalog
 * ever carries `valueType`, delete this and read it.
 */
export function resolveDurationUnit(key: string): "seconds" | "minutes" {
  return /second/i.test(key) ? "seconds" : "minutes";
}

/** Duration values as **hours**, which is the unit every chart primitive draws. */
export function durationToHours(value: number, key: string): number {
  return resolveDurationUnit(key) === "seconds" ? value / 3600 : value / 60;
}

/**
 * The API's presentation format, mapped onto the chart vocabulary.
 *
 * `date` and `datetime` collapse to `"number"` because no chart draws a date as
 * a measured value — a date-formatted *metric* would be a metric of the wrong
 * kind, and the axis labels come from the trend bucket labels regardless.
 */
export function toChartValueFormat(
  format: ReportValueFormat | string | null | undefined,
): ChartValueFormat {
  switch (format) {
    case "currency":
      return "currency";
    case "percent":
      return "percent";
    case "duration":
      return "duration";
    default:
      return "number";
  }
}

/**
 * A raw API value converted into the unit its chart format implies.
 *
 * Only durations move: the charts render `"duration"` as hours through
 * `formatWorkHours`, so minutes and seconds have to arrive already converted or
 * a 480-minute working day draws as 480 hours.
 */
export function toChartValue(
  value: number | null | undefined,
  format: ReportValueFormat | string | null | undefined,
  key: string,
): number {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 0;
  }
  const numeric = Number(value);
  return format === "duration" ? durationToHours(numeric, key) : numeric;
}

/**
 * One reporting number, rendered for a person.
 *
 * `key` is required rather than optional because it is what decides the
 * duration unit — an optional parameter here would be a silent sixtyfold error
 * at every call site that forgot it.
 */
export function formatReportValue(
  value: number | null | undefined,
  format: ReportValueFormat | string | null | undefined,
  key: string,
  options: {
    context?: ResolvedFormattingContext | null;
    currencyCode?: string | null;
  } = {},
): string {
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
      return (
        formatMoney(numeric, options.currencyCode, context) || MISSING_VALUE_TEXT
      );

    case "percent": {
      const rendered = formatNumber(roundTo(numeric, 1), context);
      return rendered ? `${rendered}%` : MISSING_VALUE_TEXT;
    }

    case "duration":
      return (
        formatWorkHours(durationToHours(numeric, key), context) ||
        MISSING_VALUE_TEXT
      );

    default:
      return formatNumber(numeric, context) || MISSING_VALUE_TEXT;
  }
}

/**
 * A cell out of `/reporting/analytics/records` or `/reporting/reports/execute`.
 *
 * Those rows are `Record<string, unknown>` — the engine returns whatever the
 * column holds — so this takes `unknown` and narrows, rather than pretending
 * the caller knows. A `null` is rendered as the missing marker and not as the
 * string "null", and a boolean is rendered as words rather than as "true",
 * which is what a spreadsheet-shaped screen full of `true` looks like.
 */
export function formatRecordCell(
  value: unknown,
  column: { key: string; type?: string; format?: string },
  options: {
    context?: ResolvedFormattingContext | null;
    currencyCode?: string | null;
  } = {},
): string {
  if (value === null || value === undefined || value === "") {
    return MISSING_VALUE_TEXT;
  }

  const context = options.context ?? null;

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (column.format === "date" || column.type === "date") {
    return formatDate(String(value), context) || MISSING_VALUE_TEXT;
  }

  if (column.format === "datetime" || column.type === "datetime") {
    return formatDateTime(String(value), context) || MISSING_VALUE_TEXT;
  }

  if (typeof value === "number") {
    return formatReportValue(value, column.format, column.key, options);
  }

  /*
   * A numeric string is still a number. The engine returns Prisma `Decimal`
   * columns as strings, and rendering "1234.5" unformatted next to a formatted
   * "1,234.5" in the neighbouring column is the sort of inconsistency that
   * makes a report look untrustworthy.
   */
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    const numericFormats = ["currency", "percent", "duration"];
    if (numericFormats.includes(String(column.format))) {
      return formatReportValue(Number(value), column.format, column.key, options);
    }
  }

  if (typeof value === "object") {
    /* Never render "[object Object]" at a user. */
    return MISSING_VALUE_TEXT;
  }

  return String(value);
}

export type DeltaDescription = {
  /** True when there is a comparison at all. */
  present: boolean;
  /** `up`, `down` or `flat`. Drives the arrow glyph. */
  movement: "up" | "down" | "flat";
  /**
   * Whether the movement is good, bad, or not something the product judges.
   *
   * Carried as a *word*, never only as a colour. BUG-2148 shipped severity
   * conveyed by hue alone, and a KPI tile whose only signal of "worse" is a red
   * number is exactly that defect with a different noun.
   */
  judgement: "better" | "worse" | "neutral";
  /** e.g. "+12.4%" — empty when the baseline was zero. */
  percentText: string;
  /** The full sentence, which is also the accessible text. */
  text: string;
};

/**
 * How a metric moved against its comparison period, in words.
 *
 * Three cases the obvious implementation gets wrong:
 *
 * 1. **No comparison selected.** `present: false`, and the tile must say so
 *    rather than draw a 0% that looks like "no change".
 * 2. **A zero baseline.** The API sends `deltaPercent: null` because a
 *    percentage change from zero is undefined; "+100%" and "+∞%" are both lies.
 *    The absolute change is still real and is still shown.
 * 3. **A neutral metric.** Desktop activity metrics are all `neutral` on
 *    purpose. Colouring a fall in "active seconds" red asserts something about
 *    what that number means that the product deliberately does not assert.
 */
export function describeDelta(
  metric: Pick<
    AnalyticsMetricResult,
    "delta" | "deltaPercent" | "direction" | "comparisonValue" | "format" | "key"
  >,
  options: {
    context?: ResolvedFormattingContext | null;
    currencyCode?: string | null;
    comparisonLabel?: string;
  } = {},
): DeltaDescription {
  const comparisonLabel = options.comparisonLabel ?? "the previous period";

  if (metric.delta === null || metric.comparisonValue === null) {
    return {
      present: false,
      movement: "flat",
      judgement: "neutral",
      percentText: "",
      text: `No comparison selected`,
    };
  }

  const movement: DeltaDescription["movement"] =
    metric.delta > 0 ? "up" : metric.delta < 0 ? "down" : "flat";

  const judgement = judgeMovement(movement, metric.direction);

  const percentText =
    metric.deltaPercent === null
      ? ""
      : `${metric.deltaPercent > 0 ? "+" : ""}${
          formatNumber(roundTo(metric.deltaPercent, 1), options.context ?? null) ||
          "0"
        }%`;

  const absoluteText = formatReportValue(
    Math.abs(metric.delta),
    metric.format,
    metric.key,
    options,
  );

  const movementWord =
    movement === "up" ? "Up" : movement === "down" ? "Down" : "Unchanged";

  const judgementSuffix =
    judgement === "neutral" ? "" : judgement === "better" ? " - better" : " - worse";

  if (movement === "flat") {
    return {
      present: true,
      movement,
      judgement: "neutral",
      percentText: percentText || "0%",
      text: `Unchanged vs ${comparisonLabel}`,
    };
  }

  const magnitude = percentText
    ? `${percentText} (${absoluteText})`
    : `${absoluteText} (no percentage - the previous period was zero)`;

  return {
    present: true,
    movement,
    judgement,
    percentText,
    text: `${movementWord} ${magnitude} vs ${comparisonLabel}${judgementSuffix}`,
  };
}

function judgeMovement(
  movement: "up" | "down" | "flat",
  direction: MetricDirection,
): DeltaDescription["judgement"] {
  if (movement === "flat" || direction === "neutral") return "neutral";
  if (direction === "up_is_good") return movement === "up" ? "better" : "worse";
  return movement === "up" ? "worse" : "better";
}

/**
 * `Math.round` to a fixed number of places, without the float noise.
 *
 * `Number(x.toFixed(1))` rather than `Math.round(x * 10) / 10` because the
 * latter turns 1.005 into 1 on a binary float while the former does not, and a
 * percentage that disagrees with itself by a tenth between two screens is the
 * kind of thing that gets a report distrusted wholesale.
 */
function roundTo(value: number, places: number): number {
  return Number(value.toFixed(places));
}

/**
 * The accessible summary of a KPI tile.
 *
 * One string, so a screen reader gets the label, the number, the movement and
 * the judgement in one utterance rather than as four adjacent fragments whose
 * relationship has to be inferred from the visual layout.
 */
export function metricTileAccessibleLabel(
  metric: AnalyticsMetricResult,
  valueText: string,
  delta: DeltaDescription,
): string {
  if (metric.suppressed) {
    return `${metric.label}: withheld because the population is too small to report on`;
  }

  const base = `${metric.label}: ${valueText}`;
  return delta.present ? `${base}. ${delta.text}` : base;
}
