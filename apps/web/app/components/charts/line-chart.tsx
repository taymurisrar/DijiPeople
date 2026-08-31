"use client";

import * as React from "react";
import {
  activateOnKey,
  ChartCategoryAxis,
  ChartEmpty,
  ChartSurface,
  ChartValueGrid,
  CHART_FOCUSABLE_CLASS,
  CHART_VIEWBOX_WIDTH,
  DEFAULT_CHART_HEIGHT,
} from "./chart-chrome";
import { formatChartValue, pointAccessibleLabel, pointActionAccessibleLabel } from "./chart-format";
import {
  buildLinePath,
  linearScale,
  niceTicks,
  resolvePlotArea,
  seriesExtent,
  type ChartMargins,
} from "./chart-geometry";
import { seriesColor, seriesDashArray } from "./chart-tokens";
import { hasChartData, type BaseChartProps, type ChartPoint } from "./chart-types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * A trend over time.
 *
 * A thin renderer: every number on screen was computed by `chart-geometry.ts`
 * and every string was formatted by `chart-format.ts`, both of which are
 * covered by specs. What is left here is layout and accessibility, which a
 * node-environment test could not reach anyway.
 */

export const LINE_CHART_MARGINS: ChartMargins = {
  top: 12,
  right: 16,
  bottom: 28,
  left: 52,
};

export function LineChart({
  ariaDescription,
  comparisonLabel,
  currencyCode,
  emptyMessage,
  height = DEFAULT_CHART_HEIGHT,
  onPointSelect,
  series,
  valueFormat = "number",
}: BaseChartProps) {
  const formattingContext = useFormattingContext();
  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const plot = resolvePlotArea(CHART_VIEWBOX_WIDTH, height, LINE_CHART_MARGINS);

  /*
   * Categories come from the longest series rather than the first. A
   * comparison overlay is regularly shorter — a previous period that has not
   * finished — and taking the first series' length would clip the axis.
   */
  const categories = longestPoints(series);
  const [min, max] = seriesExtent(series);
  const ticks = niceTicks(min, max, 5);

  const domainMin = ticks.length ? Math.min(min, ticks[0]) : min;
  const domainMax = ticks.length ? Math.max(max, ticks[ticks.length - 1]) : max;

  const yScale = linearScale({
    domain: [domainMin, domainMax],
    range: [plot.y + plot.height, plot.y],
  });

  /*
   * A single point has no interval to divide, so `count - 1` is zero. Pinning
   * the step to the full width puts that point at the left edge; centring it
   * is what a reader expects from "one day of data".
   */
  const step =
    categories.length > 1 ? plot.width / (categories.length - 1) : 0;
  const xFor = (index: number) =>
    categories.length > 1
      ? plot.x + index * step
      : plot.x + plot.width / 2;

  const formatValue = (value: number) =>
    formatChartValue(value, valueFormat, { currencyCode, context: formattingContext });

  return (
    <ChartSurface
      ariaLabel={ariaDescription}
      height={height}
      interactive={Boolean(onPointSelect)}
    >
      <ChartValueGrid
        formatTick={(tick) => formatChartValue(tick, valueFormat, { currencyCode, context: formattingContext })}
        plot={plot}
        ticks={ticks}
        yScale={yScale}
      />

      {series.map((entry, seriesIndex) => {
        const color = seriesColor(seriesIndex);
        /*
         * The dash rhythm is the non-colour channel. Two lines separated only
         * by hue are one line to a reader with a colour vision deficiency and
         * to anyone printing the report — BUG-2148's lesson, applied to
         * series rather than to severity.
         */
        const dash = seriesDashArray(seriesIndex);

        const path = buildLinePath(
          entry.points.map((point, index) => ({
            x: index,
            y: Number(point.value),
          })),
          (value) => xFor(value),
          yScale,
        );

        return (
          <g key={entry.key}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeDasharray={dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />

            {entry.points.map((point, index) => (
              <LinePointMarker
                color={color}
                index={index}
                key={`${entry.key}-${point.key}`}
                label={pointAccessibleLabel({
                  seriesLabel: series.length > 1 ? entry.label : null,
                  pointLabel: point.label,
                  valueText: formatValue(Number(point.value)),
                  qualifier:
                    comparisonLabel && seriesIndex > 0 ? comparisonLabel : null,
                })}
                onSelect={
                  onPointSelect ? () => onPointSelect(point, entry) : undefined
                }
                point={point}
                x={xFor(index)}
                y={yScale(Number(point.value))}
              />
            ))}
          </g>
        );
      })}

      <ChartCategoryAxis categories={categories} plot={plot} xFor={xFor} />
    </ChartSurface>
  );
}

/**
 * One plotted point.
 *
 * Non-interactive markers are `aria-hidden`: the chart already carries its
 * description and announcing forty unnavigable circles adds nothing. Once
 * `onPointSelect` is supplied they become real, focusable, keyboard-operable
 * buttons with names of their own.
 *
 * The transparent hit area is separate from and larger than the visible dot. A
 * 3px target is unusable with a mouse and impossible with a touch screen, and
 * enlarging the visible dot to match would drown the line it sits on.
 */
function LinePointMarker({
  color,
  index,
  label,
  onSelect,
  point,
  x,
  y,
}: {
  color: string;
  index: number;
  label: string;
  onSelect?: () => void;
  point: ChartPoint;
  x: number;
  y: number;
}) {
  if (!Number.isFinite(y) || !Number.isFinite(Number(point.value))) {
    return null;
  }

  if (!onSelect) {
    return <circle aria-hidden="true" cx={x} cy={y} fill={color} r={2.5} />;
  }

  return (
    <g
      aria-label={pointActionAccessibleLabel(label)}
      className={CHART_FOCUSABLE_CLASS}
      key={`${point.key}-${index}`}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
      role="button"
      tabIndex={0}
    >
      <circle cx={x} cy={y} fill="transparent" r={12} />
      <circle cx={x} cy={y} fill={color} r={3.5} />
    </g>
  );
}

function longestPoints(series: BaseChartProps["series"]) {
  let longest = series[0]?.points ?? [];

  for (const entry of series) {
    if (entry.points.length > longest.length) {
      longest = entry.points;
    }
  }

  return longest.map((point) => ({ key: point.key, label: point.label }));
}
