"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterX } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { SelectField } from "@/app/components/ui/form-control";
import {
  activeAnalyticsFilterCount,
  analyticsFilterHref,
  applyAnalyticsFilters,
  clearAnalyticsFilters,
  readAnalyticsFilters,
  resolveAnalyticsPeriod,
  SCOPE_FILTER_PARAMS,
  type AnalyticsFilterParam,
} from "./analytics-search-params";
import { ComparisonSelector } from "./comparison-selector";
import { DateRangeFilter } from "./date-range-filter";
import type { ComparisonMode, PeriodPreset } from "./period";

/*
 * The filter bar for every analytics screen. The query string is the state.
 *
 * Copied in structure from
 * `attendance/exceptions/_components/attendance-exception-filters.tsx`,
 * including the detail that is easy to miss: **`page` is deleted on every
 * filter change.** Staying on page 4 of a narrower result set shows an empty
 * screen, which reads as a broken filter rather than as being past the end.
 * That deletion lives in `applyAnalyticsFilters` so it cannot be forgotten by
 * one call site — every change here goes through it.
 *
 * What this adds over that component is that none of the URL handling is in the
 * component. `analytics-search-params.ts` reads, writes, validates and resolves;
 * this file arranges controls. That split is what lets the behaviour be tested
 * at all, since `apps/web` has no jsdom.
 */

export type AnalyticsScopeFilter = {
  /** One of the fixed parameter names. */
  key: Extract<
    AnalyticsFilterParam,
    | "org"
    | "bu"
    | "dept"
    | "team"
    | "location"
    | "manager"
    | "employmentType"
    | "status"
  >;
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
};

export type AnalyticsFilterBarProps = {
  /**
   * Which scope filters this screen offers, and what is in them. Passed in
   * because only the page knows which dimensions its dataset actually has —
   * offering a Department filter on a report with no department dimension
   * produces a control that silently does nothing.
   */
  scopeFilters?: readonly AnalyticsScopeFilter[];
  groupByOptions?: readonly { value: string; label: string }[];
  groupByLabel?: string;
  /** The tenant's zone, so "today" is the tenant's today. */
  timezone?: string | null;
  /** Hides the comparison control on a screen that has no comparison. */
  enableComparison?: boolean;
  className?: string;
};

export function AnalyticsFilterBar({
  className,
  enableComparison = true,
  groupByLabel = "Group by",
  groupByOptions,
  scopeFilters = [],
  timezone,
}: AnalyticsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams?.toString() ?? "";
  const state = React.useMemo(() => readAnalyticsFilters(query), [query]);

  const { compare, period, preset } = React.useMemo(
    () => resolveAnalyticsPeriod(state, { timezone }),
    [state, timezone],
  );

  const activeCount = activeAnalyticsFilterCount(state);

  const push = React.useCallback(
    (params: URLSearchParams) => {
      router.push(analyticsFilterHref(pathname ?? "", params));
    },
    [pathname, router],
  );

  const apply = React.useCallback(
    (changes: Partial<Record<AnalyticsFilterParam, string | null>>) => {
      push(applyAnalyticsFilters(query, changes));
    },
    [push, query],
  );

  return (
    <div
      className={[
        "mb-5 rounded-[22px] border border-border bg-surface p-4 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
       * `role="group"` with a name, so a screen reader can announce the whole
       * bar as one thing and skip it. Eleven unlabelled controls in a row is a
       * wall to navigate past otherwise.
       */}
      <div aria-label="Report filters" role="group">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <DateRangeFilter
            onChange={(next) => {
              /*
               * Both dates are always written together, and both are cleared
               * together for a non-custom preset. A leftover `from` without a
               * `to` — or either one surviving a switch back to a preset —
               * makes the URL say two different things about the period.
               */
              apply({
                preset: next.preset,
                from: next.preset === "custom" ? (next.from ?? null) : null,
                to: next.preset === "custom" ? (next.to ?? null) : null,
              });
            }}
            timezone={timezone}
            value={{
              preset: preset as PeriodPreset,
              from: state.from,
              to: state.to,
            }}
          />

          {enableComparison ? (
            <ComparisonSelector
              onChange={(next: ComparisonMode) =>
                apply({ compare: next === "none" ? null : next })
              }
              period={period}
              value={compare}
            />
          ) : null}

          {scopeFilters.map((filter) => (
            <SelectField
              key={filter.key}
              label={filter.label}
              onChange={(next) => apply({ [filter.key]: next || null })}
              options={filter.options.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              placeholder={filter.placeholder ?? `All ${filter.label.toLowerCase()}`}
              value={state[filter.key] ?? ""}
            />
          ))}

          {groupByOptions?.length ? (
            <SelectField
              label={groupByLabel}
              onChange={(next) => apply({ groupBy: next || null })}
              options={groupByOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              placeholder="Default grouping"
              value={state.groupBy ?? ""}
            />
          ) : null}
        </div>

        {activeCount > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            {/*
             * `aria-live="polite"` so a filter change is announced. Without it
             * the only feedback that a select did anything is the numbers
             * changing somewhere else on the page.
             */}
            <p aria-live="polite" className="text-xs text-muted">
              {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
            </p>

            <Button
              /*
               * Named beyond the visible word. "Clear" alone in a screen
               * reader's control list says nothing about what it clears —
               * the BUG-2149 shape.
               */
              aria-label="Clear all report filters"
              leftIcon={<FilterX aria-hidden="true" className="h-4 w-4" />}
              onClick={() => push(clearAnalyticsFilters(query))}
              size="xs"
              variant="ghost"
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The scope parameters this bar knows how to render, for a caller building its
 * `scopeFilters` list. Re-exported so a page does not import from two modules
 * to describe one bar.
 */
export { SCOPE_FILTER_PARAMS };
