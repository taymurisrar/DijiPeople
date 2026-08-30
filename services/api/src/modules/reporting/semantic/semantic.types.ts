import type { SecurityPrivilege } from '@prisma/client';

/**
 * The reporting semantic layer.
 *
 * Reports are described in business terms and resolved into Prisma here, and
 * *only* here. Nothing a client sends ever reaches a Prisma argument directly:
 * a field key, a filter operator, an aggregation and a relation are each looked
 * up in this registry and rejected if absent. That allow-list is the whole
 * security model of the query engine — a dynamic reporting surface that
 * interpolates request values is an exfiltration interface, not a feature.
 *
 * The vocabulary deliberately reuses `modules/data`'s `EntityFieldMetadata`
 * shape (`selectable`/`filterable`/`sortable`) rather than inventing a second
 * one, and extends it with the things reporting needs and record listing does
 * not: aggregation, grouping, sensitivity and per-field permission.
 */

/** Business-facing scalar kinds. Narrower than Prisma's, on purpose. */
export type ReportFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'duration_minutes'
  | 'percent'
  | 'money';

export type ReportAggregation =
  | 'count'
  | 'count_distinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max';

/**
 * Filter operators. This is intentionally the same 12-operator vocabulary
 * `modules/data/entity-query-validator.ts` already validates, plus the two
 * range forms an analytics period needs.
 */
export type ReportFilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notin'
  | 'between'
  | 'isnull'
  | 'isnotnull';

/**
 * How exposed a field is.
 *
 * `RESTRICTED` fields are never selectable without an explicit permission, are
 * omitted from the catalog a user receives, and are rejected server-side even
 * if a stored report definition names them — because a definition can outlive
 * the access of the person who saved it.
 */
export type ReportFieldSensitivity = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';

export interface ReportFieldDefinition {
  /** Business key, `<source>.<field>`, e.g. `workforce.department`. */
  key: string;
  label: string;
  description?: string;
  type: ReportFieldType;

  /** Prisma field path relative to the data source root, e.g. `department.name`. */
  path: string;

  /**
   * Prisma relation segments that must be `include`d/`select`ed to reach
   * `path`. Empty for a scalar on the root model.
   */
  relationPath?: string[];

  reportable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
  supportedAggregations?: ReportAggregation[];

  /** Allowed values when `type === 'enum'`. Used to validate filters. */
  enumValues?: readonly string[];

  /**
   * The scalar column on the ROOT model to group by, when this field is reached
   * through a relation.
   *
   * Prisma `groupBy` only accepts scalar columns on the model being grouped, so
   * "headcount by department" is really `groupBy(['departmentId'])` with the
   * names resolved in a second query — which is what the existing
   * `reports.service.ts` does by hand for exactly this reason. A groupable
   * field whose `relationPath` is non-empty MUST declare this, or grouping on
   * it is impossible; `semantic-registry.spec.ts` asserts that.
   */
  groupByField?: string;

  /**
   * How to turn a grouped scalar (usually a foreign key) into a human label.
   * Omit for a field that is already its own label, such as an enum.
   */
  labelLookup?: {
    /** Prisma delegate name, e.g. `department`. */
    model: string;
    /** Column matched against the grouped value, usually `id`. */
    valueField: string;
    /** Column rendered to the user, usually `name`. */
    labelField: string;
  };

  /** Shown when the grouped scalar is null, e.g. "Unassigned". */
  nullLabel?: string;

  sensitivity?: ReportFieldSensitivity;
  /** Legacy permission key the caller must hold to see this field at all. */
  permission?: string;

  /** Presentation hint for the client; never affects the query. */
  format?: 'plain' | 'currency' | 'percent' | 'duration' | 'date' | 'datetime';

  /**
   * A field kept for stored definitions but hidden from the builder. Keeps an
   * old report running while steering new ones elsewhere.
   */
  deprecated?: boolean;
  hidden?: boolean;
}

/**
 * How a data source is row-scoped.
 *
 * These are the field names `buildScopedAccessWhere` looks for. A model with no
 * `organizationId` must pass `organizationIdField: null`, or an
 * ORGANIZATION-level role produces `{ organizationId: undefined }`, which
 * Prisma does not treat as "match nothing".
 */
