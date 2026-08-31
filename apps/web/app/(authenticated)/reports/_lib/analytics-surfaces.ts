import type {
  CatalogField,
  CatalogMetric,
  CatalogSource,
  ReportCatalog,
  ReportFilterInput,
} from "./reporting-types";

/*
 * What each analytics surface is *about*, and how it resolves against whatever
 * the caller's catalog actually contains.
 *
 * Two rules shape this file.
 *
 * **Nothing here is a second source of truth.** The metric keys, field keys and
 * dimensions below are *preferences*, not declarations: every one of them is
 * intersected with `/reporting/catalog`, which is already filtered by the
 * caller's permissions and by the tenant's enabled features. A preference the
 * catalog does not offer is silently dropped, and a surface whose source is
 * absent from the catalog does not render. That is why a recruiter without
 * desktop-analytics permission gets no half-working Desktop surface, and why
 * adding a metric on the server needs no change here to appear.
 *
 * **A surface is not a source.** "Leave" is three sources — requests,
 * consumption and balances — that answer different questions on different date
 * fields, and collapsing them into one would either hide two of them or produce
 * a screen whose numbers cannot be reconciled with each other. So a surface
 * lists its sources in preference order and offers the reachable ones as a
 * choice.
 *
 * Plain `.ts`, no React, no fetch: `apps/web`'s jest is node-only and matches
 * `*.spec.ts`, and this is where the resolution logic that can quietly go wrong
 * lives.
 */

/** How many KPI tiles a surface shows. Four fits the grid at every breakpoint. */
export const MAX_SURFACE_METRICS = 4;

/** URL parameters this module owns, beyond the ones `filters/` already owns. */
export const SURFACE_SOURCE_PARAM = "src";
export const SURFACE_TREND_PARAM = "trend";
export const SURFACE_BUCKET_PARAM = "bucket";

export type AnalyticsSurfaceKey =
  | "workforce"
  | "attendance"
  | "leave"
  | "recruitment"
  | "desktop_activity";

/**
 * A scope filter the bar may offer.
 *
 * `fieldSuffix` is the part after the source key: the server names dimension
 * fields `<source>.<suffix>`, so one binding serves every source that has the
 * dimension, and a source that does not have it simply loses the control rather
 * than gaining a broken one.
 *
 * `lookupPath` names the API collection whose rows populate the options.
 * **The option value is the row's `name`, not its id** — the semantic layer
 * resolves `<source>.department` to the Prisma path `department.name`, so an
 * id-valued filter matches nothing at all and does it silently.
 */
export type ScopeFilterBinding = {
  param: "org" | "bu" | "dept" | "team" | "location" | "employmentType" | "status";
  fieldSuffix: string;
  label: string;
  lookupPath?: string;
  staticOptions?: readonly { value: string; label: string }[];
};

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROBATION", label: "Probation" },
  { value: "NOTICE", label: "Notice" },
  { value: "TERMINATED", label: "Terminated" },
] as const;

/**
 * The organisational scope filters, in the order they read best.
 *
 * Shared across surfaces because they are the same dimensions everywhere —
 * `employeeDimensionFields` puts them on every employee-linked source — and
 * because a Department filter that means one thing on Attendance and another on
 * Leave would be worse than none.
 */
export const ORGANISATION_SCOPE_FILTERS: readonly ScopeFilterBinding[] = [
  {
    param: "bu",
    fieldSuffix: "business_unit",
    label: "Business unit",
    lookupPath: "/business-units?isActive=true",
  },
  {
    param: "dept",
    fieldSuffix: "department",
    label: "Department",
    lookupPath: "/departments?isActive=true",
  },
  { param: "team", fieldSuffix: "team", label: "Team", lookupPath: "/teams" },
  {
    param: "location",
    fieldSuffix: "location",
    label: "Location",
    lookupPath: "/locations?isActive=true",
  },
  {
    param: "employmentType",
    fieldSuffix: "employment_type",
    label: "Employment type",
    lookupPath: "/employment-types?isActive=true",
  },
  {
    param: "status",
    fieldSuffix: "employment_status",
    label: "Employment status",
    staticOptions: EMPLOYMENT_STATUS_OPTIONS,
  },
];

