import { AppError } from '../../../common/errors/app-error';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { getDataSource } from '../semantic/data-sources';
import {
  assertFieldVisible,
  planGroupBy,
  visibleFields,
} from '../engine/query-planner';
import {
  supportedOperators,
  type ReportFilterInput,
} from '../engine/filter.model';
import {
  isFilterable,
  isSelectable,
  supportsAggregation,
  type ReportAggregation,
} from '../semantic/semantic.types';
import { PERIOD_PRESETS, type PeriodPreset } from '../engine/period.engine';

/**
 * The stored shape of a custom report.
 *
 * Persisted as JSON on `ReportDefinition.configJson` rather than as six child
 * tables, because nothing ever queries *into* a report's shape — the engine
 * loads a whole definition or none of it — and a normalised design would turn
 * every save in the builder into a multi-statement diff. The tradeoff is that
 * JSON cannot be constrained by the database, which is precisely why this
 * validator exists and why it runs on **every execution**, not only on save.
 */
export interface ReportDefinitionConfig {
  columns: string[];
  filters: ReportFilterInput[];
  groupBy?: string;
  aggregations?: Array<{ field: string; aggregation: ReportAggregation }>;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  preset?: PeriodPreset;
  visualization?: 'table' | 'bar' | 'line' | 'donut';
}

/** A report may not select more columns than a person can read. */
export const MAX_COLUMNS = 40;
export const MAX_FILTERS = 25;

const invalid = (message: string, details?: unknown) =>
  new AppError('REPORT_DEFINITION_INVALID', { message, details });

/**
 * Validate a definition against the semantic registry for a specific user.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not repair. An unknown or now-forbidden column is rejected, not
 *   quietly dropped. Silently dropping a column changes what the report means
 *   without telling anyone; silently dropping a *filter* would widen the rows
 *   it returns, which is worse.
 * - It does not trust a previous validation. Access shrinks: someone builds a
 *   report including salary while they hold the permission, then loses it. If
 *   the definition were only checked at save time it would keep delivering
 *   salary to them — and, through a schedule, to other people — indefinitely.
 */
