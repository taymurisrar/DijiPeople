import type { ChartGranularity, ChartPoint, ChartSeries } from "./chart-types";
import {
  MAX_CHART_SLICES,
  MIN_VISIBLE_SHARE_PERCENT,
  OTHER_BUCKET_KEY,
  otherBucketLabel,
} from "./chart-tokens";

/*
 * Every calculation a chart in this directory performs, with no React in sight.
 *
 * This split is forced by the test runner and is the better shape anyway.
 * `apps/web/jest.config.js` is `testEnvironment: "node"` and matches
 * `**\/*.spec.ts` only — no jsdom, no testing-library, and `.spec.tsx` is not
 * even collected. A component here is therefore untestable by construction, so
 * anything that can be got wrong lives in this file and the components are thin
 * enough to read in one screen. It is the same move
 * `dashboard-widget-renderer.tsx` makes when it exports `formatValue` so
 * `dashboard-widget-formatting.spec.ts` can reach it, applied to a whole module
 * rather than one function.
 *
 * Two rules hold throughout:
 *
 * 1. Nothing here formats a number or a date for a human. Formatting reads the
 *    tenant's settings and belongs to `chart-format.ts`; the labels produced
 *    below are locale-free tokens ("2026-Q3"), never rendered prose.
 * 2. Nothing here throws. A chart is a read-only summary, and a division by
 *    zero in one of these functions would take down the page that embeds it.
 *    Degenerate input — empty, all zero, flat, negative, non-finite — returns a
 *    degenerate but drawable result. Every one of those cases is a test below.
 */

export type Point2D = { x: number; y: number };

export type ScaleFn = (value: number) => number;

export type LinearScale = ScaleFn & {
  domain: readonly [number, number];
  range: readonly [number, number];
  invert: (position: number) => number;
};

/** Coordinates are rounded before they reach a path string. */
const PATH_PRECISION = 3;