export type AnalyticsSurfaceDefinition = {
  key: AnalyticsSurfaceKey;
  label: string;
  /** One line saying what question this surface answers. */
  description: string;
  /**
   * What this surface adds over the Dashboard widget of the same name.
   *
   * Written out per surface rather than left implicit because "Reports is a
   * Dashboard with more cards" is the specific failure this workspace exists to
   * avoid, and the distinction has to be visible to the reader, not only to
   * whoever built it.
   */
  versusDashboard: string;
  /** Reachable sources, best first. */
  sourceKeys: readonly string[];
  /** Metric keys to put in the KPI row, best first. */
  preferredMetricKeys: readonly string[];
  /** Dimension suffixes to break down by, best first. */
  preferredBreakdowns: readonly string[];
  /** Metric key for the trend chart. Must also be a KPI metric. */
  preferredTrendMetricKey?: string;
  scopeFilters: readonly ScopeFilterBinding[];
  /**
   * What "there is nothing here" means on this surface.
   *
   * Never "No data": the `test:empty-list-message` class of defects
   * (BUG-1654 / 1752 / 1559) is precisely a message that does not say which
   * kind of empty it is describing.
   */
  emptyTitle: string;
  emptyDescription: string;
};

export const ANALYTICS_SURFACES: readonly AnalyticsSurfaceDefinition[] = [
  {
    key: "workforce",
    label: "Workforce",
    description:
      "Headcount movement, joiners, leavers and turnover across a period, with the shape of the organisation behind them.",
    versusDashboard:
      "The Dashboard shows headcount by department as it stands today. This shows how it moved over a period you choose, against the period before it.",
    /*
     * History first. `workforce` narrows on hire date and carries no history at
     * all, so a period on it means "employees hired in this window" — a useful
     * question, but not the one a headcount trend is asking. The source's own
     * caveat says so and is rendered above the numbers.
     */
    sourceKeys: ["workforce_history", "workforce"],
    preferredMetricKeys: [
      "workforce.historical_headcount",
      "workforce.joiners",
      "workforce.leavers",
      "workforce.turnover_rate",
      "workforce.headcount",
      "workforce.active_headcount",
      "workforce.probation_headcount",
      "workforce.notice_period_headcount",
    ],
    preferredBreakdowns: [
      "department",
      "business_unit",
      "employment_status",
      "location",
      "team",
    ],
    preferredTrendMetricKey: "workforce.historical_headcount",
    scopeFilters: ORGANISATION_SCOPE_FILTERS,
    emptyTitle: "No workforce movement in this period",
    emptyDescription:
      "No joiners, leavers or headcount snapshots fall inside the selected period. Widen the period or clear the scope filters to see more.",
  },
  {
    key: "attendance",
    label: "Attendance",
    description:
      "Attendance rate, worked time and exceptions over a period, against the same window before it.",
    versusDashboard:
      "The Dashboard shows who is present today. This shows the rate across a period, how it compares with the period before, and which days moved it.",
    sourceKeys: ["attendance"],
    preferredMetricKeys: [
      "attendance.attendance_rate",
      "attendance.present_days",
      "attendance.late_arrivals",
      "attendance.open_exceptions",
      "attendance.absent_days",
      "attendance.average_worked_minutes",
    ],
    preferredBreakdowns: ["status", "derived_work_mode", "employee"],
    preferredTrendMetricKey: "attendance.attendance_rate",
    scopeFilters: ORGANISATION_SCOPE_FILTERS,
    emptyTitle: "No reconciled attendance in this period",
    emptyDescription:
      "Attendance days appear once the reconciliation engine has produced them, so a period that includes today is usually short a day. Widen the period or clear the scope filters.",
  },
  {
    key: "leave",
    label: "Leave",
    description:
      "Leave demand and consumption across a period, by type, status and team.",
    versusDashboard:
      "The Dashboard shows leave requests waiting on someone. This shows how much leave was asked for and taken over a period, and how that compares with before.",
    sourceKeys: ["leave_requests", "leave_consumption", "leave_balances"],
    preferredMetricKeys: [
      "leave.requests_raised",
      "leave.employees_currently_on_leave",
      "leave.upcoming_leave_requests",
      "leave.days_taken",
    ],
    preferredBreakdowns: ["status", "leave_type", "leave_category", "employee"],
    preferredTrendMetricKey: "leave.requests_raised",
    scopeFilters: ORGANISATION_SCOPE_FILTERS,
    emptyTitle: "No leave activity in this period",
    emptyDescription:
      "No leave was requested or taken inside the selected period. Widen the period or clear the scope filters to see more.",
  },
  {
    key: "recruitment",
    label: "Recruitment",
    description:
      "Pipeline volume, conversion and time to hire across a period, with the funnel behind them.",
    versusDashboard:
      "The Dashboard shows open requisitions right now. This shows how the pipeline moved over a period - applications in, conversion between stages, and how long a hire took.",
    sourceKeys: [
      "recruitment_applications",
      "recruitment_candidates",
      "recruitment_openings",
      "recruitment_stage_transitions",
    ],
    preferredMetricKeys: [
      "recruitment.applications",
      "recruitment.hires",
      "recruitment.candidates",
      "recruitment.open_requisitions",
      "recruitment.funnel_conversion",
      "recruitment.time_to_hire_days",
      "recruitment.source_effectiveness",
    ],
    preferredBreakdowns: [
      "stage",
      "job_opening",
      "candidate_source",
      "source",
      "current_status",
      "status",
    ],
    preferredTrendMetricKey: "recruitment.applications",
    scopeFilters: [],
    emptyTitle: "No recruitment activity in this period",
    emptyDescription:
      "No applications, candidates or openings fall inside the selected period. Widen the period to see earlier pipeline activity.",
  },
  {
    key: "desktop_activity",
    label: "Desktop activity",
    description:
      "Agent telemetry coverage and reported activity, aggregated and suppressed below a safe population.",
    versusDashboard:
      "The Dashboard does not show this at all. It is period-scoped, aggregate-only, and every bucket small enough to identify a person is withheld rather than shown.",
    sourceKeys: ["desktop_activity", "desktop_devices"],
    preferredMetricKeys: [
      "desktop.telemetry_coverage",
      "desktop.employees_reporting",
      "desktop.average_active_seconds",
      "desktop.average_session_seconds",
      "desktop.devices_reporting",
      "desktop.devices_never_connected",
      "desktop.outdated_agent_devices",
    ],
    preferredBreakdowns: ["department", "business_unit", "team", "date"],
    preferredTrendMetricKey: "desktop.telemetry_coverage",
    scopeFilters: ORGANISATION_SCOPE_FILTERS,
    emptyTitle: "No agent telemetry in this period",
    emptyDescription:
      "Only employees with the desktop agent installed and signed in report at all, and buckets below the population threshold are withheld. Widen the period or the scope.",
  },
];

