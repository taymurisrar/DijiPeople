"use client";

import * as React from "react";
import { Table2, ChartColumnBig } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { ChartEmpty, ChartLegend, type ChartLegendItem } from "./chart-chrome";
import { formatChartValue, formatShare, summarizeChartShape } from "./chart-format";
import { computeShares } from "./chart-geometry";
import type { ChartSeries, ChartValueFormat } from "./chart-types";
import { hasChartData } from "./chart-types";

/*
 * The wrapper that makes a chart a complete thing rather than a picture.
 *
 * Requirement, from BUG-2148: no chart may exist whose content is only
 * available by looking at it. Satisfying that per chart would mean seven
 * implementations of the same idea and seven chances to forget, so it is
 * satisfied once, here — every chart put inside a `ChartFrame` gains a "View as
 * table" toggle that renders the identical data through the app's own
 * `DataTable`, with its sorting, its filtering and its keyboard support.
 *
 * The table is a *toggle* rather than a permanent second copy because a
 * duplicated table under every chart makes the page twice as long for everyone
 * and is skipped by everyone. It is a real control, in the tab order, with an
 * accessible name that says which chart it belongs to — the BUG-2149 failure
 * (six controls all named "Open") is very easy to reproduce on a page of eight
 * charts each with a button named "View as table".
 */

export type ChartFrameProps = {
  title: string;
  description?: string;
  /**
   * Right-hand controls — a granularity switch, an export, a drill-down link.
   * Rendered in a toolbar row above the chart.
   */
  actions?: React.ReactNode;
  legend?: readonly ChartLegendItem[] | null;
  /** The same data the chart was given. Drives the table representation. */
  series: ChartSeries[];
  valueFormat?: ChartValueFormat;
  currencyCode?: string | null;
  /** Adds a share column — for charts that actually show proportions. */
  showShares?: boolean;
  /** A caveat under the chart: what is excluded, how it is counted. */
  footnote?: string;
  /** Off for a chart whose data is already a table elsewhere on the page. */
  enableTableView?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
};

type ChartFrameRow = {
  key: string;
  label: string;
  values: Record<string, number | undefined>;
  share: number;
};

export function ChartFrame({
  actions,
  children,
  currencyCode,
  description,
  emptyMessage,
  enableTableView = true,
  footnote,
  legend,
  series,
  showShares = false,
  title,
  valueFormat = "number",
}: ChartFrameProps) {
  const [showTable, setShowTable] = React.useState(false);

  const hasData = hasChartData(series);

  const { rows, columns } = React.useMemo(
    () => buildTable({ series, valueFormat, currencyCode, showShares }),
    [series, valueFormat, currencyCode, showShares],
  );

  const summary = summarizeChartShape({
    seriesCount: series.length,
    pointCount: rows.length,
  });

  return (
    <SectionCard description={description} title={title}>
      {/*
       * The toolbar sits above the chart rather than beside the heading
       * because `SectionCard` — the shared card every other screen uses — owns
       * the heading and has no actions slot. Reusing the shared card and
       * placing the controls below it is the better trade than hand-rolling a
       * card here; see this work package's report for the follow-up.
       */}
      {hasData && (actions || enableTableView) ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {actions}

          {enableTableView ? (
            <Button
              aria-pressed={showTable}
              /*
               * Named with the chart's own title. On a page of eight charts,
               * eight buttons named "View as table" produce exactly the
               * BUG-2149 symptom: a list of identical, unusable targets.
               */
              aria-label={
                showTable
                  ? `Show ${title} as a chart`
                  : `Show ${title} as a table`
              }
              leftIcon={
                showTable ? (
                  <ChartColumnBig aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Table2 aria-hidden="true" className="h-4 w-4" />
                )
              }
              onClick={() => setShowTable((current) => !current)}
              size="xs"
              variant="ghost"
            >
              {showTable ? "View as chart" : "View as table"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!hasData ? (
        <ChartEmpty message={emptyMessage} />
      ) : showTable ? (
        <DataTable<ChartFrameRow>
          columns={columns}
          enableSearch={rows.length > 10}
          getRowKey={(row) => row.key}
          rows={rows}
          searchPlaceholder={`Search ${title.toLowerCase()}`}
        />
      ) : (
        <figure className="m-0">
          {children}

          {legend?.length ? <ChartLegend items={legend} /> : null}

          <figcaption className="mt-3 text-xs text-muted">
            {summary}
            {footnote ? ` - ${footnote}` : ""}
          </figcaption>
        </figure>
      )}
    </SectionCard>
  );
}

/**
 * The chart's data, as table rows and columns.
 *
 * One row per category and one column per series, which is the shape a reader
 * of the chart already has in mind. A category missing from a series gets an
 * empty cell rather than a zero — the distinction between "measured zero" and
 * "not measured" is one this whole directory works to preserve, and flattening
 * it in the accessible representation would mean the accessible representation
 * says something the chart does not.
 */
function buildTable({
  currencyCode,
  series,
  showShares,
  valueFormat,
}: {
  currencyCode?: string | null;
  series: ChartSeries[];
  showShares: boolean;
  valueFormat: ChartValueFormat;
}): { rows: ChartFrameRow[]; columns: DataTableColumn<ChartFrameRow>[] } {
  const byKey = new Map<string, ChartFrameRow>();

  for (const entry of series) {
    for (const point of entry.points) {
      const existing = byKey.get(point.key);

      if (existing) {
        existing.values[entry.key] = point.value;
        continue;
      }

      byKey.set(point.key, {
        key: point.key,
        label: point.label,
        values: { [entry.key]: point.value },
        share: 0,
      });
    }
  }

  const rows = [...byKey.values()];

  /* Shares are only meaningful against a single series' total. */
  if (showShares && series.length > 0) {
    const primary = series[0];
    const shares = computeShares(
      rows.map((row) => ({
        key: row.key,
        label: row.label,
        value: row.values[primary.key] ?? 0,
      })),
    );

    shares.forEach((entry, index) => {
      rows[index].share = entry.displayShare;
    });
  }

  const columns: DataTableColumn<ChartFrameRow>[] = [
    {
      key: "label",
      header: "Category",
      sortable: true,
      searchable: true,
      sortAccessor: (row) => row.label,
      searchAccessor: (row) => row.label,
      render: (row) => (
        <span className="font-medium text-foreground">{row.label}</span>
      ),
    },
    ...series.map<DataTableColumn<ChartFrameRow>>((entry) => ({
      key: entry.key,
      header: entry.label,
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cellClassName: "text-right",
      sortAccessor: (row) => row.values[entry.key] ?? 0,
      render: (row) => (
        <span className="tabular-nums text-foreground">
          {formatChartValue(row.values[entry.key] ?? null, valueFormat, {
            currencyCode,
          })}
        </span>
      ),
    })),
  ];

  if (showShares) {
    columns.push({
      key: "share",
      header: "Share",
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cellClassName: "text-right",
      sortAccessor: (row) => row.share,
      render: (row) => (
        <span className="tabular-nums text-muted">{formatShare(row.share)}</span>
      ),
    });
  }

  return { rows, columns };
}
