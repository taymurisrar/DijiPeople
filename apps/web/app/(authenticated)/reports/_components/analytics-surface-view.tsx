"use client";

import * as React from "react";
import { CalendarRange, LayoutDashboard } from "lucide-react";
import {
  AnalyticsFilterBar,
  formatPeriodLabel,
  type AnalyticsScopeFilter,
} from "@/app/components/filters";
import { EmptyState } from "@/app/components/ui/empty-state";
import { formatNumber } from "@/lib/formatting-context";
import type { ResolvedScopeFilter } from "../_lib/analytics-surfaces";
import type {
  AnalyticsRecordsResult,
  AnalyticsResult,
  SavedView,
} from "../_lib/reporting-types";
import { AccessScopePill, MetricTile } from "./metric-tile";
import { AnalyticsBreakdownCard } from "./analytics-breakdown-card";
import { AnalyticsTrendCard } from "./analytics-trend-card";
import { CaveatPanel } from "./caveat-panel";
import { ReportRecordsTable } from "./report-records-table";
import { SavedViewsBar } from "./saved-views-bar";
import { SurfaceControls } from "./surface-controls";

/*
 * One analytics surface, assembled.
 *
 * The composition here is the answer to "how is this not the Dashboard with
 * more cards". Six things are present on every surface and none of them is on a
 * dashboard widget:
 *
 *   1. a period the reader chooses;
 *   2. a comparison window, with its own dates printed;
 *   3. filters that narrow the whole page and live in the URL;
 *   4. KPI tiles that state how each number *moved*, in words;
 *   5. at least one trend inside the period and one breakdown across it; and
 *   6. a drill-down from a bar to the records that produced it.
 *
 * A card without those is a dashboard card. The surface definition also carries
 * a `versusDashboard` sentence, printed at the top, so the distinction is
 * something the reader is told rather than something the code merely believes.
 *
 * This component is a client component and fetches nothing: every number
 * arrives as a prop from the server page, which is what lets the filter bar be
 * pure URL state — a change pushes a URL, the server re-queries, the props
 * change. There is no second data path here to disagree with the first.
 *
 * **There is no Export control here, deliberately.** `POST /reporting/exports`
 * takes a `targetKey` and runs it through `ReportExecutionService.runAll`,
 * which refuses a `srf:` target outright: "An analytics surface cannot be run
 * as a tabular report." A surface is metrics, a trend and a breakdown, none of
 * which the tabular exporter can render. An Export button here would fail every
 * time it was pressed, so it is absent rather than broken — export lives on the
 * report runner, where a target key exists. See this work package's report.
 */

export type AnalyticsSurfaceViewProps = {
  title: string;
  description: string;
  versusDashboard: string;
  emptyTitle: string;
  emptyDescription: string;

  result: AnalyticsResult;
  records: AnalyticsRecordsResult | null;
  /** Why the record table is absent, when it is. Never silently missing. */
  recordsUnavailableReason: string | null;

  sourceOptions: readonly { value: string; label: string }[];
  activeSourceKey: string;

  breakdownOptions: readonly { value: string; label: string }[];
  breakdownField: string | null;
  canDrillDown: boolean;
  activeBucketLabel: string | null;

  trendOptions: readonly { value: string; label: string }[];
  activeTrendKey: string | null;
  activeGranularity: string;
  suggestedGranularity: string;

  scopeFilters: readonly AnalyticsScopeFilter[];
  resolvedScopeFilters: readonly ResolvedScopeFilter[];

  savedViews: readonly SavedView[];
  canManageSavedViews: boolean;

  sortableKeys: readonly string[];
  timezone: string;
  currencyCode: string;
  /** "employee", "attendance day" — names the drill-down link's destination. */
  recordNoun: string;
};