export function getSurfaceDefinition(
  key: string | null | undefined,
): AnalyticsSurfaceDefinition | null {
  return ANALYTICS_SURFACES.find((surface) => surface.key === key) ?? null;
}

export type ResolvedScopeFilter = ScopeFilterBinding & {
  /** The fully qualified field key on the chosen source. */
  fieldKey: string;
};

export type ResolvedSurface = {
  definition: AnalyticsSurfaceDefinition;
  source: CatalogSource;
  /** Every source of this surface the caller can actually reach. */
  availableSources: Array<{ value: string; label: string }>;
  metrics: CatalogMetric[];
  metricKeys: string[];
  breakdownField: string | null;
  breakdownOptions: Array<{ value: string; label: string }>;
  trendMetricKey: string | null;
  trendOptions: Array<{ value: string; label: string }>;
  scopeFilters: ResolvedScopeFilter[];
  /** Record columns for the drill-down table, best first. */
  drillFieldKeys: string[];
};

export type SurfaceSelection = {
  /** `src` — which of the surface's sources to read. */
  source?: string;
  /** `groupBy` — which dimension to break down by. */
  groupBy?: string;
  /** `trend` — which metric the trend chart draws. */
  trend?: string;
};

/**
 * Resolve a surface against the caller's catalog and their URL selection.
 *
 * Returns `null` when none of the surface's sources is in the catalog, which is
 * how a permission or entitlement removes a whole surface rather than leaving a
 * page of empty charts that look like an outage.
 */
