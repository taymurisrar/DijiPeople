/*
 * URL-driven filters for the Reports & Analytics workspace.
 *
 * The query string is the state — see `analytics-search-params.ts`. The period
 * maths in `period.ts` is a plain `.ts` module so this app's node-environment
 * jest can reach it; the components are thin.
 */

export {
  AnalyticsFilterBar,
  type AnalyticsFilterBarProps,
  type AnalyticsScopeFilter,
} from "./analytics-filter-bar";
export {
  DateRangeFilter,
  type DateRangeFilterProps,
  type DateRangeFilterValue,
} from "./date-range-filter";
export {
  ComparisonSelector,
  type ComparisonSelectorProps,
} from "./comparison-selector";

export {
  activeAnalyticsFilterCount,
  analyticsFilterHref,
  applyAnalyticsFilters,
  clearAnalyticsFilters,
  readAnalyticsFilters,
  resolveAnalyticsPeriod,
  ANALYTICS_FILTER_PARAMS,
  SCOPE_FILTER_PARAMS,
  type AnalyticsFilterParam,
  type AnalyticsFilterState,
  type ResolvedAnalyticsPeriod,
} from "./analytics-search-params";

export {
  formatPeriodLabel,
  isComparisonMode,
  isPeriodPreset,
  isValidIsoDate,
  normalizeRange,
  periodLengthInDays,
  resolveComparison,
  resolvePeriod,
  startOfWeek,
  suggestedGranularity,
  tenantToday,
  COMPARISON_MODE_OPTIONS,
  COMPARISON_MODES,
  DEFAULT_COMPARISON_MODE,
  DEFAULT_PERIOD_PRESET,
  DEFAULT_WEEK_STARTS_ON,
  PERIOD_PRESET_OPTIONS,
  PERIOD_PRESETS,
  type ComparisonMode,
  type DateRange,
  type PeriodPreset,
  type ResolvePeriodOptions,
} from "./period";
