import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { getDataSource, listDataSources } from '../semantic/data-sources';
import { getMetric, listMetricsForSource } from '../metrics/metric.registry';
import type {
  ReportDataSource,
  ReportDimensionValue,
  ReportMetricDefinition,
} from '../semantic/semantic.types';
import { ReportQueryExecutor } from '../engine/query-executor';
import { ReportScopeResolver } from '../engine/scope.resolver';
import {
  planGroupBy,
  planPagination,
  planSelect,
  planWhere,
  readFieldValue,
  visibleFields,
} from '../engine/query-planner';
import {
  applySuppression,
  isPopulationSufficient,
  minimumPopulationFor,
  SUPPRESSION_LABEL,
} from '../engine/population-threshold';
import {
  buildBuckets,
  resolveComparison,
  resolvePeriod,
  suggestGranularity,
  type ComparisonMode,
  type Granularity,
  type PeriodPreset,
  type ResolvedPeriod,
} from '../engine/period.engine';
import type { ReportFilterInput } from '../engine/filter.model';

export interface AnalyticsQueryInput {
  sourceKey: string;
  preset?: PeriodPreset;
  from?: string;
  to?: string;
  comparison?: ComparisonMode;
  filters?: ReportFilterInput[];
  metricKeys?: string[];
  breakdown?: string;
  trendMetricKey?: string;
  granularity?: Granularity;
}

export interface AnalyticsMetricResult {
  key: string;
  label: string;
  description: string;
  value: number | null;
  comparisonValue: number | null;
  delta: number | null;
  deltaPercent: number | null;
  format: string;
  direction: string;
  caveats: string[];
  suppressed: boolean;
}

export interface AnalyticsResult {
  source: { key: string; label: string; description: string };
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
  metrics: AnalyticsMetricResult[];
  breakdown: {
    field: string;
    label: string;
    values: ReportDimensionValue[];
    suppressed: boolean;
    suppressedBuckets: number;
    suppressionLabel: string;
  } | null;
  trend: {
    metricKey: string;
    granularity: Granularity;
    points: Array<{ key: string; label: string; value: number | null }>;
  } | null;
  caveats: string[];
  /** How wide the caller's row scope is, so the UI can say whose data this is. */
  accessLevel: string;
}