export function resolveSurface(
  definition: AnalyticsSurfaceDefinition,
  catalog: ReportCatalog,
  selection: SurfaceSelection = {},
): ResolvedSurface | null {
  const byKey = new Map(catalog.map((source) => [source.key, source]));

  const reachable = definition.sourceKeys
    .map((key) => byKey.get(key))
    .filter((source): source is CatalogSource => Boolean(source));

  if (reachable.length === 0) return null;

  /*
   * A `src` naming a source this surface does not own, or one the caller cannot
   * reach, falls back to the preferred source rather than erroring. A stale
   * bookmark should render the surface, not a stack trace.
   */
  const source =
    reachable.find((candidate) => candidate.key === selection.source) ??
    reachable[0];

  const metrics = selectMetrics(source, definition.preferredMetricKeys);
  const metricKeys = metrics.map((metric) => metric.key);

  const breakdownOptions = source.fields
    .filter((field) => field.groupable)
    .map((field) => ({ value: field.key, label: field.label }));

  const breakdownField = selectBreakdown(
    source,
    definition.preferredBreakdowns,
    selection.groupBy,
  );

  /*
   * The trend metric must be one of the metrics actually requested: the server
   * resolves `trendMetricKey` against the *requested* metric list, so a trend
   * on a metric outside that list silently returns no trend at all.
   */
  const trendOptions = metrics.map((metric) => ({
    value: metric.key,
    label: metric.label,
  }));

  const trendMetricKey =
    metricKeys.find((key) => key === selection.trend) ??
    metricKeys.find((key) => key === definition.preferredTrendMetricKey) ??
    metricKeys[0] ??
    null;

  const scopeFilters = resolveScopeFilters(source, definition.scopeFilters);

  return {
    definition,
    source,
    availableSources: reachable.map((candidate) => ({
      value: candidate.key,
      label: candidate.label,
    })),
    metrics,
    metricKeys,
    breakdownField,
    breakdownOptions,
    trendMetricKey,
    trendOptions,
    scopeFilters,
    drillFieldKeys: selectDrillFields(source, breakdownField),
  };
}

/**
 * The KPI metrics, preferences first and then whatever else is on the source.
 *
 * Topping up from the catalog matters: a tenant whose plan or permissions
 * remove the four preferred metrics would otherwise get an empty KPI row on a
 * source that has six other perfectly good metrics.
 */
function selectMetrics(
  source: CatalogSource,
  preferred: readonly string[],
): CatalogMetric[] {
  const byKey = new Map(source.metrics.map((metric) => [metric.key, metric]));
  const chosen: CatalogMetric[] = [];

  for (const key of preferred) {
    const metric = byKey.get(key);
    if (metric && !chosen.includes(metric)) chosen.push(metric);
    if (chosen.length === MAX_SURFACE_METRICS) return chosen;
  }

  for (const metric of source.metrics) {
    if (chosen.includes(metric)) continue;
    chosen.push(metric);
    if (chosen.length === MAX_SURFACE_METRICS) break;
  }

  return chosen;
}