export function validateReportConfig(
  user: AuthenticatedUser,
  dataSourceKey: string,
  raw: unknown,
): ReportDefinitionConfig {
  const source = getDataSource(dataSourceKey);
  if (!source) {
    throw invalid(`Unknown reporting area: ${dataSourceKey}`, {
      dataSourceKey,
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalid('The report definition is malformed.');
  }
  const config = raw as Record<string, unknown>;

  // ── columns ──────────────────────────────────────────────────────────────
  const columns = config.columns;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw invalid('A report must select at least one column.');
  }
  if (columns.length > MAX_COLUMNS) {
    throw invalid(`A report may select at most ${MAX_COLUMNS} columns.`, {
      count: columns.length,
    });
  }
  const seen = new Set<string>();
  const validatedColumns = columns.map((column) => {
    if (typeof column !== 'string') {
      throw invalid('A column reference must be a field key.');
    }
    if (seen.has(column)) {
      throw invalid(`Column ${column} is selected more than once.`);
    }
    seen.add(column);
    const field = assertFieldVisible(source, user, column);
    if (!isSelectable(field)) {
      throw invalid(`${field.label} cannot be used as a column.`, {
        field: column,
      });
    }
    return column;
  });

  // ── filters ──────────────────────────────────────────────────────────────
  const rawFilters = config.filters ?? [];
  if (!Array.isArray(rawFilters)) {
    throw invalid('Report filters must be a list.');
  }
  if (rawFilters.length > MAX_FILTERS) {
    throw invalid(`A report may use at most ${MAX_FILTERS} filters.`);
  }
  const validatedFilters: ReportFilterInput[] = rawFilters.map((entry) => {
    if (entry === null || typeof entry !== 'object') {
      throw invalid('A report filter is malformed.');
    }
    const filter = entry as Record<string, unknown>;
    if (
      typeof filter.field !== 'string' ||
      typeof filter.operator !== 'string'
    ) {
      throw invalid('A report filter needs a field and an operator.');
    }
    const field = assertFieldVisible(source, user, filter.field);
    if (!isFilterable(field)) {
      throw invalid(`${field.label} cannot be filtered on.`, {
        field: filter.field,
      });
    }
    const operators = supportedOperators(field);
    if (!operators.includes(filter.operator as never)) {
      throw invalid(
        `${field.label} does not support the ${filter.operator} operator.`,
        { field: filter.field, allowed: operators },
      );
    }
    return {
      field: filter.field,
      operator: filter.operator as ReportFilterInput['operator'],
      value: filter.value,
      valueTo: filter.valueTo,
    };
  });

  // ── grouping ─────────────────────────────────────────────────────────────
  let groupBy: string | undefined;
  if (config.groupBy !== undefined && config.groupBy !== null) {
    if (typeof config.groupBy !== 'string') {
      throw invalid('The group-by must be a field key.');
    }
    // planGroupBy raises if the field is not visible, not groupable, or has no
    // scalar column to group on.
    planGroupBy(source, user, config.groupBy);
    groupBy = config.groupBy;
  }

  // ── aggregations ─────────────────────────────────────────────────────────
  let aggregations: ReportDefinitionConfig['aggregations'];
  if (config.aggregations !== undefined && config.aggregations !== null) {
    if (!Array.isArray(config.aggregations)) {
      throw invalid('Report aggregations must be a list.');
    }
    aggregations = config.aggregations.map((entry) => {
      if (entry === null || typeof entry !== 'object') {
        throw invalid('An aggregation is malformed.');
      }
      const aggregation = entry as Record<string, unknown>;
      if (
        typeof aggregation.field !== 'string' ||
        typeof aggregation.aggregation !== 'string'
      ) {
        throw invalid('An aggregation needs a field and a function.');
      }
      const field = assertFieldVisible(source, user, aggregation.field);
      if (
        !supportsAggregation(
          field,
          aggregation.aggregation as ReportAggregation,
        )
      ) {
        throw invalid(
          `${field.label} does not support ${aggregation.aggregation}.`,
          {
            field: aggregation.field,
            allowed: field.supportedAggregations ?? [],
          },
        );
      }
      return {
        field: aggregation.field,
        aggregation: aggregation.aggregation as ReportAggregation,
      };
    });
  }

  // ── sorting ──────────────────────────────────────────────────────────────
  let sortField: string | undefined;
  if (config.sortField !== undefined && config.sortField !== null) {
    if (typeof config.sortField !== 'string') {
      throw invalid('The sort field must be a field key.');
    }
    const field = assertFieldVisible(source, user, config.sortField);
    if (field.sortable !== true) {
      throw invalid(`${field.label} cannot be sorted on.`, {
        field: config.sortField,
      });
    }
    sortField = config.sortField;
  }
  const sortDirection = config.sortDirection === 'asc' ? 'asc' : 'desc';

  // ── period ───────────────────────────────────────────────────────────────
  let preset: PeriodPreset | undefined;
  if (config.preset !== undefined && config.preset !== null) {
    if (
      typeof config.preset !== 'string' ||
      !PERIOD_PRESETS.includes(config.preset as PeriodPreset)
    ) {
      throw invalid('Unsupported period for this report.');
    }
    preset = config.preset as PeriodPreset;
  }

  const visualization =
    config.visualization === 'bar' ||
    config.visualization === 'line' ||
    config.visualization === 'donut'
      ? config.visualization
      : 'table';

  return {
    columns: validatedColumns,
    filters: validatedFilters,
    groupBy,
    aggregations,
    sortField,
    sortDirection,
    preset,
    visualization,
  };
}

/**
 * Columns a user may add in the builder for a source.
 *
 * The builder must not offer a field the server would refuse — offering it and
 * then rejecting the save is how a user learns to distrust the tool.
 */
export function builderFields(user: AuthenticatedUser, dataSourceKey: string) {
  const source = getDataSource(dataSourceKey);
  if (!source) {
    throw invalid(`Unknown reporting area: ${dataSourceKey}`);
  }
  return visibleFields(source, user)
    .filter((field) => field.deprecated !== true)
    .map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description ?? '',
      type: field.type,
      filterable: field.filterable === true,
      sortable: field.sortable === true,
      groupable: field.groupable === true,
      aggregatable: field.aggregatable === true,
      supportedAggregations: field.supportedAggregations ?? [],
      supportedOperators: isFilterable(field) ? supportedOperators(field) : [],
      format: field.format ?? 'plain',
    }));
}