function roundCoordinate(value: number): number {
  const factor = 10 ** PATH_PRECISION;
  return Math.round(value * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/* ------------------------------------------------------------------ scales */

/**
 * A linear mapping from a data domain onto a pixel range.
 *
 * The degenerate case is the one that matters. When `domain[0] === domain[1]` —
 * a flat series, a single point, a day where every value was 47 — the naive
 * `(value - d0) / (d1 - d0)` divides by zero and every coordinate becomes
 * `NaN`, which SVG renders as *nothing*. A flat series is a completely ordinary
 * thing to chart and it must draw as a straight line through the middle of the
 * plot, so a zero-width domain maps everything to the midpoint of the range.
 */
export function linearScale({
  domain,
  range,
  clamp = false,
}: {
  domain: readonly [number, number];
  range: readonly [number, number];
  clamp?: boolean;
}): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;

  const domainValid = isFiniteNumber(d0) && isFiniteNumber(d1);
  const rangeValid = isFiniteNumber(r0) && isFiniteNumber(r1);

  const safeR0 = rangeValid ? r0 : 0;
  const safeR1 = rangeValid ? r1 : 0;
  const midpoint = (safeR0 + safeR1) / 2;

  const span = domainValid ? d1 - d0 : 0;
  const isFlat = span === 0;

  const scale = ((value: number): number => {
    if (!isFiniteNumber(value) || !domainValid) {
      return midpoint;
    }

    if (isFlat) {
      return midpoint;
    }

    const ratio = (value - d0) / span;
    const bounded = clamp ? Math.min(1, Math.max(0, ratio)) : ratio;

    return safeR0 + bounded * (safeR1 - safeR0);
  }) as LinearScale;

  scale.domain = domainValid ? [d0, d1] : [0, 0];
  scale.range = [safeR0, safeR1];
  scale.invert = (position: number): number => {
    if (!isFiniteNumber(position) || !domainValid) {
      return domainValid ? d0 : 0;
    }

    const rangeSpan = safeR1 - safeR0;
    if (rangeSpan === 0 || isFlat) {
      return d0;
    }

    return d0 + ((position - safeR0) / rangeSpan) * span;
  };

  return scale;
}

/**
 * Round `range` to a "nice" magnitude — 1, 2, 5 or 10 times a power of ten.
 * `round: false` always rounds up (used to widen the overall extent);
 * `round: true` picks the nearest (used to choose a step).
 */
function niceNumber(range: number, round: boolean): number {
  if (!isFiniteNumber(range) || range <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;

  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

/**
 * Axis ticks a person would have chosen: round steps, covering `[min, max]`,
 * roughly `count` of them.
 *
 * "Roughly" is honest — the returned length is usually `count` or `count + 1`
 * and is never forced, because forcing an exact count is what produces axes
 * labelled 0, 23.75, 47.5, 71.25, 95. The step is always a 1/2/5 multiple of a
 * power of ten, so the labels stay readable at any magnitude.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    return [];
  }

  const lower = Math.min(min, max);
  const upper = Math.max(min, max);

  /*
   * A flat extent has exactly one interesting value and no interval to divide.
   * One tick is the truthful answer; inventing a span around it would label the
   * axis with numbers the data never contained.
   */
  if (lower === upper) {
    return [lower];
  }

  const requested = Number.isFinite(count) ? Math.max(2, Math.trunc(count)) : 5;
  const extent = niceNumber(upper - lower, false);
  const step = niceNumber(extent / (requested - 1), true);

  if (step <= 0) {
    return [lower, upper];
  }

  const niceMin = Math.floor(lower / step) * step;
  const niceMax = Math.ceil(upper / step) * step;

  /*
   * Repeated addition of 0.1 reaches 0.30000000000000004, which then prints as
   * an axis label. The step's own magnitude tells us how many decimals are
   * meaningful, so each tick is rounded to exactly that.
   */
  const decimals = Math.max(0, Math.min(20, -Math.floor(Math.log10(step))));
  const ticks: number[] = [];

  /* A hard ceiling: no axis is worth an unbounded loop on absurd input. */
  const maxTicks = 1000;
  for (let index = 0; index <= maxTicks; index += 1) {
    const raw = niceMin + index * step;
    ticks.push(Number(raw.toFixed(decimals)));

    if (raw >= niceMax - step / 1e9) {
      break;
    }
  }

  return ticks;
}

export type ChartMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The drawable rectangle inside a viewBox once axis gutters are removed.
 * Never returns a negative width or height — a margin pair wider than the box
 * collapses the plot to zero rather than inverting it.
 */
export function resolvePlotArea(
  width: number,
  height: number,
  margins: ChartMargins,
): PlotArea {
  const safeWidth = isFiniteNumber(width) ? width : 0;
  const safeHeight = isFiniteNumber(height) ? height : 0;

  return {
    x: margins.left,
    y: margins.top,
    width: Math.max(0, safeWidth - margins.left - margins.right),
    height: Math.max(0, safeHeight - margins.top - margins.bottom),
  };
}

/* ------------------------------------------------------------ time buckets */

export type TimeSeriesPoint = {
  /** `yyyy-MM-dd`, or any ISO-8601 string whose first ten characters are one. */
  date: string;
  value: number;
};

export type TimeBucket = {
  key: string;
  /**
   * A locale-free token, not display prose: `2026-08-31`, `2026-08-30/2026-09-05`,
   * `2026-08`, `2026-Q3`. Components that want the tenant's date format run
   * `formatDate(bucket.start)`; nothing in this module may format for a human.
   */
  label: string;
  /** Inclusive `yyyy-MM-dd`. */
  start: string;
  /** Inclusive `yyyy-MM-dd`. */
  end: string;
  value: number;
  count: number;
};

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

type CivilDate = { year: number; month: number; day: number };

/**
 * Read the calendar date out of an ISO string *without* constructing a local
 * `Date`, which would shift the day either side of midnight depending on where
 * the server happens to be. Timezone resolution is the caller's job — see
 * `components/filters/period.ts`, which converts an instant to a tenant-local
 * civil date before any of this runs.
 */
function parseCivilDate(value: string): CivilDate | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = ISO_DATE_PREFIX.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  /* Rejects 2026-02-30 and friends: the round trip changes the day. */
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: CivilDate): string {
  return `${String(date.year).padStart(4, "0")}-${pad2(date.month)}-${pad2(date.day)}`;
}

function addDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dayOfWeek(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `weekStartsOn` is a parameter and not a constant on purpose. This product's
 * default weekend is **Friday/Saturday**, so the working week starts on Sunday
 * (`0`) and not on Monday — and a tenant may configure something else again.
 * Hard-coding Monday here would silently mis-bucket every weekly attendance
 * chart in the default configuration.
 */
export const DEFAULT_WEEK_STARTS_ON = 0;

function bucketStartFor(
  date: CivilDate,
  granularity: ChartGranularity,
  weekStartsOn: number,
): CivilDate {
  if (granularity === "day") {
    return date;
  }

  if (granularity === "week") {
    const normalizedStart = ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
    const offset = (dayOfWeek(date) - normalizedStart + 7) % 7;
    return addDays(date, -offset);
  }

  if (granularity === "month") {
    return { year: date.year, month: date.month, day: 1 };
  }

  const quarterStartMonth = Math.floor((date.month - 1) / 3) * 3 + 1;
  return { year: date.year, month: quarterStartMonth, day: 1 };
}

function bucketEndFor(
  start: CivilDate,
  granularity: ChartGranularity,
): CivilDate {
  if (granularity === "day") {
    return start;
  }

  if (granularity === "week") {
    return addDays(start, 6);
  }

  if (granularity === "month") {
    return {
      year: start.year,
      month: start.month,
      day: daysInMonth(start.year, start.month),
    };
  }

  const endMonth = start.month + 2;
  return {
    year: start.year,
    month: endMonth,
    day: daysInMonth(start.year, endMonth),
  };
}

function bucketLabelFor(
  start: CivilDate,
  end: CivilDate,
  granularity: ChartGranularity,
): string {
  if (granularity === "day") {
    return toIso(start);
  }

  if (granularity === "week") {
    return `${toIso(start)}/${toIso(end)}`;
  }

  if (granularity === "month") {
    return `${String(start.year).padStart(4, "0")}-${pad2(start.month)}`;
  }

  return `${start.year}-Q${Math.floor((start.month - 1) / 3) + 1}`;
}

function nextBucketStart(
  start: CivilDate,
  granularity: ChartGranularity,
): CivilDate {
  if (granularity === "day") {
    return addDays(start, 1);
  }

  if (granularity === "week") {
    return addDays(start, 7);
  }

  const monthStep = granularity === "month" ? 1 : 3;
  const shifted = new Date(
    Date.UTC(start.year, start.month - 1 + monthStep, 1),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: 1,
  };
}

/**
 * Group dated measurements into calendar buckets, summing each bucket.
 *
 * Unparseable dates and non-finite values are dropped rather than poisoning a
 * whole series with `NaN`; the survivors still chart. Output is always sorted
 * ascending by `start`, whatever order the input arrived in — an API that
 * returns newest-first would otherwise draw a line running backwards.
 *
 * `fillGaps` inserts zero-valued buckets for calendar periods with no data. It
 * is off by default because the correct reading is domain-specific: a week with
 * no payroll runs really is zero, but a week with no recorded headcount is
 * unknown, and drawing that as a plunge to zero is a lie.
 */
export function bucketByPeriod(
  points: readonly TimeSeriesPoint[] | null | undefined,
  granularity: ChartGranularity,
  options: { weekStartsOn?: number; fillGaps?: boolean } = {},
): TimeBucket[] {
  if (!points || points.length === 0) {
    return [];
  }

  const weekStartsOn = options.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
  const buckets = new Map<string, TimeBucket>();

  for (const point of points) {
    const civil = parseCivilDate(point?.date);
    if (!civil) {
      continue;
    }

    const value = Number(point.value);
    if (!Number.isFinite(value)) {
      continue;
    }

    const start = bucketStartFor(civil, granularity, weekStartsOn);
    const key = toIso(start);
    const existing = buckets.get(key);

    if (existing) {
      existing.value += value;
      existing.count += 1;
      continue;
    }

    const end = bucketEndFor(start, granularity);
    buckets.set(key, {
      key,
      label: bucketLabelFor(start, end, granularity),
      start: key,
      end: toIso(end),
      value,
      count: 1,
    });
  }

  const ordered = [...buckets.values()].sort((left, right) =>
    left.start < right.start ? -1 : left.start > right.start ? 1 : 0,
  );

  if (!options.fillGaps || ordered.length < 2) {
    return ordered;
  }

  const filled: TimeBucket[] = [];
  const lastStart = ordered[ordered.length - 1].start;
  let cursor = parseCivilDate(ordered[0].start);
  let index = 0;

  /* Bounded so a malformed cursor can never spin: ~27 years of daily buckets. */
  for (let guard = 0; guard < 10000 && cursor; guard += 1) {
    const cursorIso = toIso(cursor);
    const existing = ordered[index];

    if (existing && existing.start === cursorIso) {
      filled.push(existing);
      index += 1;
    } else {
      const end = bucketEndFor(cursor, granularity);
      filled.push({
        key: cursorIso,
        label: bucketLabelFor(cursor, end, granularity),
        start: cursorIso,
        end: toIso(end),
        value: 0,
        count: 0,
      });
    }

    if (cursorIso >= lastStart) {
      break;
    }

    cursor = nextBucketStart(cursor, granularity);
  }

  return filled;
}

/* ------------------------------------------------------------------- paths */

/**
 * An SVG `d` for a polyline through `points`, in data space, mapped by the
 * given scales.
 *
 * A point whose value is non-finite is a *gap*, not a zero — an attendance rate
 * for a day the office was shut is missing, and joining across it invents a
 * measurement. Each contiguous run therefore starts a fresh `M` subpath, so the
 * line visibly breaks instead of quietly interpolating.
 */
export function buildLinePath(
  points: readonly Point2D[] | null | undefined,
  xScale: ScaleFn,
  yScale: ScaleFn,
): string {
  if (!points || points.length === 0) {
    return "";
  }

  const commands: string[] = [];
  let penDown = false;

  for (const point of points) {
    if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      penDown = false;
      continue;
    }

    const x = roundCoordinate(xScale(point.x));
    const y = roundCoordinate(yScale(point.y));

    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      penDown = false;
      continue;
    }

    commands.push(`${penDown ? "L" : "M"} ${x} ${y}`);
    penDown = true;
  }

  return commands.join(" ");
}

