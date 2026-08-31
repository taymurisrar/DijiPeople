"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectField } from "@/app/components/ui/form-control";
import {
  analyticsFilterHref,
  applyAnalyticsFilters,
} from "@/app/components/filters";

/*
 * The three selections that are the *surface's* rather than the filter bar's:
 * which source, which trend metric, which time bucket.
 *
 * They live here instead of in `AnalyticsFilterBar` because that component is
 * shared and its parameter list is a fixed contract — `ANALYTICS_FILTER_PARAMS`
 * says in as many words that names are added, never repurposed. `src`, `trend`
 * and `granularity` are this workspace's, so this workspace owns them.
 *
 * Every change still routes through `applyAnalyticsFilters`, which deletes
 * `page` — the reason being the same one the filter bar records: staying on
 * page four of a narrower result shows an empty table that reads as a broken
 * control rather than as being past the end.
 */

export type SurfaceControlsProps = {
  sourceOptions: readonly { value: string; label: string }[];
  activeSource: string;
  trendOptions: readonly { value: string; label: string }[];
  activeTrend: string | null;
  activeGranularity: string;
  /** Server-suggested bucket size, named in the hint so the default is legible. */
  suggestedGranularity: string;
};

const GRANULARITY_OPTIONS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
] as const;

export function SurfaceControls({
  sourceOptions,
  activeSource,
  trendOptions,
  activeTrend,
  activeGranularity,
  suggestedGranularity,
}: SurfaceControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";

  const push = React.useCallback(
    (changes: Record<string, string | null>, alsoClear: string[] = []) => {
      const params = applyAnalyticsFilters(query, {});

      for (const key of alsoClear) params.delete(key);

      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      router.push(analyticsFilterHref(pathname ?? "", params));
    },
    [pathname, query, router],
  );

  /*
   * A dropdown with one option is not a choice, so the source and trend
   * selectors appear only when there is something to select between. The bucket
   * size always has four, so it always appears — an earlier version returned
   * `null` when the other two were both single, which quietly took the
   * granularity control away from every single-source surface.
   */
  const showSource = sourceOptions.length > 1;
  const showTrend = trendOptions.length > 1;

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {showSource ? (
        <SelectField
          hint="Each area answers a different question and is dated by a different column."
          label="Reporting area"
          onChange={(next) =>
            /*
             * A breakdown, a bucket and a sort belong to the source they came
             * from. Carrying `groupBy` across a source switch sends a field the
             * new source does not have, which the API refuses with a 400 on
             * what looks to the reader like an ordinary dropdown change.
             */
            push({ src: next || null }, ["groupBy", "bucket", "bucketKey", "orderBy"])
          }
          options={sourceOptions.map((option) => ({ ...option }))}
          placeholder="Select an area"
          value={activeSource}
        />
      ) : null}

      {showTrend ? (
        <SelectField
          hint="Only a metric shown above can be trended - the trend and the tiles are one query."
          label="Trend metric"
          onChange={(next) => push({ trend: next || null })}
          options={trendOptions.map((option) => ({ ...option }))}
          placeholder="Select a metric"
          value={activeTrend ?? ""}
        />
      ) : null}

      <SelectField
        hint={`Default for this period: ${
          GRANULARITY_OPTIONS.find(
            (option) => option.value === suggestedGranularity,
          )?.label ?? suggestedGranularity
        }`}
        label="Trend buckets"
        onChange={(next) => push({ granularity: next || null })}
        options={GRANULARITY_OPTIONS.map((option) => ({ ...option }))}
        placeholder="Automatic"
        value={activeGranularity}
      />
    </div>
  );
}