export interface ReportScopeOptions {
  tenantIdField?: string;
  businessUnitIdField?: string;
  organizationIdField?: string | null;
  ownerUserIdField?: string;
  ownerTeamIdField?: string;
  userIdField?: string;
  createdByIdField?: string;
}

export interface ReportDataSource {
  key: string;
  label: string;
  description: string;

  /** The Prisma delegate name, e.g. `employee`, `attendanceDay`. */
  prismaModel: string;

  /**
   * The RBAC entity that decides **which rows** this source returns.
   *
   * Deliberately NOT `ENTITY_KEYS.REPORTS`. `reports:READ` gates access to the
   * workspace; the row scope of workforce data is `employees:READ`, of
   * attendance `attendance:READ`, and so on. Composing them this way means a
   * recruiter with `reports:READ` sees exactly the employees they would see on
   * the Employees screen — the reporting surface can never be a way around a
   * scope the rest of the product enforces.
   */
  rbacEntityKey: string;
  scope: ReportScopeOptions;

  /**
   * Predicate applied to every query on this source, before filters.
   *
   * There is no uniform "active" flag in this schema: `isDeleted` exists on
   * `Employee` and `CustomDataRecord` only, while everything else uses
   * `isActive` or a `status` string. Each source states its own.
   */
  baseWhere?: Record<string, unknown>;

  /** The field used when a period narrows this source. */
  defaultDateField: string;

  fields: ReportFieldDefinition[];

  /** Route to the underlying record for drill-down, e.g. `/employees/{id}`. */
  recordHrefTemplate?: string;
  recordIdField?: string;

  /**
   * Caveats shown wherever this source is charted. Not decoration: several of
   * these are the difference between a number and a misleading number.
   */
  caveats?: string[];

  /** Feature key that must be enabled for the tenant, when the source is gated. */
  requiredFeatureKey?: string;
}

export interface ReportMetricDefinition {
  key: string;
  label: string;
  description: string;
  dataSourceKey: string;
  valueType: ReportFieldType;
  format?: ReportFieldDefinition['format'];

  /**
   * How the number is produced. One authoritative calculation per metric — the
   * dashboard, an analytics tile, a report column, an export and a scheduled
   * delivery must never disagree about what "headcount" means.
   */
  calculation: ReportMetricCalculation;

  /** Field keys this metric may be broken down by. */
  supportedDimensions: string[];
  supportedFilters?: string[];
  comparable?: boolean;

  /** Legacy permission key required to see the metric at all. */
  permission?: string;
  sensitivity?: ReportFieldSensitivity;

  /** Higher is better; drives the delta colour. `neutral` shows no judgement. */
  direction?: 'up_is_good' | 'down_is_good' | 'neutral';

  caveats?: string[];
}

export type ReportMetricCalculation =
  | { kind: 'count' }
  | { kind: 'count_distinct'; field: string }
  | { kind: 'sum'; field: string }
  | { kind: 'avg'; field: string }
  /**
   * A ratio of two sums — never an average of per-row ratios.
   *
   * `AVG(utilizationPercent)` across employees is a ratio of ratios and is
   * wrong; `SUM(active) / SUM(loggedIn)` is right. Making this its own kind
   * means the correct form is the easy one to reach for.
   */
  | { kind: 'ratio'; numerator: string; denominator: string; asPercent?: boolean }
  | { kind: 'filtered_count'; where: Record<string, unknown> }
  | { kind: 'derived'; dependsOn: string[] };

export interface ReportDimensionValue {
  key: string;
  label: string;
  value: number;
  comparisonValue?: number;
}

export type ReportDataSourceRegistry = ReadonlyMap<string, ReportDataSource>;
export type ReportMetricRegistry = ReadonlyMap<string, ReportMetricDefinition>;

/** A field is only offered when it is genuinely usable in that position. */
export const isGroupable = (field: ReportFieldDefinition): boolean =>
  field.groupable === true && field.hidden !== true;

export const isFilterable = (field: ReportFieldDefinition): boolean =>
  field.filterable === true;

export const isSelectable = (field: ReportFieldDefinition): boolean =>
  field.reportable !== false && field.hidden !== true;

export const supportsAggregation = (
  field: ReportFieldDefinition,
  aggregation: ReportAggregation,
): boolean =>
  field.aggregatable === true &&
  (field.supportedAggregations ?? []).includes(aggregation);

export const READ_PRIVILEGE: SecurityPrivilege = 'READ' as SecurityPrivilege;