/**
 * The breakdown dimension: the URL's choice, then a preference, then anything
 * groupable.
 *
 * The URL value is validated against the source's own groupable fields rather
 * than trusted, because `groupBy` survives a source switch — and a dimension
 * that exists on Leave requests but not on Leave balances would otherwise send
 * a field the server rejects with a 400 on what looks to the user like an
 * ordinary dropdown change.
 */
function selectBreakdown(
  source: CatalogSource,
  preferredSuffixes: readonly string[],
  requested: string | undefined,
): string | null {
  const groupable = source.fields.filter((field) => field.groupable);
  if (groupable.length === 0) return null;

  if (requested && groupable.some((field) => field.key === requested)) {
    return requested;
  }

  for (const suffix of preferredSuffixes) {
    const match = groupable.find(
      (field) => field.key === `${source.key}.${suffix}`,
    );
    if (match) return match.key;
  }

  return groupable[0].key;
}

/** Scope filters whose dimension exists and is filterable on this source. */
function resolveScopeFilters(
  source: CatalogSource,
  bindings: readonly ScopeFilterBinding[],
): ResolvedScopeFilter[] {
  const filterable = new Map(
    source.fields
      .filter((field) => field.filterable)
      .map((field) => [field.key, field]),
  );

  return bindings
    .map((binding) => ({
      ...binding,
      fieldKey: `${source.key}.${binding.fieldSuffix}`,
    }))
    .filter((binding) => filterable.has(binding.fieldKey));
}

/**
 * Columns for the drill-down table.
 *
 * The breakdown dimension leads, because the reader arrived here by clicking a
 * bucket and the first thing they need to see is that they are in the right
 * one. After that: the source's date field, then whatever else is selectable,
 * capped so the table stays readable rather than becoming a 40-column dump.
 */
function selectDrillFields(
  source: CatalogSource,
  breakdownField: string | null,
): string[] {
  const chosen: string[] = [];

  const push = (key: string | null | undefined) => {
    if (!key) return;
    if (chosen.includes(key)) return;
    if (!source.fields.some((field) => field.key === key)) return;
    chosen.push(key);
  };

  push(breakdownField);

  const dateField = source.fields.find(
    (field) => field.type === "date" || field.type === "datetime",
  );
  push(dateField?.key);

  for (const field of source.fields) {
    if (chosen.length >= 8) break;
    /* An opaque uuid column tells a reader nothing. */
    if (field.key.endsWith(".id")) continue;
    push(field.key);
  }

  return chosen;
}

/**
 * Turn the URL's scope selections into the API's filter shape.
 *
 * `eq` throughout: these are single-value dimension pickers, and the semantic
 * layer resolves each field to the label column it is displayed by. A binding
 * with no value in the URL contributes nothing — an `eq` against an empty
 * string would match the rows whose department is literally "", which is not
 * what an unset dropdown means.
 */
export function buildScopeFilters(
  state: Partial<Record<string, string>>,
  scopeFilters: readonly ResolvedScopeFilter[],
): ReportFilterInput[] {
  const filters: ReportFilterInput[] = [];

  for (const binding of scopeFilters) {
    const value = state[binding.param]?.trim();
    if (!value) continue;
    filters.push({ field: binding.fieldKey, operator: "eq", value });
  }

  return filters;
}

/**
 * A human sentence naming the scope filters in force.
 *
 * Shown beside the numbers because a filtered total that does not say it is
 * filtered is the most ordinary way a report misleads: the reader remembers the
 * period they chose and forgets the department they chose three clicks ago.
 */
export function describeActiveScope(
  state: Partial<Record<string, string>>,
  scopeFilters: readonly ResolvedScopeFilter[],
): string {
  const parts = scopeFilters
    .map((binding) => {
      const value = state[binding.param]?.trim();
      return value ? `${binding.label}: ${value}` : null;
    })
    .filter((part): part is string => Boolean(part));

  return parts.join(" - ");
}