/**
 * The same shape, closed down to a baseline so it can be filled.
 *
 * Each contiguous run is closed independently for the same reason
 * `buildLinePath` breaks it: a single filled polygon spanning a gap would
 * shade an area under data that does not exist.
 */
export function buildAreaPath(
  points: readonly Point2D[] | null | undefined,
  xScale: ScaleFn,
  yScale: ScaleFn,
  options: { baselineValue?: number } = {},
): string {
  if (!points || points.length === 0) {
    return "";
  }

  const baseline = roundCoordinate(yScale(options.baselineValue ?? 0));
  if (!isFiniteNumber(baseline)) {
    return "";
  }

  const runs: Point2D[][] = [];
  let current: Point2D[] = [];

  for (const point of points) {
    if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      if (current.length) {
        runs.push(current);
        current = [];
      }
      continue;
    }

    const x = roundCoordinate(xScale(point.x));
    const y = roundCoordinate(yScale(point.y));

    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      if (current.length) {
        runs.push(current);
        current = [];
      }
      continue;
    }

    current.push({ x, y });
  }

  if (current.length) {
    runs.push(current);
  }

  return runs
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      const line = run.map((point) => `L ${point.x} ${point.y}`).join(" ");

      return `M ${first.x} ${baseline} ${line} L ${last.x} ${baseline} Z`;
    })
    .join(" ");
}