/**
 * Orchestrates an analytics request.
 *
 * Every number on every analytics surface comes through here, which is the
 * point: the dashboard, a KPI tile, a drill-down, an export and a scheduled
 * delivery must not be able to disagree about what a metric means. A caller
 * names a metric; it never supplies a calculation.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly executor: ReportQueryExecutor,
    private readonly scope: ReportScopeResolver,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  /** Sources this user may reach, with their permitted fields and metrics. */
  async catalog(user: AuthenticatedUser) {
    const sources = listDataSources().filter((source) =>
      this.scope.hasAnyAccess(user, source),
    );

    return sources.map((source) => ({
      key: source.key,
      label: source.label,
      description: source.description,
      caveats: source.caveats ?? [],
      accessLevel: this.scope.effectiveLevel(user, source),
      fields: visibleFields(source, user).map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description ?? '',
        type: field.type,
        filterable: field.filterable === true,
        sortable: field.sortable === true,
        groupable: field.groupable === true,
        aggregatable: field.aggregatable === true,
        supportedAggregations: field.supportedAggregations ?? [],
        format: field.format ?? 'plain',
      })),
      metrics: listMetricsForSource(source.key)
        .filter((metric) => this.canSeeMetric(user, metric))
        .map((metric) => ({
          key: metric.key,
          label: metric.label,
          description: metric.description,
          format: metric.format ?? 'plain',
          direction: metric.direction ?? 'neutral',
          supportedDimensions: metric.supportedDimensions,
          caveats: metric.caveats ?? [],
        })),
    }));
  }

  async query(
    user: AuthenticatedUser,
    input: AnalyticsQueryInput,
  ): Promise<AnalyticsResult> {
    const source = this.resolveSource(user, input.sourceKey);
    const timezone = await this.timezone(user);

    const period = resolvePeriod({
      preset: input.preset ?? 'last_30_days',
      from: input.from,
      to: input.to,
      timezone,
    });
    const comparison = resolveComparison(period, input.comparison ?? 'none');

    const scopeWhere = this.scope.buildWhere(user, source);
    const baseArgs = {
      source,
      user,
      scopeWhere,
      filters: input.filters ?? [],
    };

    const where = planWhere({ ...baseArgs, period });
    const comparisonWhere = comparison.period
      ? planWhere({ ...baseArgs, period: comparison.period })
      : null;

    const metrics = this.resolveMetrics(user, source, input.metricKeys);

    // Suppression is decided from the population the query actually reaches,
    // not from the tenant's total: a filtered view of four people is as
    // identifying as a tenant of four.
    const minimumPopulation = minimumPopulationFor(source.key);
    const population =
      minimumPopulation > 0 ? await this.executor.count(source, where) : 0;
    const populationSufficient = isPopulationSufficient(
      population,
      minimumPopulation,
    );

    const metricResults = await Promise.all(
      metrics.map(async (metric) => {
        if (!populationSufficient) {
          return this.suppressedMetric(metric);
        }
        const [value, comparisonValue] = await Promise.all([
          this.executor.metricValue(source, metric, where),
          comparisonWhere
            ? this.executor.metricValue(source, metric, comparisonWhere)
            : Promise.resolve(null),
        ]);
        return this.toMetricResult(metric, value, comparisonValue);
      }),
    );

    const breakdown =
      input.breakdown && populationSufficient
        ? await this.buildBreakdown(
            user,
            source,
            metrics[0],
            where,
            comparisonWhere,
            input.breakdown,
            minimumPopulation,
          )
        : null;

    const trend =
      input.trendMetricKey && populationSufficient
        ? await this.buildTrend(
            source,
            metrics,
            baseArgs,
            period,
            input.trendMetricKey,
            input.granularity ?? suggestGranularity(period),
          )
        : null;

    return {
      source: {
        key: source.key,
        label: source.label,
        description: source.description,
      },
      period,
      comparisonPeriod: comparison.period,
      metrics: metricResults,
      breakdown,
      trend,
      caveats: this.collectCaveats(source, metrics, populationSufficient),
      accessLevel: this.scope.effectiveLevel(user, source),
    };
  }

  /** Underlying records behind a metric or a breakdown bucket. */
  async records(
    user: AuthenticatedUser,
    input: AnalyticsQueryInput & {
      fields?: string[];
      page?: number;
      pageSize?: number;
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
    },
  ) {
    const source = this.resolveSource(user, input.sourceKey);
    const timezone = await this.timezone(user);
    const period = resolvePeriod({
      preset: input.preset ?? 'last_30_days',
      from: input.from,
      to: input.to,
      timezone,
    });

    const scopeWhere = this.scope.buildWhere(user, source);
    const where = planWhere({
      source,
      user,
      scopeWhere,
      period,
      filters: input.filters ?? [],
    });

    const permitted = visibleFields(source, user);
    const requested =
      input.fields && input.fields.length > 0
        ? input.fields
        : permitted.slice(0, 8).map((field) => field.key);

    const select = planSelect(source, user, requested);
    const { page, pageSize, skip, take } = planPagination(
      input.page,
      input.pageSize,
    );

    let orderBy: Record<string, unknown> | undefined;
    if (input.sortField) {
      const field = permitted.find(
        (candidate) => candidate.key === input.sortField,
      );
      if (field && field.sortable && (field.relationPath ?? []).length === 0) {
        orderBy = { [field.path]: input.sortDirection === 'asc' ? 'asc' : 'desc' };
      }
    }

    const { rows, total } = await this.executor.records(
      source,
      where,
      select,
      orderBy,
      skip,
      take,
    );

    const fieldsByKey = new Map(permitted.map((field) => [field.key, field]));
    const idField = source.recordIdField ?? 'id';

    return {
      columns: requested.map((key) => {
        const field = fieldsByKey.get(key);
        return {
          key,
          label: field?.label ?? key,
          type: field?.type ?? 'string',
          format: field?.format ?? 'plain',
        };
      }),
      rows: rows.map((row) => {
        const id = String(row[idField] ?? '');
        const values: Record<string, unknown> = {};
        for (const key of requested) {
          const field = fieldsByKey.get(key);
          values[key] = field ? readFieldValue(row, field) : null;
        }
        return {
          id,
          href: source.recordHrefTemplate
            ? source.recordHrefTemplate.replace('{id}', id)
            : null,
          values,
        };
      }),
      // The real total for this filtered, scoped query — not the page length.
      // Reporting the loaded row count as the total is a defect this product
      // has already shipped once (BUG-2043).
      total,
      page,
      pageSize,
    };
  }

  private resolveSource(
    user: AuthenticatedUser,
    key: string,
  ): ReportDataSource {
    const source = getDataSource(key);
    if (!source) {
      throw new AppError('REPORT_SOURCE_UNKNOWN', {
        message: `Unknown reporting area: ${key}`,
        details: { source: key },
      });
    }
    if (!this.scope.hasAnyAccess(user, source)) {
      // Deliberately distinct from "unknown": the caller is allowed to know the
      // area exists, and telling them they lack access is more useful than a
      // silently empty chart.
      throw new AppError('REPORT_SOURCE_FORBIDDEN', {
        message: `You do not have access to ${source.label}.`,
        details: { source: key },
      });
    }
    return source;
  }

  private resolveMetrics(
    user: AuthenticatedUser,
    source: ReportDataSource,
    keys?: string[],
  ): ReportMetricDefinition[] {
    const available = listMetricsForSource(source.key).filter((metric) =>
      this.canSeeMetric(user, metric),
    );

    if (!keys || keys.length === 0) return available.slice(0, 4);

    return keys.map((key) => {
      const metric = getMetric(key);
      if (!metric || metric.dataSourceKey !== source.key) {
        throw new AppError('REPORT_FIELD_UNKNOWN', {
          message: `Unknown metric: ${key}`,
          details: { metric: key },
        });
      }
      if (!this.canSeeMetric(user, metric)) {
        throw new AppError('REPORT_FIELD_FORBIDDEN', {
          message: `Metric is not available to you: ${key}`,
          details: { metric: key },
        });
      }
      return metric;
    });
  }

  private canSeeMetric(
    user: AuthenticatedUser,
    metric: ReportMetricDefinition,
  ): boolean {
    if (!metric.permission) return true;
    return (user.permissionKeys ?? []).includes(metric.permission);
  }

  private async buildBreakdown(
    user: AuthenticatedUser,
    source: ReportDataSource,
    metric: ReportMetricDefinition | undefined,
    where: Record<string, unknown>,
    comparisonWhere: Record<string, unknown> | null,
    breakdownKey: string,
    minimumPopulation: number,
  ) {
    if (!metric) return null;

    const group = planGroupBy(source, user, breakdownKey);
    const { values, populations } = await this.executor.breakdown(
      source,
      metric,
      where,
      group,
    );

    if (comparisonWhere) {
      const previous = await this.executor.breakdown(
        source,
        metric,
        comparisonWhere,
        group,
      );
      const previousByKey = new Map(
        previous.values.map((value) => [value.key, value.value]),
      );
      for (const value of values) {
        value.comparisonValue = previousByKey.get(value.key) ?? 0;
      }
    }

    const suppression = applySuppression(values, populations, minimumPopulation);

    return {
      field: group.field.key,
      label: group.field.label,
      values: suppression.values,
      suppressed: suppression.suppressed,
      suppressedBuckets: suppression.suppressedBuckets,
      suppressionLabel: SUPPRESSION_LABEL,
    };
  }

  private async buildTrend(
    source: ReportDataSource,
    metrics: ReportMetricDefinition[],
    baseArgs: {
      source: ReportDataSource;
      user: AuthenticatedUser;
      scopeWhere: Record<string, unknown>;
      filters: ReportFilterInput[];
    },
    period: ResolvedPeriod,
    metricKey: string,
    granularity: Granularity,
  ) {
    const metric = metrics.find((candidate) => candidate.key === metricKey);
    if (!metric) return null;

    const buckets = buildBuckets(period, granularity);

    // Sequential rather than parallel on purpose: a year at daily granularity
    // is 365 buckets, and firing that many aggregates at once is how a
    // reporting screen takes a connection pool down.
    const points: Array<{ key: string; label: string; value: number | null }> = [];
    for (const bucket of buckets) {
      const bucketPeriod: ResolvedPeriod = {
        from: bucket.from,
        to: bucket.to,
        preset: 'custom',
        timezone: period.timezone,
        days: 1,
      };
      const bucketWhere = planWhere({ ...baseArgs, period: bucketPeriod });
      const value = await this.executor.metricValue(source, metric, bucketWhere);
      points.push({ key: bucket.key, label: bucket.label, value });
    }

    return { metricKey: metric.key, granularity, points };
  }

  private toMetricResult(
    metric: ReportMetricDefinition,
    value: number | null,
    comparisonValue: number | null,
  ): AnalyticsMetricResult {
    const delta =
      value !== null && comparisonValue !== null ? value - comparisonValue : null;
    // A percentage change against zero is not infinite, it is undefined —
    // rendering "+∞%" or "+100%" against a zero baseline is a lie either way.
    const deltaPercent =
      delta !== null && comparisonValue !== null && comparisonValue !== 0
        ? (delta / Math.abs(comparisonValue)) * 100
        : null;

    return {
      key: metric.key,
      label: metric.label,
      description: metric.description,
      value,
      comparisonValue,
      delta,
      deltaPercent,
      format: metric.format ?? 'plain',
      direction: metric.direction ?? 'neutral',
      caveats: metric.caveats ?? [],
      suppressed: false,
    };
  }

  private suppressedMetric(
    metric: ReportMetricDefinition,
  ): AnalyticsMetricResult {
    return {
      key: metric.key,
      label: metric.label,
      description: metric.description,
      value: null,
      comparisonValue: null,
      delta: null,
      deltaPercent: null,
      format: metric.format ?? 'plain',
      direction: metric.direction ?? 'neutral',
      caveats: [...(metric.caveats ?? []), SUPPRESSION_LABEL],
      suppressed: true,
    };
  }

  private collectCaveats(
    source: ReportDataSource,
    metrics: ReportMetricDefinition[],
    populationSufficient: boolean,
  ): string[] {
    const caveats = new Set<string>(source.caveats ?? []);
    for (const metric of metrics) {
      for (const caveat of metric.caveats ?? []) caveats.add(caveat);
    }
    if (!populationSufficient) caveats.add(SUPPRESSION_LABEL);
    return [...caveats];
  }

  private async timezone(user: AuthenticatedUser): Promise<string> {
    try {
      const settings = await this.tenantSettings.getOrganizationSettings(
        user.tenantId,
      );
      return settings.timezone || 'UTC';
    } catch (error) {
      // A missing settings row must not take a report down; UTC is the same
      // fallback the resolver itself uses.
      this.logger.warn(
        `reporting.timezone.fallback tenant=${user.tenantId} reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return 'UTC';
    }
  }
}
