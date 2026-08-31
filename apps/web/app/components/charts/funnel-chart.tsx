"use client";

import * as React from "react";
import { ChartEmpty } from "./chart-chrome";
import { formatChartValue, formatShare, pointAccessibleLabel } from "./chart-format";
import { funnelStages } from "./chart-geometry";
import { seriesColor } from "./chart-tokens";
import { hasChartData, type BaseChartProps } from "./chart-types";

/*
 * A pipeline, stage by stage.
 *
 * Drawn with elements rather than SVG because a funnel is mostly text: every
 * stage carries a name, a count, a conversion rate and a drop-off, and laying
 * that out in SVG means hand-positioning text that HTML wraps, truncates and
 * scales for free.
 *
 * The step-to-step conversion is printed *between* stages rather than inside
 * them, because that is where it belongs: it is a property of the transition,
 * not of either stage. Putting "50%" inside the Screened row reads as "50% of
 * screened candidates" — the wrong denominator, and the sort of quiet error a
 * recruiter would act on.
 */

export type FunnelChartProps = BaseChartProps & {
  /**
   * Show conversion against the first stage instead of against the previous
   * one. Default `false` — step-to-step is where a pipeline leaks.
   */
  cumulative?: boolean;
};

export function FunnelChart({
  ariaDescription,
  cumulative = false,
  currencyCode,
  emptyMessage,
  onPointSelect,
  series,
  valueFormat = "number",
}: FunnelChartProps) {
  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  const primary = series[0];
  const stages = funnelStages(primary.points);

  const formatValue = (value: number) =>
    formatChartValue(value, valueFormat, { currencyCode });

  return (
    <div>
      <p className="sr-only">{ariaDescription}</p>

      <ol className="grid gap-1">
        {stages.map((stage, index) => {
          const color = seriesColor(index);
          const conversion = cumulative
            ? stage.conversionFromStart
            : stage.conversionFromPrevious;

          const description = pointAccessibleLabel({
            pointLabel: stage.label,
            valueText: formatValue(stage.value),
            shareText:
              stage.conversionFromStart !== null
                ? `${formatShare(stage.conversionFromStart)} of ${stages[0].label}`
                : null,
          });

          const point = primary.points.find(
            (candidate) => candidate.key === stage.key,
          );

          const activate =
            onPointSelect && point ? () => onPointSelect(point, primary) : undefined;

          const body = (
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">
                  {stage.label}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-foreground">
                  {formatValue(stage.value)}
                </span>
              </div>

              {/*
               * The bar is centred so the funnel narrows symmetrically, which
               * is what makes it read as a funnel rather than as a bar chart
               * sorted descending.
               */}
              <div
                aria-hidden="true"
                className="h-7 overflow-hidden rounded-lg bg-muted/15"
              >
                <div
                  className="mx-auto h-full rounded-lg"
                  style={{
                    backgroundColor: color,
                    /*
                     * A floor, so a stage that reached zero is still a visible
                     * row rather than an unexplained blank in the middle of
                     * the pipeline.
                     */
                    width: `${Math.max(2, stage.widthRatio * 100)}%`,
                  }}
                />
              </div>
            </div>
          );

          return (
            <li key={stage.key}>
              {activate ? (
                <button
                  aria-label={`View details for ${description}`}
                  className="w-full rounded-lg px-1 py-0.5 text-left transition hover:bg-accent-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  onClick={activate}
                  type="button"
                >
                  {body}
                </button>
              ) : (
                body
              )}

              {index < stages.length - 1 ? (
                <StepConversion
                  cumulative={cumulative}
                  dropOff={stages[index + 1].dropOff}
                  formatValue={formatValue}
                  nextLabel={stages[index + 1].label}
                  rate={
                    cumulative
                      ? stages[index + 1].conversionFromStart
                      : stages[index + 1].conversionFromPrevious
                  }
                />
              ) : null}

              {index === 0 && conversion === null && stage.value <= 0 ? (
                <p className="px-1 py-2 text-xs text-muted">
                  Nothing has entered this pipeline yet.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The transition between two stages.
 *
 * Text, not a colour: a red arrow for a bad conversion rate would be exactly
 * BUG-2148 again — a judgement carried only by hue. The rate and the number
 * lost are both stated, because a 50% drop from 4 to 2 and a 50% drop from 400
 * to 200 are not the same finding.
 */
function StepConversion({
  cumulative,
  dropOff,
  formatValue,
  nextLabel,
  rate,
}: {
  cumulative: boolean;
  dropOff: number;
  formatValue: (value: number) => string;
  nextLabel: string;
  rate: number | null;
}) {
  if (rate === null) {
    return (
      <p className="px-1 py-1.5 text-2xs text-muted">
        No conversion to {nextLabel} can be calculated.
      </p>
    );
  }

  return (
    <p className="px-1 py-1.5 text-2xs text-muted">
      {formatShare(rate)}
      {cumulative ? " of the first stage" : ""} continue to {nextLabel}
      {dropOff > 0 ? ` - ${formatValue(dropOff)} lost` : ""}
      {dropOff < 0 ? ` - ${formatValue(Math.abs(dropOff))} added` : ""}
    </p>
  );
}
