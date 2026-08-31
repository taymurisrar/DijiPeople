"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  ChartFrame,
  HorizontalBarList,
  formatChartValue,
  type ChartPoint,
  type ChartSeries,
} from "@/app/components/charts";
import {
  analyticsFilterHref,
  applyAnalyticsFilters,
} from "@/app/components/filters";
import { Button } from "@/app/components/ui/button";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import type {
  AnalyticsBreakdown,
  AnalyticsMetricResult,
} from "../_lib/reporting-types";
import { toChartValue, toChartValueFormat } from "../_lib/report-format";

/*
 * The chosen metric, split by a dimension — and the way into the rows behind a
 * bar.
 *
 * The bar list is `HorizontalBarList` from `app/components/charts`, which
 * exists because the component this replaces (`report-bar-list.tsx`) was
 * genuinely wrong in two ways at once: it scaled every bar against the *largest*
 * value rather than the total, so a 51/49 split and a 99/1 split both drew the
 * leader at full width; and it floored the width at `Math.max(10, ...)`, so a
 * 1% row drew at 10% — a tenfold overstatement applied silently to the smallest
 * rows. Both are gone with the component.
 *
 * Clicking a bar is a real drill-down, not a highlight: it puts the bucket in
 * the URL, the server turns it into a filter, and the record table below it
 * reloads showing exactly the rows that bar counted. Where a dimension cannot
 * express that filter — a date bucket, a numeric bucket — the bars are simply
 * not selectable, rather than selectable and wrong.
 */

export type AnalyticsBreakdownCardProps = {
  breakdown: AnalyticsBreakdown | null;
  metric: AnalyticsMetricResult | undefined;
  /** Every groupable dimension on the current source. */
  options: readonly { value: string; label: string }[];
  activeField: string | null;
  /** False when the dimension's buckets cannot be turned into a filter. */
  canDrillDown: boolean;
  activeBucketLabel: string | null;
  comparisonLabel: string | null;
  periodLabel: string;
  currencyCode?: string | null;
  emptyMessage: string;
};

export function AnalyticsBreakdownCard({
  breakdown,
  metric,
  options,
  activeField,
  canDrillDown,
  activeBucketLabel,
  comparisonLabel,
  periodLabel,
  currencyCode,
  emptyMessage,
}: AnalyticsBreakdownCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";

  const valueFormat = toChartValueFormat(metric?.format);
  const metricKey = metric?.key ?? "";
  const metricLabel = metric?.label ?? "Value";

  const navigate = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = applyAnalyticsFilters(query, {});
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(analyticsFilterHref(pathname ?? "", params));
    },
    [pathname, query, router],
  );

  const series = React.useMemo<ChartSeries[]>(() => {
    const values = breakdown?.values ?? [];
    if (values.length === 0) return [];

    const current: ChartSeries = {
      key: "current",
      label: `${metricLabel} - ${periodLabel}`,
      points: values.map((value) => ({
        key: value.key,
        label: value.label,
        value: toChartValue(value.value, metric?.format, metricKey),
      })),
    };

    /*
     * The comparison is carried as a *second series* rather than as
     * `secondaryValue`, because `ChartFrame`'s table view renders one column
     * per series. That is what makes the comparison readable to someone who
     * cannot see the bars at all — the bar list itself only draws the first
     * series, by design, since two sets of bars would be shares of two
     * different wholes.
     */
    const hasComparison =
      comparisonLabel !== null &&
      values.some((value) => value.comparisonValue !== undefined);

    if (!hasComparison) return [current];

    return [
      current,
      {
        key: "comparison",
        label: `${metricLabel} - ${comparisonLabel}`,
        points: values.map((value) => ({
          key: value.key,
          label: value.label,
          value: toChartValue(
            value.comparisonValue ?? 0,
            metric?.format,
            metricKey,
          ),
        })),
      },
    ];
  }, [
    breakdown,
    comparisonLabel,
    metric?.format,
    metricKey,
    metricLabel,
    periodLabel,
  ]);

  const points = series[0]?.points ?? [];
  const total = points.reduce((sum, point) => sum + Math.max(point.value, 0), 0);

  const ariaDescription =
    points.length === 0
      ? `${metricLabel} by ${breakdown?.label ?? "dimension"}: nothing measured in ${periodLabel}.`
      : `${metricLabel} by ${breakdown?.label}: ${points.length} groups totalling ${formatChartValue(
          total,
          valueFormat,
          { currencyCode },
        )} across ${periodLabel}.`;

  const handleSelect = React.useCallback(
    (point: ChartPoint) => {
      navigate({ bucket: point.label, bucketKey: point.key });
    },
    [navigate],
  );

  return (
    <ChartFrame
      actions={
        options.length > 1 ? (
          <SelectField
            className="min-w-[200px]"
            label="Break down by"
            onChange={(next) =>
              /* A bucket belongs to the dimension it came from. */
              navigate({ groupBy: next || null, bucket: null, bucketKey: null })
            }
            options={options.map((option) => ({ ...option }))}
            placeholder="Select a dimension"
            value={activeField ?? ""}
          />
        ) : null
      }
      currencyCode={currencyCode}
      description={
        canDrillDown
          ? `Select a group to see the records behind it.`
          : `${metricLabel} split by ${breakdown?.label ?? "dimension"}.`
      }
      emptyMessage={emptyMessage}
      footnote={
        breakdown?.suppressed
          ? `${breakdown.suppressedBuckets} ${
              breakdown.suppressedBuckets === 1 ? "group" : "groups"
            } withheld, so the bars do not sum to the tenant total`
          : undefined
      }
      series={series}
      showShares
      title={`${metricLabel} by ${breakdown?.label ?? "dimension"}`}
      valueFormat={valueFormat}
    >
      <div className="grid gap-4">
        {activeBucketLabel ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="info">
              <span>Drilled into: {activeBucketLabel}</span>
            </StatusPill>
            <Button
              aria-label={`Clear the ${activeBucketLabel} drill-down and show every group`}
              leftIcon={<X aria-hidden="true" className="h-4 w-4" />}
              onClick={() => navigate({ bucket: null, bucketKey: null })}
              size="xs"
              variant="ghost"
            >
              Clear drill-down
            </Button>
          </div>
        ) : null}

        <HorizontalBarList
          ariaDescription={ariaDescription}
          currencyCode={currencyCode}
          onPointSelect={canDrillDown ? handleSelect : undefined}
          series={series}
          totalNoun={metricLabel.toLowerCase()}
          valueFormat={valueFormat}
        />
      </div>
    </ChartFrame>
  );
}
