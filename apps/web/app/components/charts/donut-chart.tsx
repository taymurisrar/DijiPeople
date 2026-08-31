"use client";

import * as React from "react";
import {
  activateOnKey,
  ChartEmpty,
  ChartPatternDefs,
  ChartSurface,
  CHART_FOCUSABLE_CLASS,
  DEFAULT_CHART_HEIGHT,
  seriesPatternUrl,
  useChartIdPrefix,
} from "./chart-chrome";
import {
  formatChartValue,
  formatShare,
  pointAccessibleLabel,
  pointActionAccessibleLabel,
} from "./chart-format";
import { collapseToTopN, computeShares, donutArcs } from "./chart-geometry";
import { MAX_CHART_SLICES } from "./chart-tokens";
import { hasChartData, type BaseChartProps } from "./chart-types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import type { ResolvedFormattingContext } from "@/lib/formatting-context";

/*
 * A composition, as a ring.
 *
 * The centre is not decoration — it holds the total, which is what makes the
 * slices readable as shares of something rather than as coloured wedges. A
 * donut without its total is a pie chart with a hole in it.
 *
 * The tail past seven slices is bucketed for the reason recorded in
 * `chart-tokens.ts`: below a few degrees of arc, a slice is not a slice.
 */

export type DonutChartProps = BaseChartProps & {
  limit?: number;
  /** Overrides the centre caption. Defaults to the summed total. */
  centerLabel?: string;
  centerCaption?: string;
};

const VIEWBOX = 240;

export function DonutChart({
  ariaDescription,
  centerCaption,
  centerLabel,
  currencyCode,
  emptyMessage,
  height = DEFAULT_CHART_HEIGHT,
  limit = MAX_CHART_SLICES,
  onPointSelect,
  series,
  valueFormat = "number",
}: DonutChartProps) {
  const formattingContext = useFormattingContext();
  const idPrefix = useChartIdPrefix();

  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const primary = series[0];
  const collapsed = collapseToTopN(primary.points, limit);
  const shares = computeShares(collapsed);

  const total = shares.reduce(
    (sum, row) => sum + (row.value > 0 ? row.value : 0),
    0,
  );

  const arcs = donutArcs(collapsed, {
    cx: VIEWBOX / 2,
    cy: VIEWBOX / 2,
    innerRadius: 62,
    outerRadius: 100,
    /*
     * A hairline gap between slices. Two adjacent slices of similar colour
     * merge into one without it, which misreports the count of categories
     * before any value is even read.
     */
    padAngle: 0.012,
  });

  const formatValue = (value: number) =>
    formatChartValue(value, valueFormat, { currencyCode, context: formattingContext });

  return (
    <ChartSurface
      ariaLabel={ariaDescription}
      height={height}
      interactive={Boolean(onPointSelect)}
      width={VIEWBOX}
    >
      <ChartPatternDefs count={arcs.length} prefix={idPrefix} />

      {arcs.map((arc, index) => {
        if (!arc.path) {
          return null;
        }

        const share = shares[index];
        const description = pointAccessibleLabel({
          pointLabel: arc.label,
          valueText: formatValue(arc.value),
          shareText: formatShare(share?.displayShare ?? arc.share),
        });

        const point = primary.points.find(
          (candidate) => candidate.key === arc.key,
        );

        const activate =
          onPointSelect && point && !collapsed[index]?.isOther
            ? () => onPointSelect(point, primary)
            : undefined;

        const path = (
          <path d={arc.path} fill={seriesPatternUrl(idPrefix, index)} />
        );

        if (!activate) {
          return (
            <g aria-hidden="true" key={arc.key}>
              {path}
            </g>
          );
        }

        return (
          <g
            aria-label={pointActionAccessibleLabel(description)}
            className={CHART_FOCUSABLE_CLASS}
            key={arc.key}
            onClick={activate}
            onKeyDown={activateOnKey(activate)}
            role="button"
            tabIndex={0}
          >
            {path}
          </g>
        );
      })}

      {/*
       * `aria-hidden` on the centre text: it repeats the total, which the
       * chart's own description already carries, and the table representation
       * carries again. Announcing it a third time between the description and
       * the slices interrupts rather than informs.
       */}
      <g aria-hidden="true">
        <text
          className="fill-current text-xl font-semibold text-foreground"
          dominantBaseline="middle"
          textAnchor="middle"
          x={VIEWBOX / 2}
          y={VIEWBOX / 2 - 6}
        >
          {centerLabel ?? formatValue(total)}
        </text>
        <text
          className="fill-current text-2xs"
          dominantBaseline="middle"
          textAnchor="middle"
          x={VIEWBOX / 2}
          y={VIEWBOX / 2 + 14}
        >
          {centerCaption ?? "Total"}
        </text>
      </g>
    </ChartSurface>
  );
}

/**
 * Legend entries for a donut, in the same order and with the same bucketing the
 * chart used.
 *
 * Exported because a donut without a legend is unreadable — the slices carry no
 * names — and rebuilding the collapse and the shares at the call site would let
 * the legend and the chart disagree about what "Other (4)" contains.
 */
export function donutLegendItems(
  series: BaseChartProps["series"],
  options: {
    limit?: number;
    valueFormat?: BaseChartProps["valueFormat"];
    context?: ResolvedFormattingContext | null;
    currencyCode?: string | null;
  } = {},
) {
  const primary = series[0];
  if (!primary) return [];

  const collapsed = collapseToTopN(primary.points, options.limit ?? MAX_CHART_SLICES);

  return computeShares(collapsed).map((row, index) => ({
    key: row.key,
    label: row.label,
    colorIndex: index,
    valueText: `${formatChartValue(row.value, options.valueFormat ?? "number", {
      currencyCode: options.currencyCode,
      context: options.context,
    })} (${formatShare(row.displayShare)})`,
  }));
}
