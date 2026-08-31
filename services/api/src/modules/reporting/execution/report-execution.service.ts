import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AnalyticsService } from './analytics.service';
import { ReportDefinitionService } from './report-definition.service';
import {
  getStandardReport,
  listStandardReports,
} from './standard-report.registry';
import { MAX_EXPORT_ROWS } from '../engine/query-planner';
import type { ReportFilterInput } from '../engine/filter.model';
import type { ComparisonMode, PeriodPreset } from '../engine/period.engine';

/**
 * A report target, addressed the way favourites, schedules and runs address it.
 *
 * `std:<key>` is a code-defined standard report; `def:<uuid>` is a persisted
 * custom one. One canonical string rather than two nullable columns, because in
 * PostgreSQL a nullable composite unique does not constrain — NULLs compare
 * distinct, so `(user, null, null)` would not collide with itself.
 */
export type ReportTargetKey = string;

export const STANDARD_PREFIX = 'std:';
export const DEFINITION_PREFIX = 'def:';
export const SURFACE_PREFIX = 'srf:';

export interface ParsedTarget {
  kind: 'standard' | 'definition' | 'surface';
  id: string;
}

export function parseTargetKey(targetKey: string): ParsedTarget {
  if (targetKey.startsWith(STANDARD_PREFIX)) {
    return { kind: 'standard', id: targetKey.slice(STANDARD_PREFIX.length) };
  }
  if (targetKey.startsWith(DEFINITION_PREFIX)) {
    return {
      kind: 'definition',
      id: targetKey.slice(DEFINITION_PREFIX.length),
    };
  }
  if (targetKey.startsWith(SURFACE_PREFIX)) {
    return { kind: 'surface', id: targetKey.slice(SURFACE_PREFIX.length) };
  }
  throw new AppError('REPORT_NOT_FOUND', {
    message: `Unrecognised report reference: ${targetKey}`,
    details: { targetKey },
  });
}

export interface ReportRunParams {
  preset?: PeriodPreset;
  from?: string;
  to?: string;
  comparison?: ComparisonMode;
  filters?: ReportFilterInput[];
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ReportResultColumn {
  key: string;
  label: string;
  type: string;
  format: string;
}

export interface ReportResult {
  targetKey: string;
  name: string;
  description: string;
  sourceKey: string;
  columns: ReportResultColumn[];
  rows: Array<{
    id: string;
    href: string | null;
    values: Record<string, unknown>;
  }>;
  total: number;
  page: number;
  pageSize: number;
  caveats: string[];
  generatedAt: string;
}

/**
 * Runs a report — standard or custom — through the one query engine.
 *
 * Standard reports are code-defined and custom ones are persisted, but both are
 * resolved to the same shape here so that a row a user sees on screen, in an
 * export and in a scheduled email is produced by identical code. Nothing about
 * a stored definition is trusted: it is re-validated against the semantic
 * registry on every execution, because a definition outlives the access of
 * whoever saved it and a user's permissions can shrink after they save.
 */
@Injectable()
export class ReportExecutionService {
  private readonly logger = new Logger(ReportExecutionService.name);

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly definitions: ReportDefinitionService,
  ) {}

  /** Every report this user may run, standard and custom. */
  async library(user: AuthenticatedUser) {
    const catalog = await this.analytics.catalog(user);
    const reachableSources = new Set(catalog.map((source) => source.key));

    const standard = listStandardReports()
      .filter((report) => reachableSources.has(report.sourceKey))
      .map((report) => ({
        targetKey: `${STANDARD_PREFIX}${report.key}`,
        name: report.name,
        description: report.description,
        category: report.category,
        sourceKey: report.sourceKey,
        isStandard: true,
        canEdit: false,
        canDelete: false,
      }));

    const custom = (await this.definitions.listVisible(user))
      .filter((definition) => reachableSources.has(definition.dataSourceKey))
      .map((definition) => ({
        targetKey: `${DEFINITION_PREFIX}${definition.id}`,
        name: definition.name,
        description: definition.description ?? '',
        category: definition.category,
        sourceKey: definition.dataSourceKey,
        isStandard: false,
        canEdit: definition.canEdit,
        canDelete: definition.canDelete,
        ownerUserId: definition.ownerUserId,
        updatedAt: definition.updatedAt,
      }));

    return { standard, custom };
  }

