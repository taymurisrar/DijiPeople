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
  useChartIdPrefix,
} from "./chart-chrome";
import {
  formatChartValue,
  pointAccessibleLabel,
  pointActionAccessibleLabel,
} from "./chart-format";
import {
  buildAreaPath,
  buildLinePath,
  linearScale,
  niceTicks,
  resolvePlotArea,
  seriesExtent,
  type ChartMargins,
} from "./chart-geometry";
import { seriesColor, seriesDashArray } from "./chart-tokens";
import { hasChartData, type BaseChartProps } from "./chart-types";

/*
 * A trend with the volume under it filled in.
 *
 * Same geometry as the line chart with a filled region added, so it is written
 * as its own component rather than a `variant` prop on `LineChart`: the fill
 * changes what the chart is *for*. A line invites comparison between series; a
 * filled area invites reading the magnitude beneath one. Overlapping fills stop
 * being readable past two or three series, which the opacity below reflects.
 */

export const AREA_CHART_MARGINS: ChartMargins = {
  top: 12,
  right: 16,
  bottom: 28,
  left: 52,
};

export function AreaChart({
  ariaDescription,
  comparisonLabel,
  currencyCode,
  emptyMessage,
  height = DEFAULT_CHART_HEIGHT,
  onPointSelect,
  series,
  valueFormat = "number",
}: BaseChartProps) {
  const idPrefix = useChartIdPrefix();

  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const plot = resolvePlotArea(CHART_VIEWBOX_WIDTH, height, AREA_CHART_MARGINS);
  const categories = longestPoints(series);

  const [min, max] = seriesExtent(series);
  const ticks = niceTicks(min, max, 5);
  const domainMin = ticks.length ? Math.min(min, ticks[0]) : min;
  const domainMax = ticks.length ? Math.max(max, ticks[ticks.length - 1]) : max;

  const yScale = linearScale({
    domain: [domainMin, domainMax],
    range: [plot.y + plot.height, plot.y],
  });

  const step = categories.length > 1 ? plot.width / (categories.length - 1) : 0;
  const xFor = (index: number) =>
    categories.length > 1 ? plot.x + index * step : plot.x + plot.width / 2;

  return (
    <ChartSurface
      ariaLabel={ariaDescription}
      height={height}
      interactive={Boolean(onPointSelect)}
    >
      <defs>
        {series.map((entry, seriesIndex) => (
          /*
           * A vertical fade rather than a flat wash. A flat fill at a readable
           * opacity hides the gridlines behind it, and at an opacity low
           * enough to keep them it stops reading as a fill at all.
           */
          <linearGradient
            id={`${idPrefix}-area-${seriesIndex}`}
            key={entry.key}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={seriesColor(seriesIndex)}
              stopOpacity={0.32}
            />
            <stop
              offset="100%"
              stopColor={seriesColor(seriesIndex)}
              stopOpacity={0.04}
            />
          </linearGradient>
        ))}
      </defs>

      <ChartValueGrid
        formatTick={(tick) => formatChartValue(tick, valueFormat, { currencyCode })}
        plot={plot}
        ticks={ticks}
        yScale={yScale}
      />

      {series.map((entry, seriesIndex) => {
        const coordinates = entry.points.map((point, index) => ({
          x: index,
          y: Number(point.value),
        }));

        return (
          <g key={entry.key}>
            <path
              aria-hidden="true"
              d={buildAreaPath(coordinates, xFor, yScale, {
                /*
                 * The fill is measured from zero, not from the bottom of the
                 * plot. With negative values in the series those are two
                 * different lines, and filling to the plot floor would shade
                 * the area below zero as if it were above it.
                 */
                baselineValue: 0,
              })}
              fill={`url(#${idPrefix}-area-${seriesIndex})`}
            />

            <path
              d={buildLinePath(coordinates, xFor, yScale)}
              fill="none"
              stroke={seriesColor(seriesIndex)}
              strokeDasharray={seriesDashArray(seriesIndex)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />

            {onPointSelect
              ? entry.points.map((point, index) => {
                  const y = yScale(Number(point.value));
                  if (!Number.isFinite(y)) return null;

                  const activate = () => onPointSelect(point, entry);

                  return (
                    <g
                      aria-label={pointActionAccessibleLabel(
                        pointAccessibleLabel({
                          seriesLabel: series.length > 1 ? entry.label : null,
                          pointLabel: point.label,
                          valueText: formatChartValue(
                            Number(point.value),
                            valueFormat,
                            { currencyCode },
                          ),
                          qualifier:
                            comparisonLabel && seriesIndex > 0
                              ? comparisonLabel
                              : null,
                        }),
                      )}
                      className={CHART_FOCUSABLE_CLASS}
                      key={point.key}
                      onClick={activate}
                      onKeyDown={activateOnKey(activate)}
                      role="button"
                      tabIndex={0}
                    >
                      <circle cx={xFor(index)} cy={y} fill="transparent" r={12} />
                      <circle
                        cx={xFor(index)}
                        cy={y}
                        fill={seriesColor(seriesIndex)}
                        r={3.5}
                      />
                    </g>
                  );
                })
              : null}
          </g>
        );
      })}

      <ChartCategoryAxis categories={categories} plot={plot} xFor={xFor} />
    </ChartSurface>
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