/*
 * ── Drilling into a breakdown bucket ──────────────────────────────────────
 *
 * Clicking a bar has to become a filter, and the value that filter carries is
 * NOT the same thing for every dimension. The engine groups on a scalar column
 * and then labels it:
 *
 * - A **lookup** dimension (`workforce.department`) groups on `departmentId`
 *   and labels it from `department.name`, while the *filterable* path is
 *   `department.name`. So the filter takes the **label**; the key is a uuid
 *   that matches nothing on that path.
 * - An **enum** or **boolean** dimension groups on the column itself and labels
 *   it through `humanise()` — `PRESENT` becomes `Present`. So the filter takes
 *   the **key**; the label matches nothing.
 * - A **null** bucket ("Unassigned", "No team") is not a value at all and needs
 *   `isnull`, not `eq` against the word "Unassigned".
 *
 * Getting this backwards does not error. It returns zero rows, which reads as
 * "this department has no records" — a wrong answer that looks like a right
 * one. Hence one function, and a spec for it.
 */

/** The sentinel the engine returns for a bucket whose grouped value was null. */
export const NULL_BUCKET_KEY = "__null__";

export type BucketSelection = { key: string; label: string };

/**
 * Whether a bucket on this dimension can be turned into a records filter.
 *
 * Dates and numbers are deliberately excluded. Their bucket key is a stringified
 * `Date` or a raw number and an `eq` against it is either wrong or accidentally
 * right, so those charts get no drill-down affordance rather than one that
 * sometimes lies. That is the "no fake affordances" rule applied to a link.
 */
export function supportsBucketDrilldown(
  field: { type: string } | undefined,
): boolean {
  if (!field) return false;
  return field.type === "string" || field.type === "enum" || field.type === "boolean";
}

/**
 * The filter that isolates one breakdown bucket, or `null` when the dimension
 * cannot express one.
 */
export function buildBucketFilter(
  field: CatalogField | undefined,
  bucket: BucketSelection,
): ReportFilterInput | null {
  if (!field || !supportsBucketDrilldown(field)) return null;

  if (bucket.key === NULL_BUCKET_KEY) {
    return { field: field.key, operator: "isnull" };
  }

  const value = field.type === "string" ? bucket.label : bucket.key;
  if (!value) return null;

  return { field: field.key, operator: "eq", value };
}

/*
 * ── Which columns may carry a sort header ─────────────────────────────────
 *
 * `/reporting/analytics/records` sorts a field only when it is `sortable` AND
 * its `relationPath` is empty — Prisma cannot order a paged query by a column
 * on a joined relation without the engine building a different query, which it
 * does not. A field failing the second half is accepted, ignored, and the rows
 * come back in the default order.
 *
 * The catalog sends `sortable` but not `relationPath`, so the frontend cannot
 * see the second half of that condition. A sort header on such a column is a
 * control that appears to work, does nothing, and gives no sign either way —
 * which is the "no fake affordances" rule broken in its most annoying form,
 * because the reader clicks twice and concludes the data is already sorted.
 *
 * Until the catalog carries `relationPath` (or the flag already accounts for
 * it), the relation-backed dimensions are excluded by name. They are a closed
 * set: `employeeDimensionFields` in the semantic layer defines all of them, and
 * every one is reached through a Prisma relation on every source that has it.
 * The exclusion errs towards offering less, which is the recoverable direction.
 */
const RELATION_BACKED_DIMENSION_SUFFIXES: readonly string[] = [
  "organization",
  "business_unit",
  "department",
  "team",
  "location",
  "designation",
  "employee_level",
  "employment_type",
  "manager",
  "employee",
  "leave_type",
  "leave_category",
  "job_opening",
  "candidate",
  "recruiter",
];

export function sortableFieldKeys(source: CatalogSource): string[] {
  return source.fields
    .filter((field) => field.sortable)
    .filter((field) => {
      const suffix = field.key.slice(source.key.length + 1);
      return !RELATION_BACKED_DIMENSION_SUFFIXES.includes(suffix);
    })
    .map((field) => field.key);
}
