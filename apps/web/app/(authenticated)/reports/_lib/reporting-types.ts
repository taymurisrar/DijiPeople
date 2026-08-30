/*
 * The wire shapes of the `/reporting` API, restated for this app.
 *
 * Hand-written rather than generated, because there is no client generator in
 * this repository and inventing one for a single module would be a second
 * source of truth (root AGENTS.md, principle 4). The rule that keeps these
 * honest is narrower: **nothing here may be wider than what the API sends.**
 * A field typed as `string` that the API may omit is how a screen ends up
 * rendering "undefined" in production, so anything optional server-side is
 * optional here too, and every nullable number is `number | null`.
 *
 * Kept as a plain `.ts` module with no imports so `apps/web`'s node-environment
 * jest can reach the pure logic that consumes it.
 */

/** `ReportFieldDefinition['format']` on the server. Presentation only. */
export type ReportValueFormat =
  | "plain"
  | "currency"
  | "percent"
  | "duration"
  | "date"
  | "datetime";

/** `ReportFieldType` on the server, narrowed to what the catalog emits. */
export type ReportFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "duration_minutes"
  | "percent"
  | "money";

export type ReportFilterOperator =
  | "eq"
  | "ne"
  | "contains"
  | "startswith"
  | "endswith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notin"
  | "between"
  | "isnull"
  | "isnotnull";

export type ReportFilterInput = {
  field: string;
  operator: ReportFilterOperator;
  value?: unknown;
  valueTo?: unknown;
};

/**
 * Higher is better, lower is better, or no judgement.
 *
 * `neutral` is not a default nobody chose — the desktop-activity metrics are
 * deliberately all neutral, because calling a fall in "active seconds" *bad*
 * would be the product taking a position on what the number means.
 */
export type MetricDirection = "up_is_good" | "down_is_good" | "neutral";

export type CatalogField = {
  key: string;
  label: string;
  description: string;
  type: ReportFieldType;
  filterable: boolean;
  sortable: boolean;
  groupable: boolean;
  aggregatable: boolean;
  supportedAggregations: string[];
  format: ReportValueFormat;
};

export type CatalogMetric = {
  key: string;
  label: string;
  description: string;
  format: ReportValueFormat;
  direction: MetricDirection;
  supportedDimensions: string[];
  caveats: string[];
};

export type CatalogSource = {
  key: string;
  label: string;
  description: string;
  caveats: string[];
  /** OWN / TEAM / BUSINESS_UNIT / ORGANIZATION / TENANT — whose data this is. */
  accessLevel: string;
  fields: CatalogField[];
  metrics: CatalogMetric[];
};

export type ReportCatalog = CatalogSource[];

/** `/reporting/builder-fields` — the catalog field plus its operator list. */
export type BuilderField = CatalogField & {
  supportedOperators: ReportFilterOperator[];
};

export type ResolvedPeriod = {
  from: string;
  to: string;
  preset: string;
  timezone: string;
  days: number;
};

export type AnalyticsMetricResult = {
  key: string;
  label: string;
  description: string;
  value: number | null;
  comparisonValue: number | null;
  delta: number | null;
  /** `null` when the comparison baseline is zero — not zero, and not infinity. */
  deltaPercent: number | null;
  format: ReportValueFormat;
  direction: MetricDirection;
  caveats: string[];
  suppressed: boolean;
};

export type AnalyticsBreakdownValue = {
  key: string;
  label: string;
  value: number;
  comparisonValue?: number;
};

export type AnalyticsBreakdown = {
  field: string;
  label: string;
  values: AnalyticsBreakdownValue[];
  /** True when at least one bucket was withheld for being too small. */
  suppressed: boolean;
  suppressedBuckets: number;
  suppressionLabel: string;
};

export type AnalyticsTrend = {
  metricKey: string;
  granularity: "day" | "week" | "month" | "quarter";
  points: Array<{ key: string; label: string; value: number | null }>;
};

export type AnalyticsResult = {
  source: { key: string; label: string; description: string };
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
  metrics: AnalyticsMetricResult[];
  breakdown: AnalyticsBreakdown | null;
  trend: AnalyticsTrend | null;
  caveats: string[];
  accessLevel: string;
};

export type ReportResultColumn = {
  key: string;
  label: string;
  type: ReportFieldType | string;
  format: ReportValueFormat | string;
};

export type ReportResultRow = {
  id: string;
  /** Link to the underlying record, when the source declares one. */
  href: string | null;
  values: Record<string, unknown>;
};

export type AnalyticsRecordsResult = {
  columns: ReportResultColumn[];
  rows: ReportResultRow[];
  /** The real total for the scoped, filtered query — never the page length. */
  total: number;
  page: number;
  pageSize: number;
};

export type ReportRunResult = AnalyticsRecordsResult & {
  targetKey: string;
  name: string;
  description: string;
  sourceKey: string;
  caveats: string[];
  generatedAt: string;
};

export type ReportLibraryEntry = {
  /** `std:<key>` or `def:<uuid>`. The one way a report is addressed. */
  targetKey: string;
  name: string;
  description: string;
  category: string;
  sourceKey: string;
  isStandard: boolean;
  canEdit: boolean;
  canDelete: boolean;
  ownerUserId?: string;
  updatedAt?: string;
};

export type ReportLibrary = {
  standard: ReportLibraryEntry[];
  custom: ReportLibraryEntry[];
};

export type ReportVisibilityScope = "PRIVATE" | "ROLE" | "USER" | "TENANT";

export type ReportDefinitionConfig = {
  columns: string[];
  filters?: ReportFilterInput[];
  groupBy?: string;
  aggregations?: Array<{ field: string; aggregation: string }>;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  preset?: string;
  visualization?: "table" | "bar" | "line" | "donut";
};

export type CreateReportDefinitionInput = {
  name: string;
  description?: string;
  category: string;
  dataSourceKey: string;
  config: ReportDefinitionConfig;
  visibilityScope?: ReportVisibilityScope;
  allowedRoleKeys?: string[];
  allowedUserIds?: string[];
};

export type SavedView = {
  id: string;
  name: string;
  slug: string;
  surfaceKey: string;
  config: unknown;
  isDefault: boolean;
  visibilityScope: ReportVisibilityScope;
  ownerUserId: string;
  canEdit: boolean;
};

export type SavedViewConfig = {
  preset?: string;
  from?: string;
  to?: string;
  comparison?: string;
  filters?: ReportFilterInput[];
  breakdown?: string;
  metricKeys?: string[];
};

export type RecentReportView = {
  targetKey: string;
  viewedAt: string;
  viewCount: number;
};

/** A named lookup row, as `/departments`, `/teams` and friends return it. */
export type NamedLookupRecord = {
  id: string;
  name: string;
  isActive?: boolean;
};