/* ------------------------------------------------------------------ stacks */

export type StackedSegment = {
  seriesKey: string;
  seriesLabel: string;
  seriesIndex: number;
  pointKey: string;
  pointLabel: string;
  value: number;
  /** Cumulative lower bound, in data space. */
  start: number;
  /** Cumulative upper bound, in data space. */
  end: number;
};

export type StackedColumn = {
  key: string;
  label: string;
  segments: StackedSegment[];
  /** Signed sum of every segment. */
  total: number;
  positiveTotal: number;
  negativeTotal: number;
};

/**
 * Turn parallel series into cumulative segments, one column per point key.
 *
 * Columns appear in the order their keys are first seen across the series, so a
 * series that happens to be missing the first category does not reorder the
 * axis. A point absent from a series contributes nothing rather than breaking
 * the stack.
 *
 * Negatives stack *downward from zero* while positives stack upward, which is
 * the only arrangement where the column still reads as a sum. Adding a −5 on
 * top of a +12 as if it were +5 of height — the naive cumulative total — draws a
 * taller bar for a smaller number.
 */
export function stackSeries(
  series: readonly ChartSeries[] | null | undefined,
): StackedColumn[] {
  if (!series || series.length === 0) {
    return [];
  }

  const columns = new Map<string, StackedColumn>();

  for (const entry of series) {
    for (const point of entry?.points ?? []) {
      if (!point || columns.has(point.key)) {
        continue;
      }

      columns.set(point.key, {
        key: point.key,
        label: point.label,
        segments: [],
        total: 0,
        positiveTotal: 0,
        negativeTotal: 0,
      });
    }
  }

  series.forEach((entry, seriesIndex) => {
    if (!entry) {
      return;
    }

    for (const point of entry.points ?? []) {
      const column = point ? columns.get(point.key) : undefined;
      if (!column || !point) {
        continue;
      }

      const value = Number(point.value);
      if (!Number.isFinite(value)) {
        continue;
      }

      const start = value >= 0 ? column.positiveTotal : column.negativeTotal;
      const end = start + value;

      if (value >= 0) {
        column.positiveTotal = end;
      } else {
        column.negativeTotal = end;
      }

      column.total += value;
      column.segments.push({
        seriesKey: entry.key,
        seriesLabel: entry.label,
        seriesIndex,
        pointKey: point.key,
        pointLabel: point.label,
        value,
        start,
        end,
      });
    }
  });

  return [...columns.values()];
}

