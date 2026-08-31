"use client";

import * as React from "react";
import {
  AreaChart,
  ChartFrame,
  formatChartValue,
  type ChartSeries,
} from "@/app/components/charts";
import type {
  AnalyticsMetricResult,
  AnalyticsTrend,
} from "../_lib/reporting-types";
import { toChartValue, toChartValueFormat } from "../_lib/report-format";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * How the chosen metric moved *inside* the period.
 *
 * This is the first of the two things a Dashboard widget does not do. A
 * dashboard card answers "what is the number now"; a trend answers "when did it
 * change", which is the question that makes a KPI actionable — a 4% fall spread
 * evenly across a month and a 4% fall that happened on one Tuesday are the same
 * number and completely different findings.
 *
 * `AreaChart` rather than `LineChart` because a single series of counts reads
 * better with the area filled; the primitive is the shared one either way and
 * this file draws nothing itself.
 *
 * A `null` point is a bucket the engine could not measure, not a zero. It is
 * dropped from the series rather than plotted at the baseline: plotting it
 * would draw a cliff to zero and back, which is a shape the reader will believe.
 */

export type AnalyticsTrendCardProps = {
  trend: AnalyticsTrend | null;
  metric: AnalyticsMetricResult | undefined;
  periodLabel: string;
  currencyCode?: string | null;
  /** Shown when the trend is absent, saying which kind of absent it is. */
  emptyMessage: string;
};

export function AnalyticsTrendCard({
  trend,
  metric,
  periodLabel,
  currencyCode,
  emptyMessage,
}: AnalyticsTrendCardProps) {
  const formattingContext = useFormattingContext();
  const valueFormat = toChartValueFormat(metric?.format);
  const metricKey = metric?.key ?? trend?.metricKey ?? "";
  const label = metric?.label ?? "Trend";

  const series = React.useMemo<ChartSeries[]>(() => {
    if (!trend || trend.points.length === 0) return [];

    const points = trend.points
      .filter((point) => point.value !== null && point.value !== undefined)
      .map((point) => ({
        key: point.key,
        label: point.label,
        value: toChartValue(point.value, metric?.format, metricKey),
      }));

    if (points.length === 0) return [];

    return [{ key: metricKey || "trend", label, points }];
  }, [trend, metric?.format, metricKey, label]);

  const granularityWord = GRANULARITY_WORD[trend?.granularity ?? "day"];

  const measured = series[0]?.points ?? [];
  const first = measured[0];
  const last = measured[measured.length - 1];

  const ariaDescription =
    measured.length === 0
      ? `${label} over ${periodLabel}: nothing measured.`
      : `${label} by ${granularityWord} over ${periodLabel}: ${measured.length} points, from ${formatChartValue(
          first.value,
          valueFormat,
          { currencyCode, context: formattingContext },
        )} on ${first.label} to ${formatChartValue(last.value, valueFormat, {
          currencyCode,
          context: formattingContext,
        })} on ${last.label}.`;

  const droppedBuckets = (trend?.points.length ?? 0) - measured.length;

  return (
    <ChartFrame
      currencyCode={currencyCode}
      description={`${label}, bucketed by ${granularityWord}, across ${periodLabel}.`}
      emptyMessage={emptyMessage}
      footnote={
        droppedBuckets > 0
          ? `${droppedBuckets} ${
              droppedBuckets === 1 ? "bucket" : "buckets"
            } could not be measured and are omitted rather than drawn as zero`
          : undefined
      }
      series={series}
      title={`${label} over time`}
      valueFormat={valueFormat}
    >
      <AreaChart
        ariaDescription={ariaDescription}
        currencyCode={currencyCode}
        height={260}
        series={series}
        valueFormat={valueFormat}
      />
    </ChartFrame>
  );
}

const GRANULARITY_WORD: Record<string, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
};