export function AnalyticsSurfaceView({
  title,
  description,
  versusDashboard,
  emptyTitle,
  emptyDescription,
  result,
  records,
  recordsUnavailableReason,
  sourceOptions,
  activeSourceKey,
  breakdownOptions,
  breakdownField,
  canDrillDown,
  activeBucketLabel,
  trendOptions,
  activeTrendKey,
  activeGranularity,
  suggestedGranularity,
  scopeFilters,
  resolvedScopeFilters,
  savedViews,
  canManageSavedViews,
  sortableKeys,
  timezone,
  currencyCode,
  recordNoun,
}: AnalyticsSurfaceViewProps) {
  const periodLabel = formatPeriodLabel({
    from: result.period.from,
    to: result.period.to,
  });

  const comparisonLabel = result.comparisonPeriod
    ? formatPeriodLabel({
        from: result.comparisonPeriod.from,
        to: result.comparisonPeriod.to,
      })
    : null;

  const trendMetric = result.metrics.find(
    (metric) => metric.key === (result.trend?.metricKey ?? activeTrendKey),
  );

  /*
   * "Nothing here" is decided from the measurements, not from the metric list.
   * The API always returns tiles; a period with no rows in it returns them all
   * as zero, and a page of four zeroes with two empty charts reads as broken
   * rather than as empty. It is *not* treated as empty when a metric is
   * suppressed — that is a different state with its own message.
   */
  const hasBreakdown = (result.breakdown?.values.length ?? 0) > 0;
  const hasTrend = (result.trend?.points ?? []).some(
    (point) => point.value !== null && point.value !== 0,
  );
  const hasMetric = result.metrics.some(
    (metric) => metric.suppressed || (metric.value ?? 0) !== 0,
  );
  const isEmpty = !hasBreakdown && !hasTrend && !hasMetric;

  return (
    <div className="grid gap-5">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>

            <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-strong px-3 py-2 text-xs leading-5 text-muted">
              <LayoutDashboard
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>{versusDashboard}</span>
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <AccessScopePill accessLevel={result.accessLevel} />

            <div className="flex flex-wrap items-center gap-2">
              <SavedViewsBar
                canManage={canManageSavedViews}
                scopeFilters={resolvedScopeFilters}
                surfaceKey={result.source.key}
                views={savedViews}
              />
            </div>
          </div>
        </div>
      </section>

      <div>
        <AnalyticsFilterBar
          scopeFilters={scopeFilters}
          timezone={timezone}
        />
        <SurfaceControls
          activeGranularity={activeGranularity}
          activeSource={activeSourceKey}
          activeTrend={activeTrendKey}
          sourceOptions={sourceOptions}
          suggestedGranularity={suggestedGranularity}
          trendOptions={trendOptions}
        />

        {/*
         * The dates the server actually used, not the ones this browser would
         * have computed. The period is resolved in the *tenant's* timezone
         * server-side, so printing a locally derived range would put the label
         * and the numbers a day apart for any tenant whose midnight is not the
         * server's — and nothing anywhere would report an error.
         */}
        <p
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 text-xs text-muted"
        >
          <CalendarRange aria-hidden="true" className="h-4 w-4" />
          <span>
            {periodLabel} ({result.period.days}{" "}
            {result.period.days === 1 ? "day" : "days"}, {result.period.timezone})
          </span>
          {comparisonLabel ? (
            <span>- compared with {comparisonLabel}</span>
          ) : (
            <span>- no comparison selected</span>
          )}
        </p>
      </div>

      <CaveatPanel
        caveats={result.caveats}
        suppression={
          result.breakdown?.suppressed
            ? {
                suppressedBuckets: result.breakdown.suppressedBuckets,
                suppressionLabel: result.breakdown.suppressionLabel,
              }
            : null
        }
      />

      {isEmpty ? (
        <EmptyState description={emptyDescription} title={emptyTitle} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {result.metrics.map((metric) => (
              <MetricTile
                comparisonLabel={comparisonLabel ?? undefined}
                currencyCode={currencyCode}
                key={metric.key}
                metric={metric}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AnalyticsTrendCard
              currencyCode={currencyCode}
              emptyMessage={`Nothing measured for this metric across ${periodLabel}.`}
              metric={trendMetric}
              periodLabel={periodLabel}
              trend={result.trend}
            />

            <AnalyticsBreakdownCard
              activeBucketLabel={activeBucketLabel}
              activeField={breakdownField}
              breakdown={result.breakdown}
              canDrillDown={canDrillDown}
              comparisonLabel={comparisonLabel}
              currencyCode={currencyCode}
              emptyMessage={`No groups to split by across ${periodLabel}.`}
              metric={result.metrics[0]}
              options={breakdownOptions}
              periodLabel={periodLabel}
            />
          </div>
        </>
      )}

      {records ? (
        <ReportRecordsTable
          columns={records.columns}
          currencyCode={currencyCode}
          description={
            activeBucketLabel
              ? `${formatNumber(records.total)} records in ${activeBucketLabel}, for ${periodLabel} and the filters above.`
              : `${formatNumber(records.total)} records behind these numbers, for ${periodLabel} and the filters above.`
          }
          emptyDescription={emptyDescription}
          emptyTitle={emptyTitle}
          page={records.page}
          pageSize={records.pageSize}
          recordNoun={recordNoun}
          rows={records.rows}
          sortableKeys={sortableKeys}
          title="Records behind these numbers"
          total={records.total}
        />
      ) : recordsUnavailableReason ? (
        <EmptyState
          description={recordsUnavailableReason}
          title="The underlying records could not be listed"
        />
      ) : null}
    </div>
  );
}
