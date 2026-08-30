import {
  DEFAULT_COMPARISON_MODE,
  DEFAULT_PERIOD_PRESET,
  isComparisonMode,
  isPeriodPreset,
  isValidIsoDate,
  resolveComparison,
  resolvePeriod,
  type ComparisonMode,
  type DateRange,
  type PeriodPreset,
} from "./period";

/*
 * The query string is the state.
 *
 * Every analytics filter lives in the URL and nowhere else, following
 * `attendance/exceptions/_components/attendance-exception-filters.tsx`. The
 * reasoning there applies with more force to a reporting workspace: an analyst
 * can bookmark "open leave conflicts, engineering, previous quarter", paste it
 * into a ticket, or send it to a manager, and it survives a refresh. Component
 * state loses all three, and a report nobody can link to is a report that gets
 * screenshotted into an email.
 *
 * Pure and node-testable on purpose — see `chart-geometry.ts` for the same
 * argument. The filter bar component is then thin enough to have no logic left
 * to get wrong.
 */

/**
 * The parameter names, as a fixed contract.
 *
 * Fixed because these appear in bookmarks, in saved report definitions and in
 * links pasted between people. Renaming one silently breaks every link anyone
 * ever saved, with no error anywhere — the filter simply stops applying. Add
 * new names; do not repurpose or rename these.
 */
export const ANALYTICS_FILTER_PARAMS = [
  "from",
  "to",
  "preset",
  "compare",
  "org",
  "bu",
  "dept",
  "team",
  "location",
  "manager",
  "employmentType",
  "status",
  "groupBy",
] as const;

export type AnalyticsFilterParam = (typeof ANALYTICS_FILTER_PARAMS)[number];

export type AnalyticsFilterState = Partial<
  Record<AnalyticsFilterParam, string>
>;

/**
 * The organisational narrowing parameters, as distinct from the period and the
 * grouping. These are the ones a "N filters applied / Clear" control counts.
 */
export const SCOPE_FILTER_PARAMS: readonly AnalyticsFilterParam[] = [
  "org",
  "bu",
  "dept",
  "team",
  "location",
  "manager",
  "employmentType",
  "status",
];

/**
 * Next's `searchParams` prop, or a real `URLSearchParams`, or a query string.
 * Server components get the first, client components get the second.
 */
export type AnalyticsSearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string
  | null
  | undefined;

function toSearchParams(input: AnalyticsSearchParamsInput): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (typeof input === "string") return new URLSearchParams(input);
  if (input instanceof URLSearchParams) return new URLSearchParams(input);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    /*
     * A repeated parameter arrives as an array. The first value wins rather
     * than the last: `?status=ACTIVE&status=` — which is what a half-cleared
     * form produces — should keep the filter, not silently drop it.
     */
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") params.set(key, first);
  }

  return params;
}

/**
 * Read the recognised filters out of a URL, ignoring everything else.
 *
 * Empty values are dropped rather than kept as `""`, so `?dept=` and no `dept`
 * at all mean the same thing. `preset` and `compare` are validated against
 * their unions here: a hand-edited or stale query string must not put an
 * unknown preset into component state where it would resolve differently in
 * two places.
 */
export function readAnalyticsFilters(
  input: AnalyticsSearchParamsInput,
): AnalyticsFilterState {
  const params = toSearchParams(input);
  const state: AnalyticsFilterState = {};

  for (const key of ANALYTICS_FILTER_PARAMS) {
    const raw = params.get(key)?.trim();
    if (!raw) continue;

    if (key === "preset" && !isPeriodPreset(raw)) continue;
    if (key === "compare" && !isComparisonMode(raw)) continue;
    if ((key === "from" || key === "to") && !isValidIsoDate(raw)) continue;

    state[key] = raw;
  }

  return state;
}

/**
 * Apply changes to a query string, returning a new one.
 *
 * A `null`, `undefined` or empty value removes the parameter — one way to
 * clear a filter, rather than a separate remove function that a caller can
 * forget to use.
 *
 * **`page` is always deleted.** Every filter change returns to the first page,
 * exactly as the attendance exception filters do: staying on page 4 of a
 * narrower result set usually shows nothing at all, which reads as "the filter
 * broke" rather than "you are past the end". Parameters this module does not
 * own are otherwise preserved untouched, so a filter change cannot drop a
 * sort order or a tab selection that another component put there.
 */
export function applyAnalyticsFilters(
  current: AnalyticsSearchParamsInput,
  changes: Partial<Record<AnalyticsFilterParam, string | null | undefined>>,
): URLSearchParams {
  const params = toSearchParams(current);

  for (const [key, value] of Object.entries(changes)) {
    const trimmed = typeof value === "string" ? value.trim() : "";

    if (!trimmed) {
      params.delete(key);
    } else {
      params.set(key, trimmed);
    }
  }

  params.delete("page");

  return params;
}

/**
 * Drop every filter this module owns, keeping anything it does not.
 *
 * `page` goes too, for the reason above.
 */
export function clearAnalyticsFilters(
  current: AnalyticsSearchParamsInput,
): URLSearchParams {
  const params = toSearchParams(current);

  for (const key of ANALYTICS_FILTER_PARAMS) {
    params.delete(key);
  }

  params.delete("page");

  return params;
}

/**
 * How many scope filters are narrowing the data.
 *
 * The period is excluded deliberately: there is always a period, so counting it
 * would mean the bar could never read "no filters applied" and the "Clear"
 * control would never be correctly disabled.
 */
export function activeAnalyticsFilterCount(
  state: AnalyticsFilterState,
): number {
  return SCOPE_FILTER_PARAMS.filter((key) => Boolean(state[key])).length;
}

/**
 * Build an href, omitting the `?` when there is nothing to put after it —
 * `/reports/attendance?` is an ugly URL that also breaks naive link equality
 * checks in navigation highlighting.
 */
export function analyticsFilterHref(
  pathname: string,
  params: URLSearchParams,
): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export type ResolvedAnalyticsPeriod = {
  preset: PeriodPreset;
  compare: ComparisonMode;
  period: DateRange;
  /** `null` when `compare` is `"none"`. */
  comparison: DateRange | null;
};

/**
 * The single interpretation of a URL's period, used by both the filter bar and
 * whatever loads the data.
 *
 * Having one function do this is the point. When the bar and the loader each
 * resolve the query string themselves, the two drift — the chart legend says
 * "previous month" while the numbers underneath were fetched for the previous
 * 31 days — and nothing anywhere reports an error.
 *
 * An explicit `from`/`to` in the URL implies a custom range even when `preset`
 * says otherwise, because the dates are the more specific statement and are
 * what a pasted link is carrying.
 */
export function resolveAnalyticsPeriod(
  state: AnalyticsFilterState,
  options: { timezone?: string | null; referenceDate?: Date | string | null } = {},
): ResolvedAnalyticsPeriod {
  const hasExplicitRange = Boolean(state.from && state.to);

  const preset: PeriodPreset = hasExplicitRange
    ? "custom"
    : isPeriodPreset(state.preset)
      ? state.preset
      : DEFAULT_PERIOD_PRESET;

  const compare: ComparisonMode = isComparisonMode(state.compare)
    ? state.compare
    : DEFAULT_COMPARISON_MODE;

  const period = resolvePeriod(preset, {
    ...options,
    custom: { from: state.from, to: state.to },
  });

  return {
    preset,
    compare,
    period,
    comparison: resolveComparison(period, compare),
  };
}
