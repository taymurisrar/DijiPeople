"use client";

import * as React from "react";
import { ChartEmpty } from "./chart-chrome";
import { formatChartValue, formatShare, pointAccessibleLabel } from "./chart-format";
import { collapseToTopN, computeShares } from "./chart-geometry";
import { MAX_CHART_SLICES, seriesColor } from "./chart-tokens";
import { hasChartData, type BaseChartProps } from "./chart-types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * Ranked proportions: "how is this split up, and what is at the top".
 *
 * This replaces `app/(authenticated)/reports/_components/report-bar-list.tsx`,
 * and the four things it does differently are the four things that were wrong
 * with it. Recorded here because "strictly better" is only checkable against a
 * list of what was worse.
 *
 * 1. **It scales to the total, not to the largest value.** The old list divided
 *    each value by the maximum, so the top row was always a full-width bar
 *    whatever it was worth. A 51/49 split and a 99/1 split both drew the leader
 *    at 100%, which makes the chart unable to answer the only question a
 *    proportion chart is asked.
 *
 * 2. **A small share draws small.** The old `Math.max(10, ...)` floor gave a 1%
 *    category a tenth of the width — a tenfold overstatement, applied silently
 *    to the smallest and least scrutinised rows. The floor here is
 *    `MIN_VISIBLE_SHARE_PERCENT` (1.5%), applied through `computeShares`, which
 *    keeps the honest share and the drawn share as separate numbers so the
 *    printed percentage is never the inflated one.
 *
 * 3. **The tail is bucketed rather than run off the page.** Thirty departments
 *    produced thirty rows; now the tail past seven is summed into "Other (n)",
 *    which still adds up to the printed total.
 *
 * 4. **It says what the numbers are.** The old rows printed a raw `item.value`
 *    with no total, no share and no tenant number formatting, and coloured every
 *    bar with the same hardcoded `linear-gradient(90deg,#0f766e,#38bdf8)` — a
 *    literal in a component, against the token rule, and unreadable in dark
 *    mode where `bg-slate-100` behind it does not change.
 */

export type HorizontalBarListProps = BaseChartProps & {
  /** Rows past this are rolled into "Other (n)". Default `MAX_CHART_SLICES`. */
  limit?: number;
  /** Default `true`. */
  showTotal?: boolean;
  /** Noun for the total line, e.g. "employees". */
  totalNoun?: string;
};

export function HorizontalBarList({
  ariaDescription,
  currencyCode,
  emptyMessage,
  limit = MAX_CHART_SLICES,
  onPointSelect,
  series,
  showTotal = true,
  totalNoun,
  valueFormat = "number",
}: HorizontalBarListProps) {
  const formattingContext = useFormattingContext();
  if (!hasChartData(series)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  /*
   * A ranked proportion is a proportion *of one thing*. With several series
   * the first is the ranking and the rest are ignored here — a second measure
   * belongs in the table representation, not as a second set of bars whose
   * shares would be of a different whole.
   */
  const primary = series[0];
  const collapsed = collapseToTopN(primary.points, limit);
  const rows = computeShares(collapsed);

  const total = rows.reduce(
    (sum, row) => sum + (row.value > 0 ? row.value : 0),
    0,
  );

  const formatValue = (value: number) =>
    formatChartValue(value, valueFormat, { currencyCode, context: formattingContext });

  return (
    <div>
      <p className="sr-only">{ariaDescription}</p>

      {showTotal ? (
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatValue(total)}
          </span>
          <span className="text-sm text-muted">
            {totalNoun ? `${totalNoun} across ` : "across "}
            {rows.length} {rows.length === 1 ? "group" : "groups"}
          </span>
        </div>
      ) : null}

      <ul className="grid gap-3">
        {rows.map((row, index) => {
          const color = seriesColor(index);
          const originalIndex = collapsed[index];

          const description = pointAccessibleLabel({
            pointLabel: row.label,
            valueText: formatValue(row.value),
            shareText: formatShare(row.displayShare),
          });

          const point = primary.points.find(
            (candidate) => candidate.key === row.key,
          );

          /*
           * The "Other" bucket is not a record, so it has nothing to drill
           * into. Making it look interactive and then doing nothing is worse
           * than leaving it inert.
           */
          const activate =
            onPointSelect && point && !originalIndex?.isOther
              ? () => onPointSelect(point, primary)
              : undefined;

          const body = (
            <>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-foreground">{row.label}</span>
                </span>

                <span className="shrink-0 tabular-nums text-muted">
                  <span className="font-medium text-foreground">
                    {formatValue(row.value)}
                  </span>{" "}
                  ({formatShare(row.displayShare)})
                </span>
              </div>

              {/*
               * `aria-hidden` because the row above already states the value
               * and the share in words. A `progressbar` role here would
               * announce the same number a third time.
               */}
              <div
                aria-hidden="true"
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/15"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: color,
                    width: `${row.visibleShare}%`,
                  }}
                />
              </div>
            </>
          );

          if (!activate) {
            return (
              <li className="grid gap-1" key={row.key}>
                {body}
              </li>
            );
          }

          return (
            <li key={row.key}>
              <button
                aria-label={`View details for ${description}`}
                className="w-full rounded-lg px-1 py-0.5 text-left transition hover:bg-accent-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                onClick={activate}
                type="button"
              >
                {body}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
