"use client";

import * as React from "react";
import {
  activateOnKey,
  ChartCategoryAxis,
  ChartEmpty,
  ChartPatternDefs,
  ChartSurface,
  ChartValueGrid,
  CHART_FOCUSABLE_CLASS,
  CHART_VIEWBOX_WIDTH,
  DEFAULT_CHART_HEIGHT,
  seriesPatternUrl,
  useChartIdPrefix,
} from "./chart-chrome";
import {
  formatChartValue,
  pointAccessibleLabel,
  pointActionAccessibleLabel,
} from "./chart-format";
import {
  linearScale,
  niceTicks,
  resolvePlotArea,
  seriesExtent,
  stackedExtent,
  stackSeries,
  type ChartMargins,
} from "./chart-geometry";
import { hasChartData, type BaseChartProps, type ChartSeries } from "./chart-types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * Vertical bars, grouped or stacked.
 *
 * The two layouts answer different questions and the prop chooses between them
 * rather than a caller picking a different component: `grouped` compares series
 * against each other within a category, `stacked` shows how a category's total
 * is composed. Stacked bars are drawn from `stackSeries`, which puts negatives
 * below zero rather than adding their magnitude to the column height — see the
 * spec, since that arrangement is the whole reason the stacking is not done
 * inline here.
 */

export const BAR_CHART_MARGINS: ChartMargins = {
  top: 12,
  right: 16,
  bottom: 28,
  left: 52,
};

export type BarChartProps = BaseChartProps & {
  /** Default `"grouped"`. */
  layout?: "grouped" | "stacked";
};

export function BarChart({
  ariaDescription,
  comparisonLabel,
  currencyCode,
  emptyMessage,
  height = DEFAULT_CHART_HEIGHT,
  layout = "grouped",
  onPointSelect,
  series,
  valueFormat = "number",
}: BarChartProps) {
  const formattingContext = useFormattingContext();
  const idPrefix = useChartIdPrefix();

  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const plot = resolvePlotArea(CHART_VIEWBOX_WIDTH, height, BAR_CHART_MARGINS);
  const columns = stackSeries(series);

  const [min, max] =
    layout === "stacked" ? stackedExtent(columns) : seriesExtent(series);
  const ticks = niceTicks(min, max, 5);
  const domainMin = ticks.length ? Math.min(min, ticks[0]) : min;
  const domainMax = ticks.length ? Math.max(max, ticks[ticks.length - 1]) : max;

  const yScale = linearScale({
    domain: [domainMin, domainMax],
    range: [plot.y + plot.height, plot.y],
  });

  const slotWidth = columns.length ? plot.width / columns.length : plot.width;
  /* A gutter between categories, so adjacent columns are separable. */
  const bandWidth = slotWidth * 0.72;
  const bandStart = (index: number) =>
    plot.x + index * slotWidth + (slotWidth - bandWidth) / 2;

  const barWidth =
    layout === "stacked"
      ? bandWidth
      : bandWidth / Math.max(1, series.length);

  const formatValue = (value: number) =>
    formatChartValue(value, valueFormat, { currencyCode, context: formattingContext });

  const zeroY = yScale(0);

  return (
    <ChartSurface
      ariaLabel={ariaDescription}
      height={height}
      interactive={Boolean(onPointSelect)}
    >
      <ChartPatternDefs count={series.length} prefix={idPrefix} />

      <ChartValueGrid
        formatTick={(tick) => formatChartValue(tick, valueFormat, { currencyCode, context: formattingContext })}
        plot={plot}
        ticks={ticks}
        yScale={yScale}
      />

      {columns.map((column, columnIndex) =>
        column.segments.map((segment) => {
          const seriesEntry = series[segment.seriesIndex] as
            | ChartSeries
            | undefined;
          if (!seriesEntry) return null;

          const top =
            layout === "stacked"
              ? yScale(Math.max(segment.start, segment.end))
              : yScale(Math.max(0, segment.value));
          const bottom =
            layout === "stacked"
              ? yScale(Math.min(segment.start, segment.end))
              : zeroY;

          /*
           * A measured zero draws as a hairline rather than as nothing. A bar
           * of no height is indistinguishable from a missing category, and
           * this whole directory works to keep those two apart.
           */
          const rectHeight = Math.max(1, Math.abs(bottom - top));
          const x =
            layout === "stacked"
              ? bandStart(columnIndex)
              : bandStart(columnIndex) + segment.seriesIndex * barWidth;

          if (!Number.isFinite(top) || !Number.isFinite(x)) {
            return null;
          }

          const description = pointAccessibleLabel({
            seriesLabel: series.length > 1 ? segment.seriesLabel : null,
            pointLabel: segment.pointLabel,
            valueText: formatValue(segment.value),
            qualifier:
              comparisonLabel && segment.seriesIndex > 0 ? comparisonLabel : null,
          });

          const point = seriesEntry.points.find(
            (candidate) => candidate.key === segment.pointKey,
          );

          const activate =
            onPointSelect && point
              ? () => onPointSelect(point, seriesEntry)
              : undefined;

          const rect = (
            <rect
              fill={seriesPatternUrl(idPrefix, segment.seriesIndex)}
              height={rectHeight}
              rx={2}
              width={Math.max(1, barWidth - (layout === "stacked" ? 0 : 2))}
              x={x}
              y={Math.min(top, bottom)}
            />
          );

          if (!activate) {
            return (
              <g aria-hidden="true" key={`${segment.pointKey}-${segment.seriesKey}`}>
                {rect}
              </g>
            );
          }

          return (
            <g
              aria-label={pointActionAccessibleLabel(description)}
              className={CHART_FOCUSABLE_CLASS}
              key={`${segment.pointKey}-${segment.seriesKey}`}
              onClick={activate}
              onKeyDown={activateOnKey(activate)}
              role="button"
              tabIndex={0}
            >
              {rect}
            </g>
          );
        }),
      )}

      <ChartCategoryAxis
        categories={columns.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        plot={plot}
        xFor={(index) => bandStart(index) + bandWidth / 2}
      />
    </ChartSurface>
  );
}