/**
 * The `[min, max]` a stacked chart's value axis must cover. Always includes
 * zero — a stacked bar measured from a non-zero baseline misstates every
 * proportion in it.
 */
export function stackedExtent(columns: readonly StackedColumn[]): [number, number] {
  let min = 0;
  let max = 0;

  for (const column of columns) {
    min = Math.min(min, column.negativeTotal);
    max = Math.max(max, column.positiveTotal);
  }

  return [min, max];
}

/* ------------------------------------------------------- ranked proportions */

export type CollapsedPoint = ChartPoint & {
  /** `true` only for the rolled-up tail. */
  isOther: boolean;
  /** How many original items this entry represents. `1` for a real one. */
  collapsedCount: number;
};

/**
 * Sort descending and roll everything past the first `limit` into one bucket.
 *
 * The tail is summed, never dropped: the surviving entries must still add up to
 * the total the chart prints above them, or the reader is looking at a whole
 * that does not equal the sum of its parts.
 *
 * Ties keep their original relative order. That matters more than it looks —
 * an unstable sort makes a chart of six equal values reshuffle itself on every
 * render, which reads as live data changing when nothing has.
 */
export function collapseToTopN(
  items: readonly ChartPoint[] | null | undefined,
  limit: number = MAX_CHART_SLICES,
): CollapsedPoint[] {
  if (!items || items.length === 0) {
    return [];
  }

  const usable = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && Number.isFinite(Number(item.value)));

  const sorted = usable
    .slice()
    .sort((left, right) => {
      const delta = Number(right.item.value) - Number(left.item.value);
      return delta !== 0 ? delta : left.index - right.index;
    })
    .map(({ item }) => item);

  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : MAX_CHART_SLICES;

  if (sorted.length <= safeLimit) {
    return sorted.map((item) => ({
      ...item,
      value: Number(item.value),
      isOther: false,
      collapsedCount: 1,
    }));
  }

  const head = sorted.slice(0, safeLimit);
  const tail = sorted.slice(safeLimit);

  return [
    ...head.map((item) => ({
      ...item,
      value: Number(item.value),
      isOther: false,
      collapsedCount: 1,
    })),
    {
      key: OTHER_BUCKET_KEY,
      label: otherBucketLabel(tail.length),
      value: tail.reduce((sum, item) => sum + Number(item.value), 0),
      isOther: true,
      collapsedCount: tail.length,
    },
  ];
}

