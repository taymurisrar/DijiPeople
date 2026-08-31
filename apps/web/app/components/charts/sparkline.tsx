"use client";

import * as React from "react";
import {
  buildAreaPath,
  buildLinePath,
  linearScale,
  seriesExtent,
} from "./chart-geometry";
import { formatChartValue } from "./chart-format";
import { seriesColor } from "./chart-tokens";
import { hasChartData, type ChartSeries, type ChartValueFormat } from "./chart-types";

/*
 * A trend at the size of a word.
 *
 * Deliberately not a `BaseChartProps` component. A sparkline sits inside a KPI
 * tile or a table cell where it is one glyph among several, and the shared
 * props would force wrong answers on it: it has no legend, no axis, no drill-
 * down, and a "View as table" toggle inside a table cell is absurd.
 *
 * What it does keep is the rule the required `ariaDescription` exists to
 * enforce. A sparkline says something — "trending down over 30 days" — and
 * BUG-2148 is the record of what happens when that something is available only
 * to people who can see it. `ariaLabel` is required here for the same reason,
 * and the shape of it is the caller's job because only the caller knows what
 * the trend is of.
 */

export type SparklineProps = {
  series: ChartSeries;
  /**
   * REQUIRED text alternative, e.g. "Headcount, 30 days: rising from 48 to 61".
   *
   * Note what is *not* on this component: `valueFormat` and `currencyCode`.
   * A sparkline draws no number, so it has nothing to format — the only place
   * a value becomes text here is this label, and the label is the caller's.
   * `sparklineAriaLabel` below takes both options and is the intended way to
   * build one. Accepting them here and ignoring them would be a prop that
   * silently does nothing, which is worse than not offering it.
   */
  ariaLabel: string;
  /** Palette index, so a sparkline matches the series it belongs to. */
  colorIndex?: number;
  /** Default `true` — a faint fill makes the direction readable at this size. */
  filled?: boolean;
  /** Marks the final value. Default `true`. */
  showLastPoint?: boolean;
  className?: string;
};

const VIEWBOX_WIDTH = 120;
const VIEWBOX_HEIGHT = 32;
/* Room for the end marker and the stroke, so neither is clipped by the edge. */
const PADDING = 4;

export function Sparkline({
  ariaLabel,
  className,
  colorIndex = 0,
  filled = true,
  series,
  showLastPoint = true,
}: SparklineProps) {
  if (!hasChartData([series])) {
    /*
     * An empty sparkline is a dash, not a `ChartEmpty` card: it lives inside a
     * tile whose own empty state has already been decided, and an empty-state
     * panel nested in a table cell would wreck the row.
     */
    return (
      <span aria-label={ariaLabel} className={className} role="img">
        <span aria-hidden="true" className="text-xs text-muted">
          -
        </span>
      </span>
    );
  }

  const color = seriesColor(colorIndex);
  const points = series.points;

  const [min, max] = seriesExtent([series]);
  const yScale = linearScale({
    domain: [min, max],
    range: [VIEWBOX_HEIGHT - PADDING, PADDING],
  });

  const step =
    points.length > 1 ? (VIEWBOX_WIDTH - PADDING * 2) / (points.length - 1) : 0;
  const xFor = (index: number) =>
    points.length > 1
      ? PADDING + index * step
      : VIEWBOX_WIDTH / 2;

  const coordinates = points.map((point, index) => ({
    x: index,
    y: Number(point.value),
  }));

  const last = points[points.length - 1];
  const lastY = yScale(Number(last.value));

  return (
    <svg
      aria-label={ariaLabel}
      className={["h-8 w-full", className].filter(Boolean).join(" ")}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
    >
      {/*
       * The value is in the label rather than on the chart. At 32px tall there
       * is no room for a number, and the caller's tile is already showing it.
       */}
      <title>{ariaLabel}</title>

      {filled ? (
        <path
          d={buildAreaPath(coordinates, xFor, yScale, {
            /*
             * Filled to the *minimum* of the series, not to zero. A sparkline
             * has no axis, so a fill to zero on a series that never approaches
             * zero is a solid block with a wobble on top — it carries no
             * information at the size the glyph is drawn.
             */
            baselineValue: min,
          })}
          fill={color}
          opacity={0.16}
        />
      ) : null}

      <path
        d={buildLinePath(coordinates, xFor, yScale)}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        /*
         * `preserveAspectRatio="none"` stretches the glyph to its container,
         * which would also stretch the stroke into an uneven weight. This
         * keeps it 1.75 user units wide however the box is scaled.
         */
        vectorEffect="non-scaling-stroke"
      />

      {showLastPoint && Number.isFinite(lastY) ? (
        <circle
          cx={xFor(points.length - 1)}
          cy={lastY}
          fill={color}
          r={2}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

/**
 * A ready-made `ariaLabel` for the common case: a metric over a period.
 *
 * Offered because the required label is only useful if it is easy to write a
 * good one. A caller with something more specific to say should say it.
 */
export function sparklineAriaLabel(
  series: ChartSeries,
  options: {
    valueFormat?: ChartValueFormat;
    currencyCode?: string | null;
    periodLabel?: string;
  } = {},
): string {
  const points = series.points ?? [];

  if (points.length === 0) {
    return `${series.label}: no data`;
  }

  const format = (value: number) =>
    formatChartValue(value, options.valueFormat ?? "number", {
      currencyCode: options.currencyCode,
    });

  const first = Number(points[0].value);
  const last = Number(points[points.length - 1].value);

  const direction =
    last > first ? "rising" : last < first ? "falling" : "unchanged";

  const period = options.periodLabel ? `, ${options.periodLabel}` : "";

  if (points.length === 1) {
    return `${series.label}${period}: ${format(first)}`;
  }

  return `${series.label}${period}: ${direction} from ${format(first)} to ${format(last)} across ${points.length} points`;
}
