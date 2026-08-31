"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnalyticsFilterBar } from "@/app/components/filters";
import { formatDateTime, formatNumber } from "@/lib/formatting-context";
import type { ReportRunResult } from "../_lib/reporting-types";
import { CaveatPanel } from "./caveat-panel";
import { ExportMenu } from "./export-menu";
import { ScheduleReportDialog } from "./schedule-report-dialog";
import { ReportRecordsTable } from "./report-records-table";

/*
 * A report, run.
 *
 * A standard report and a custom one render identically here, because the API
 * resolves both through the same engine and returns the same shape. That is
 * worth preserving on this side too: the moment a custom report gets its own
 * renderer, the two drift, and "the same report exported and on screen" stops
 * being true.
 *
 * The period is a real control rather than a fixed part of the definition. A
 * report's saved `preset` is its default, and the filter bar overrides it into
 * the URL — so "the joiners report, but for last quarter" is a link rather than
 * a second saved report.
 *
 * Comparison is off. `POST /reporting/reports/execute` takes no `comparison`
 * and returns rows rather than metrics, so offering the control would be
 * offering a dropdown that changes nothing. The comparison lives on the
 * analytics surfaces, which return metrics that can carry one.
 */

export type ReportRunnerViewProps = {
  result: ReportRunResult;
  timezone: string;
  currencyCode: string;
  sortableKeys: readonly string[];
  exportAvailable: boolean;
  scheduleAvailable: boolean;
  canManageSchedules: boolean;
  /** The period on screen, in `CreateReportExportDto`'s own shape. */
  exportPeriod: { preset?: string; from?: string; to?: string };
  backHref: string;
  backLabel: string;
};

export function ReportRunnerView({
  result,
  timezone,
  currencyCode,
  sortableKeys,
  exportAvailable,
  scheduleAvailable,
  canManageSchedules,
  exportPeriod,
  backHref,
  backLabel,
}: ReportRunnerViewProps) {
  return (
    <div className="grid gap-5">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
          href={backHref}
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          {backLabel}
        </Link>

        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {result.name}
            </h1>
            {result.description ? (
              <p className="mt-2 text-sm leading-6 text-muted">
                {result.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {formatNumber(result.total)} rows, generated{" "}
              {formatDateTime(result.generatedAt)}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              available={exportAvailable}
              period={exportPeriod}
              subject={result.name}
              targetKey={result.targetKey}
            />
            <ScheduleReportDialog
              available={scheduleAvailable}
              canManage={canManageSchedules}
              defaultPreset={exportPeriod.preset}
              reportName={result.name}
              targetKey={result.targetKey}
              timezone={timezone}
            />
          </div>
        </div>
      </section>

      {/*
       * No scope filters and no comparison: a report definition carries its own
       * filters, and adding a second, differently-named set of narrowing
       * controls here would leave the reader unable to tell which of the two
       * produced the rows they are looking at.
       */}
      <AnalyticsFilterBar enableComparison={false} timezone={timezone} />

      <CaveatPanel caveats={result.caveats} />

      <ReportRecordsTable
        columns={result.columns}
        currencyCode={currencyCode}
        /*
         * The period is described as "the period selected above" rather than
         * printed. `POST /reporting/reports/execute` does not return the
         * resolved window, and resolving the preset a second time here — in the
         * browser's idea of the tenant's timezone — is how a caption ends up
         * naming a different fortnight from the rows beneath it. The filter bar
         * prints the resolved range in its own hint, from one resolution.
         */
        description={`${formatNumber(result.total)} rows for the period selected above, against your own access.`}
        emptyDescription="No records fall inside the selected period for this report. Widen the period, or check that the data this report reads has been recorded."
        emptyTitle="No records in this period"
        page={result.page}
        pageSize={result.pageSize}
        rows={result.rows}
        sortableKeys={sortableKeys}
        title="Results"
        total={result.total}
      />
    </div>
  );
}