export type ShareItem = ChartPoint & {
  /** Exact percentage of the total. Unrounded. */
  share: number;
  /**
   * Rounded percentage, apportioned so the column sums to exactly 100.
   * This is the number to print.
   */
  displayShare: number;
  /**
   * Percentage to *draw*, floored at `MIN_VISIBLE_SHARE_PERCENT`. Does not sum
   * to 100 and must never be printed — see the note on the function.
   */
  visibleShare: number;
};

/**
 * Percentage shares that add up.
 *
 * Rounding each share independently is the classic defect: three thirds render
 * as 33.3% three times and the reader is told the whole is 99.9%. `displayShare`
 * uses largest-remainder apportionment instead — floor everything, then hand the
 * leftover units to the entries with the largest discarded fractions — so the
 * printed column sums to exactly 100 whatever the precision.
 *
 * `visibleShare` is separate and deliberately dishonest by up to
 * `MIN_VISIBLE_SHARE_PERCENT`: a 0.04% category drawn at 0.04% of the width is
 * invisible, and an invisible bar reads as absent data rather than as a small
 * number. It exists to be passed to a `width`, never to a label.
 *
 * Negative values get a share of zero and are excluded from the denominator. A
 * proportion of a whole is not defined for a part that subtracts from it, and
 * quietly taking the absolute value would draw a −20 as if it were a +20.
 */
export function computeShares(
  items: readonly ChartPoint[] | null | undefined,
  options: { precision?: number; minVisibleShare?: number } = {},
): ShareItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  const precision =
    Number.isFinite(options.precision) && (options.precision as number) >= 0
      ? Math.min(6, Math.trunc(options.precision as number))
      : 1;
  const minVisibleShare = options.minVisibleShare ?? MIN_VISIBLE_SHARE_PERCENT;

  const values = items.map((item) => {
    const raw = Number(item?.value);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });

  const total = values.reduce((sum, value) => sum + value, 0);

  /*
   * A zero (or wholly negative) total has no shares to apportion. Returning
   * zeroes is the only truthful answer; forcing them to sum to 100 would
   * invent a distribution out of nothing.
   */
  if (total <= 0) {
    return items.map((item) => ({
      ...item,
      value: Number(item?.value) || 0,
      share: 0,
      displayShare: 0,
      visibleShare: 0,
    }));
  }

  const unitsPerPercent = 10 ** precision;
  const totalUnits = Math.round(100 * unitsPerPercent);

  const exactUnits = values.map((value) => (value / total) * totalUnits);
  const flooredUnits = exactUnits.map((units) => Math.floor(units));
  const distributed = flooredUnits.reduce((sum, units) => sum + units, 0);

  let remainder = totalUnits - distributed;
  const order = exactUnits
    .map((units, index) => ({ index, fraction: units - Math.floor(units) }))
    .sort((left, right) => {
      const delta = right.fraction - left.fraction;
      if (delta !== 0) return delta;
      /* Tie broken by size, then by position, so the result is deterministic. */
      const bySize = values[right.index] - values[left.index];
      return bySize !== 0 ? bySize : left.index - right.index;
    });

  const finalUnits = flooredUnits.slice();
  for (const entry of order) {
    if (remainder <= 0) break;
    /* Never hand a rounding unit to a category that measured nothing. */
    if (values[entry.index] <= 0) continue;
    finalUnits[entry.index] += 1;
    remainder -= 1;
  }

  return items.map((item, index) => {
    const share = (values[index] / total) * 100;

    return {
      ...item,
      value: Number(item?.value) || 0,
      share,
      displayShare: finalUnits[index] / unitsPerPercent,
      visibleShare: values[index] > 0 ? Math.max(minVisibleShare, share) : 0,
    };
  });
}

/* ------------------------------------------------------------------ funnel */

