/*
 * The one palette every chart in the Reports & Analytics workspace draws from.
 *
 * Hex literals are confined to this file on purpose. Everywhere else in
 * `apps/web` a colour comes from a design token (`bg-surface`, `text-muted`,
 * `bg-accent`), but a categorical series palette cannot: the tokens describe
 * chrome — surface, border, text, one accent — and a chart needs eight hues that
 * are distinguishable from one another, which is a different problem with a
 * different answer. Series colours are also written into `fill`/`stroke`
 * attributes rather than classes, because an SVG paint server has no Tailwind
 * equivalent. So: one module, eight values, and no colour literal in any
 * component.
 *
 * DUPLICATION TO REMOVE LATER — `app/components/dashboard/dashboard-widget-
 * renderer.tsx` declares its own `CHART_SERIES_COLORS` and `MAX_CHART_SLICES`
 * with the same intent and slightly different values. That file belongs to
 * another work package and is deliberately untouched here; when it is next
 * edited it should import `CHART_SERIES_COLORS`, `MAX_CHART_SLICES` and
 * `otherBucketLabel` from this module and delete its local copies. Two palettes
 * for one idea is exactly the "no duplicate sources of truth" regression
 * AGENTS.md names, and it is being recorded rather than fixed only because the
 * file is out of scope for this stream.
 *
 * Why these eight values.
 *
 * The signed-in shell renders on `--surface` (near-white) in light mode and on
 * `#111827`/`#0f172a` in dark mode — `globals.css` swaps the tokens under
 * `html[data-theme="dark"] .dp-theme-scope`, and a chart drawn once has to stay
 * legible on both. WCAG 1.4.11 wants 3:1 for a graphical object against its
 * background, and a colour cannot clear 3:1 against white *and* against near
 * black unless its relative luminance sits between roughly 0.134 and 0.30.
 * Every value below was chosen inside that band, so the same eight colours are
 * non-decorative-safe in both themes without a per-theme palette.
 *
 * The order is chosen too. Adjacent series are the ones a reader compares, so
 * the first pairs are far apart in hue and survive the common colour-vision
 * deficiencies: blue then amber (the standard deuteranopia-safe pair), then
 * teal, then rose.
 *
 * None of which makes colour sufficient on its own — see BUG-2148. Colour is
 * the fourth cue here, after the series label, the value and the pattern below.
 */

export const CHART_SERIES_COLORS = [
  "#3b82f6", // blue
  "#d97706", // amber
  "#0d9488", // teal
  "#e11d48", // rose
  "#8b5cf6", // violet
  "#16a34a", // green
  "#0284c7", // sky
  "#c026d3", // magenta
] as const;

export type ChartSeriesColor = (typeof CHART_SERIES_COLORS)[number];

/**
 * Colour for the series (or slice) at `index`, wrapping when there are more
 * series than colours. Negative and non-integer indexes are tolerated rather
 * than throwing: a chart is not worth a runtime error.
 */
export function seriesColor(index: number): string {
  if (!Number.isFinite(index)) {
    return CHART_SERIES_COLORS[0];
  }

  const whole = Math.trunc(index);
  const wrapped =
    ((whole % CHART_SERIES_COLORS.length) + CHART_SERIES_COLORS.length) %
    CHART_SERIES_COLORS.length;

  return CHART_SERIES_COLORS[wrapped];
}

/*
 * BUG-2148 — severity was conveyed by colour alone and hidden from assistive
 * technology. The lesson generalises past severity: a reader who cannot
 * separate two hues cannot separate two series either, and printing a report in
 * greyscale has the same effect on everybody.
 *
 * So each series also gets a fill pattern. `ChartPatternDefs` in
 * `chart-chrome.tsx` emits one SVG `<pattern>` per series, and charts that fill
 * an area — bars, donut slices, funnel stages — paint with it instead of with
 * the flat colour. That keeps the colour coding for the readers it serves and
 * adds a shape cue for the readers it does not. Line and sparkline charts use
 * `seriesDashArray` instead, because a hatch inside a 2px stroke is invisible.
 *
 * The geometries below are *names*, not ids: the ids are namespaced per chart
 * instance with `useId`, because two charts on one page emitting the same
 * `<pattern id>` is a duplicate-id defect and the second chart's fills would
 * silently resolve to the first chart's colours.
 */