  async run(
    user: AuthenticatedUser,
    targetKey: string,
    params: ReportRunParams = {},
  ): Promise<ReportResult> {
    const target = parseTargetKey(targetKey);

    if (target.kind === 'surface') {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'An analytics surface cannot be run as a tabular report.',
        details: { targetKey },
      });
    }

    const spec =
      target.kind === 'standard'
        ? this.standardSpec(target.id)
        : await this.definitionSpec(user, target.id);

    // Definition filters and caller filters are concatenated, never replaced: a
    // saved report's own predicate must not be removable by a caller passing an
    // empty filter list.
    const filters = [...(spec.filters ?? []), ...(params.filters ?? [])];

    const result = await this.analytics.records(user, {
      sourceKey: spec.sourceKey,
      preset: params.preset ?? spec.preset ?? 'last_30_days',
      from: params.from,
      to: params.to,
      filters,
      fields: spec.columns,
      page: params.page,
      pageSize: params.pageSize,
      sortField: params.sortField ?? spec.sortField,
      sortDirection: params.sortDirection ?? spec.sortDirection,
      applyPeriod: spec.appliesPeriod,
    });

    return {
      targetKey,
      name: spec.name,
      description: spec.description,
      sourceKey: spec.sourceKey,
      columns: result.columns,
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      caveats: spec.caveats,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Every row of a report, for an export.
   *
   * Paged internally rather than fetched in one query, and hard-capped: an
   * unbounded export is how a reporting feature becomes an outage. The cap
   * refuses rather than silently truncating — `data-management`'s exporter
   * takes 10,000 rows and says nothing, which produces a file that looks
   * complete and is not.
   */
  async runAll(
    user: AuthenticatedUser,
    targetKey: string,
    params: ReportRunParams = {},
  ): Promise<ReportResult> {
    const pageSize = 200;
    let page = 1;
    const rows: ReportResult['rows'] = [];
    let first: ReportResult | null = null;

    for (;;) {
      const chunk = await this.run(user, targetKey, {
        ...params,
        page,
        pageSize,
      });
      first ??= chunk;

      if (chunk.total > MAX_EXPORT_ROWS) {
        throw new AppError('REPORT_EXPORT_TOO_LARGE', {
          message: `This report returns ${chunk.total.toLocaleString('en-US')} rows, which is more than the ${MAX_EXPORT_ROWS.toLocaleString('en-US')} an export may contain. Narrow the period or add a filter.`,
          details: { total: chunk.total, maximum: MAX_EXPORT_ROWS },
        });
      }

      rows.push(...chunk.rows);
      if (rows.length >= chunk.total || chunk.rows.length === 0) break;
      page += 1;
    }

    if (!first) {
      throw new AppError('REPORT_EXPORT_FAILED', {
        message: 'The report produced no result to export.',
      });
    }

    return {
      ...first,
      rows,
      page: 1,
      pageSize: rows.length,
      total: rows.length,
    };
  }

  private standardSpec(key: string) {
    const report = getStandardReport(key);
    if (!report) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: `Unknown standard report: ${key}`,
        details: { report: key },
      });
    }
    return {
      name: report.name,
      description: report.description,
      sourceKey: report.sourceKey,
      columns: report.columns,
      filters: report.filters,
      preset: report.preset,
      sortField: report.sortField,
      sortDirection: report.sortDirection,
      appliesPeriod: report.appliesPeriod,
      caveats: report.caveats ?? [],
    };
  }

  private async definitionSpec(user: AuthenticatedUser, id: string) {
    const definition = await this.definitions.getForExecution(user, id);
    return {
      name: definition.name,
      description: definition.description ?? '',
      sourceKey: definition.dataSourceKey,
      columns: definition.config.columns,
      filters: definition.config.filters,
      preset: definition.config.preset,
      sortField: definition.config.sortField,
      sortDirection: definition.config.sortDirection,
      // A custom report always honours its period; only the code-defined
      // standard reports declare otherwise.
      appliesPeriod: true,
      caveats: [],
    };
  }
}