export type FunnelStage = ChartPoint & {
  /** `0..1`, relative to the first stage. Clamped so a bar cannot overflow. */
  widthRatio: number;
  /** Percentage of the preceding stage. `null` for the first stage. */
  conversionFromPrevious: number | null;
  /** Percentage of the first stage. `null` when the first stage is zero. */
  conversionFromStart: number | null;
  /** Absolute loss against the preceding stage. `0` for the first. */
  dropOff: number;
  /** Percentage lost against the preceding stage. `null` for the first. */
  dropOffRate: number | null;
};

/**
 * Per-stage width and step-to-step conversion for a funnel.
 *
 * Stages are taken in the order given — a funnel's order is its meaning, so
 * sorting it would destroy the thing being measured, even when a later stage is
 * larger than an earlier one.
 *
 * Which happens, and is the interesting case. Real recruitment data produces
 * stages that grow (a re-opened requisition, a candidate re-entering the
 * pipeline, a backfilled count). `widthRatio` is clamped to 1 so the drawing
 * stays inside the chart, but `conversionFromPrevious` is left above 100 — the
 * anomaly is the finding, and rounding it away would hide it.
 */
export function funnelStages(
  stages: readonly ChartPoint[] | null | undefined,
): FunnelStage[] {
  if (!stages || stages.length === 0) {
    return [];
  }

  const values = stages.map((stage) => {
    const raw = Number(stage?.value);
    return Number.isFinite(raw) ? raw : 0;
  });

  /* Geometry uses the clamped value; the reported `value` stays as measured. */
  const drawable = values.map((value) => Math.max(0, value));
  const first = drawable[0];

  return stages.map((stage, index) => {
    const value = values[index];
    const previous = index === 0 ? null : drawable[index - 1];

    const widthRatio = first > 0 ? Math.min(1, drawable[index] / first) : 0;

    const conversionFromPrevious =
      previous === null || previous <= 0
        ? null
        : (drawable[index] / previous) * 100;

    const conversionFromStart =
      first > 0 ? (drawable[index] / first) * 100 : null;

    const dropOff = previous === null ? 0 : previous - drawable[index];

    const dropOffRate =
      previous === null || previous <= 0 ? null : (dropOff / previous) * 100;

    return {
      ...stage,
      value,
      widthRatio,
      conversionFromPrevious,
      conversionFromStart,
      dropOff,
      dropOffRate,
    };
  });
}

/* ------------------------------------------------------------------- donut */

export type DonutArc = ChartPoint & {
  share: number;
  /** Radians, `0` at twelve o'clock, increasing clockwise. */
  startAngle: number;
  endAngle: number;
  /** `""` when the slice has no angular width. */
  path: string;
  /** Mid-ring midpoint of the slice — where a label or leader line attaches. */
  centroid: Point2D;
};

const TAU = Math.PI * 2;

/**
 * Polar to Cartesian in SVG's coordinate space: `y` grows downward, so a
 * clockwise sweep from twelve o'clock is `(cx + r·sin a, cy − r·cos a)`.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): Point2D {
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  };
}

function annulusPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) {
    return "";
  }

  /*
   * A slice covering the whole circle cannot be one arc: with identical start
   * and end coordinates, SVG draws nothing at all. A sole category — one
   * department, one status — is the commonest donut there is, so the full ring
   * is drawn as two half sweeps.
   */
  if (sweep >= TAU - 1e-9) {
    const mid = startAngle + Math.PI;
    const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
    const outerMid = polarToCartesian(cx, cy, outerRadius, mid);
    const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
    const innerMid = polarToCartesian(cx, cy, innerRadius, mid);

    return [
      `M ${roundCoordinate(outerStart.x)} ${roundCoordinate(outerStart.y)}`,
      `A ${roundCoordinate(outerRadius)} ${roundCoordinate(outerRadius)} 0 0 1 ${roundCoordinate(outerMid.x)} ${roundCoordinate(outerMid.y)}`,
      `A ${roundCoordinate(outerRadius)} ${roundCoordinate(outerRadius)} 0 0 1 ${roundCoordinate(outerStart.x)} ${roundCoordinate(outerStart.y)}`,
      `M ${roundCoordinate(innerStart.x)} ${roundCoordinate(innerStart.y)}`,
      `A ${roundCoordinate(innerRadius)} ${roundCoordinate(innerRadius)} 0 0 0 ${roundCoordinate(innerMid.x)} ${roundCoordinate(innerMid.y)}`,
      `A ${roundCoordinate(innerRadius)} ${roundCoordinate(innerRadius)} 0 0 0 ${roundCoordinate(innerStart.x)} ${roundCoordinate(innerStart.y)}`,
      "Z",
    ].join(" ");
  }

  const largeArc = sweep > Math.PI ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);

  return [
    `M ${roundCoordinate(outerStart.x)} ${roundCoordinate(outerStart.y)}`,
    `A ${roundCoordinate(outerRadius)} ${roundCoordinate(outerRadius)} 0 ${largeArc} 1 ${roundCoordinate(outerEnd.x)} ${roundCoordinate(outerEnd.y)}`,
    `L ${roundCoordinate(innerEnd.x)} ${roundCoordinate(innerEnd.y)}`,
    `A ${roundCoordinate(innerRadius)} ${roundCoordinate(innerRadius)} 0 ${largeArc} 0 ${roundCoordinate(innerStart.x)} ${roundCoordinate(innerStart.y)}`,
    "Z",
  ].join(" ");
}