export const CHART_PATTERN_GEOMETRIES = [
  "solid",
  "diagonal",
  "dots",
  "grid",
  "diagonal-back",
  "horizontal",
  "vertical",
  "cross",
] as const;

export type ChartPatternGeometry = (typeof CHART_PATTERN_GEOMETRIES)[number];

export function seriesPatternGeometry(index: number): ChartPatternGeometry {
  if (!Number.isFinite(index)) {
    return CHART_PATTERN_GEOMETRIES[0];
  }

  const whole = Math.trunc(index);
  const wrapped =
    ((whole % CHART_PATTERN_GEOMETRIES.length) +
      CHART_PATTERN_GEOMETRIES.length) %
    CHART_PATTERN_GEOMETRIES.length;

  return CHART_PATTERN_GEOMETRIES[wrapped];
}

/**
 * Stroke dash pattern for the series at `index`. The first series is solid;
 * the rest are distinguishable by dash rhythm as well as by hue, which is what
 * makes a two-line comparison chart readable in greyscale.
 */
const SERIES_DASH_ARRAYS = [
  "",
  "6 4",
  "2 3",
  "10 4",
  "6 3 2 3",
  "1 4",
  "12 5",
  "4 2 1 2",
] as const;

export function seriesDashArray(index: number): string | undefined {
  if (!Number.isFinite(index)) {
    return undefined;
  }

  const whole = Math.trunc(index);
  const wrapped =
    ((whole % SERIES_DASH_ARRAYS.length) + SERIES_DASH_ARRAYS.length) %
    SERIES_DASH_ARRAYS.length;

  return SERIES_DASH_ARRAYS[wrapped] || undefined;
}

/*
 * Beyond seven slices a ranked proportion chart stops ranking anything: the
 * tail is a row of indistinguishable slivers and the legend is longer than the
 * chart. The tail is summed into one "Other" bucket rather than dropped, so the
 * segments still add up to the total printed above them — dropping it produces
 * a chart whose parts do not sum to its own stated whole, which is worse than
 * showing less.
 */
export const MAX_CHART_SLICES = 7;

/** Reserved key for the rolled-up tail. Never collides with a real record id. */
export const OTHER_BUCKET_KEY = "__other__";

/**
 * The bucket's label carries the count, because "Other" alone hides whether the
 * reader is looking at two rolled-up rows or two hundred.
 */
export function otherBucketLabel(collapsedCount: number): string {
  const safeCount =
    Number.isFinite(collapsedCount) && collapsedCount > 0
      ? Math.trunc(collapsedCount)
      : 0;

  return `Other (${safeCount})`;
}

/**
 * A slice worth 0.04% of the total is worth nothing at all on screen, but a
 * zero-width bar reads as missing data rather than as a small value. Charts
 * draw at least this percentage so every present category is visible.
 *
 * Drawing-only: shares floored this way no longer sum to 100, which is why
 * `computeShares` keeps the honest number and the drawn number apart.
 */
export const MIN_VISIBLE_SHARE_PERCENT = 1.5;

/*
 * Axis, gridline and baseline strokes. These are not series colours — they are
 * chrome — so they follow the theme through `currentColor` and opacity rather
 * than through a hex. A component sets `text-muted` on the SVG (or a group) and
 * uses these as `stroke="currentColor"` with the opacity below, which means the
 * dark-mode swap in `globals.css` reaches them for free.
 */
export const CHART_GRID_OPACITY = 0.18;
export const CHART_AXIS_OPACITY = 0.42;

/**
 * The hatch drawn over a series colour to give it a shape as well as a hue.
 *
 * A translucent white reads as a lightening on every one of the eight palette
 * colours and in both themes, which a second opaque colour would not. Declared
 * here with the palette because it is the only other colour literal the chart
 * layer is allowed.
 */
export const CHART_PATTERN_OVERLAY = "rgba(255, 255, 255, 0.55)";