/**
 * Arc paths for a donut, in input order.
 *
 * Zero-valued categories are kept — with a zero sweep and an empty `path` — so
 * they still reach the legend and the table representation. Silently dropping
 * them would make "0 employees on unpaid leave" indistinguishable from "we do
 * not track unpaid leave", which is exactly the distinction a reader is trying
 * to make.
 */
export function donutArcs(
  items: readonly ChartPoint[] | null | undefined,
  options: {
    innerRadius: number;
    outerRadius: number;
    cx?: number;
    cy?: number;
    /** Radians. Default `0` — twelve o'clock. */
    startAngle?: number;
    /** Radians of separation between slices. Default `0`. */
    padAngle?: number;
  },
): DonutArc[] {
  if (!items || items.length === 0) {
    return [];
  }

  const cx = options.cx ?? 0;
  const cy = options.cy ?? 0;
  const innerRadius = Math.max(0, options.innerRadius);
  const outerRadius = Math.max(innerRadius, options.outerRadius);
  const padAngle = Math.max(0, options.padAngle ?? 0);

  const values = items.map((item) => {
    const raw = Number(item?.value);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);

  let cursor = options.startAngle ?? 0;

  return items.map((item, index) => {
    const share = total > 0 ? (values[index] / total) * 100 : 0;
    const fullSweep = total > 0 ? (values[index] / total) * TAU : 0;

    const startAngle = cursor;
    /* The gap is never allowed to consume the slice it separates. */
    const paddedSweep =
      fullSweep > 0 ? Math.max(0, fullSweep - Math.min(padAngle, fullSweep / 2)) : 0;
    const endAngle = startAngle + paddedSweep;

    cursor += fullSweep;

    const midAngle = startAngle + paddedSweep / 2;
    const centroid = polarToCartesian(
      cx,
      cy,
      (innerRadius + outerRadius) / 2,
      midAngle,
    );

    return {
      ...item,
      value: Number(item?.value) || 0,
      share,
      startAngle,
      endAngle,
      path:
        paddedSweep > 0
          ? annulusPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle)
          : "",
      centroid: {
        x: roundCoordinate(centroid.x),
        y: roundCoordinate(centroid.y),
      },
    };
  });
}

/* ------------------------------------------------------------------ extent */

/**
 * The `[min, max]` across every point of every series, always including zero.
 *
 * Zero is forced in because a value axis that starts at 94 makes a 1% variation
 * look like a collapse. Charts that genuinely need a non-zero baseline pass
 * their own domain.
 */
export function seriesExtent(
  series: readonly ChartSeries[] | null | undefined,
): [number, number] {
  /* Seeded at zero rather than at ±Infinity, which is what forces zero in. */
  let min = 0;
  let max = 0;

  for (const entry of series ?? []) {
    for (const point of entry?.points ?? []) {
      const value = Number(point?.value);
      if (!Number.isFinite(value)) continue;

      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  return [min, max];
}
