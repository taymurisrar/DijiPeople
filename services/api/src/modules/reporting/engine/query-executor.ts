import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ReportDataSource,
  ReportDimensionValue,
  ReportMetricDefinition,
} from '../semantic/semantic.types';
import {
  fieldMap,
  MAX_BREAKDOWN_BUCKETS,
  type PlannedGroupBy,
} from './query-planner';
import { buildFilterPredicate, combinePredicates } from './filter.model';
import type { ReportFilterOperator } from '../semantic/semantic.types';

/**
 * Executes a planned reporting query against Prisma.
 *
 * The planner decides *what* to ask; this decides *how*, and owns two things
 * that are easy to get quietly wrong:
 *
 * - **A ratio is a ratio of sums, never an average of ratios.** Averaging
 *   per-row percentages across employees is a ratio of ratios and is simply a
 *   different, wrong number. `DailyProductivitySummary.utilizationPercent` is
 *   the live example: `AVG(utilizationPercent)` over ten employees is not the
 *   team's active share.
 * - **A breakdown groups by a scalar and resolves labels afterwards.** Prisma
 *   `groupBy` cannot reach through a relation, so "by department" is
 *   `groupBy(['departmentId'])` plus a lookup — which is also why a null
 *   foreign key needs an explicit label rather than disappearing.
 */
@Injectable()
export class ReportQueryExecutor {
  private readonly logger = new Logger(ReportQueryExecutor.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the Prisma delegate for a source, or fail loudly. */
  private delegate(source: ReportDataSource): PrismaDelegate {
    const client = this.prisma as unknown as Record<string, unknown>;
    const delegate = client[source.prismaModel];
    if (!delegate || typeof delegate !== 'object') {
      // A registry defect, not user input — the model name is ours.
      throw new AppError('REPORT_SOURCE_UNKNOWN', {
        message: `Reporting model is not available: ${source.prismaModel}`,
      });
    }
    return delegate as PrismaDelegate;
  }

  async count(
    source: ReportDataSource,
    where: Record<string, unknown>,
  ): Promise<number> {
    return this.delegate(source).count({ where });
  }

  /**
   * The value of one metric over one `where`.
   *
   * Returns `null` rather than `0` when there is genuinely nothing to divide —
   * an empty denominator is "not applicable", and charting it as zero invents a
   * data point.
   */
  async metricValue(
    source: ReportDataSource,
    metric: ReportMetricDefinition,
    where: Record<string, unknown>,
  ): Promise<number | null> {
    const delegate = this.delegate(source);
    const calculation = metric.calculation;

    switch (calculation.kind) {
      case 'count':
        return delegate.count({ where });

      case 'point_in_time_count': {
        const onLatest = await this.restrictToLatestDate(
          source,
          calculation.dateField,
          where,
        );
        if (!onLatest) return null;
        return delegate.count({ where: onLatest });
      }

      case 'filtered_count':
        return delegate.count({
          where: {
            AND: [where, this.resolveMetricWhere(source, calculation.where)],
          },
        });

      case 'count_distinct': {
        const column = this.column(source, calculation.field);
        const groups = await delegate.groupBy({
          by: [column],
          where,
        });
        return groups.length;
      }

      case 'sum': {
        const column = this.column(source, calculation.field);
        const result = await delegate.aggregate({
          where,
          _sum: { [column]: true },
        });
        return toNumber(result._sum?.[column]) ?? 0;
      }

      case 'avg': {
        const column = this.column(source, calculation.field);
        const result = await delegate.aggregate({
          where,
          _avg: { [column]: true },
        });
        return toNumber(result._avg?.[column]);
      }

      case 'ratio': {
        const numerator = this.column(source, calculation.numerator);
        const denominator = this.column(source, calculation.denominator);
        const result = await delegate.aggregate({
          where,
          _sum: { [numerator]: true, [denominator]: true },
        });
        const top = toNumber(result._sum?.[numerator]) ?? 0;
        const bottom = toNumber(result._sum?.[denominator]) ?? 0;
        if (bottom === 0) return null;
        const ratio = top / bottom;
        return calculation.asPercent ? ratio * 100 : ratio;
      }

      case 'derived':
        // Composed by the caller from its dependencies.
        return null;

      default: {
        const exhaustive: never = calculation;
        throw new AppError('REPORT_DEFINITION_INVALID', {
          message: `Unsupported metric calculation: ${JSON.stringify(exhaustive)}`,
        });
      }
    }
  }

  /**
   * Narrow a where to the latest date it actually contains.
   *
   * Two queries rather than reusing the period end, because the last day of a
   * period routinely holds no rows: the snapshot worker captures YESTERDAY, so
   * asking for today would report a headcount of zero every morning.
   *
   * Returns null when the period contains no rows at all, which the callers
   * render as "no data" rather than as zero.
   */
  private async restrictToLatestDate(
    source: ReportDataSource,
    dateField: string,
    where: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const column = this.column(source, dateField);
    const latest = await this.delegate(source).aggregate({
      where,
      _max: { [column]: true },
    });

    const on = latest._max?.[column];
    if (on === null || on === undefined) return null;

    return { AND: [where, { [column]: on }] };
  }

  /**
   * One metric, grouped by one dimension.
   *
   * Buckets come back sorted by value descending and capped, because a
   * high-cardinality dimension (manager, employee) would otherwise return
   * thousands of rows to draw a chart nobody can read.
   */
  async breakdown(
    source: ReportDataSource,
    metric: ReportMetricDefinition,
    where: Record<string, unknown>,
    group: PlannedGroupBy,
  ): Promise<{
    values: ReportDimensionValue[];
    populations: Map<string, number>;
  }> {
    const delegate = this.delegate(source);
    const column = group.column;
    const calculation = metric.calculation;

    // A point-in-time metric must narrow to one date here too, or "headcount by
    // department" silently becomes "employee-days by department" — the same
    // defect as the scalar tile, drawn as a chart instead of printed as a
    // number.
    const latestDateWhere =
      calculation.kind === 'point_in_time_count'
        ? await this.restrictToLatestDate(source, calculation.dateField, where)
        : null;

    // A filtered_count metric carries its own predicate, and a breakdown must
    // apply it too. Grouping on the base `where` alone would silently turn
    // "active headcount by department" into "headcount by department" — a
    // plausible chart with the wrong numbers, which is worse than an error.
    const groupWhere =
      calculation.kind === 'filtered_count'
        ? { AND: [where, this.resolveMetricWhere(source, calculation.where)] }
        : (latestDateWhere ?? where);

    // count_distinct groups by the dimension AND the counted column, so each
    // bucket's size is its number of distinct values rather than its row count.
    const distinctColumn =
      calculation.kind === 'count_distinct'
        ? this.column(source, calculation.field)
        : null;

    const aggregateArgs: Record<string, unknown> = {
      by:
        distinctColumn && distinctColumn !== column
          ? [column, distinctColumn]
          : [column],
      where: groupWhere,
      _count: { _all: true },
    };

    if (calculation.kind === 'sum' || calculation.kind === 'avg') {
      const target = this.column(source, calculation.field);
      aggregateArgs[calculation.kind === 'sum' ? '_sum' : '_avg'] = {
        [target]: true,
      };
    } else if (calculation.kind === 'ratio') {
      aggregateArgs._sum = {
        [this.column(source, calculation.numerator)]: true,
        [this.column(source, calculation.denominator)]: true,
      };
    }

    const groups: GroupRow[] = await delegate.groupBy(aggregateArgs);

    const populations = new Map<string, number>();

    // With a distinct column in the `by` list, one bucket spans several rows —
    // one per distinct value — so they are folded back together here and the
    // bucket's value is how many rows it had.
    const collapsed: GroupRow[] =
      distinctColumn && distinctColumn !== column
        ? Object.values(
            groups.reduce<Record<string, GroupRow>>((acc, row) => {
              const bucket = scalarKey(row[column]) ?? NULL_KEY;
              const existing = acc[bucket];
              if (existing) {
                existing._count = {
                  _all: (existing._count?._all ?? 0) + 1,
                };
              } else {
                acc[bucket] = { ...row, _count: { _all: 1 } };
              }
              return acc;
            }, {}),
          )
        : groups;

    const raw = collapsed.map((row) => {
      const rawKey = row[column];
      const key = scalarKey(rawKey) ?? NULL_KEY;
      populations.set(key, row._count?._all ?? 0);

      let value: number;
      switch (calculation.kind) {
        case 'sum':
          value =
            toNumber(row._sum?.[this.column(source, calculation.field)]) ?? 0;
          break;
        case 'avg':
          value =
            toNumber(row._avg?.[this.column(source, calculation.field)]) ?? 0;
          break;
        case 'ratio': {
          const top =
            toNumber(row._sum?.[this.column(source, calculation.numerator)]) ??
            0;
          const bottom =
            toNumber(
              row._sum?.[this.column(source, calculation.denominator)],
            ) ?? 0;
          value =
            bottom === 0
              ? 0
              : (top / bottom) * (calculation.asPercent ? 100 : 1);
          break;
        }
        default:
          value = row._count?._all ?? 0;
      }

      return { key, value };
    });

    const labelled = await this.resolveLabels(source, group, raw);

    labelled.sort((a, b) => b.value - a.value);
    const capped = labelled.slice(0, MAX_BREAKDOWN_BUCKETS);

    return { values: capped, populations };
  }

  /**
   * Turn grouped scalars into human labels.
   *
   * One lookup query for the whole bucket set, not one per bucket — the naive
   * version is an N+1 that only shows up on a tenant large enough to matter.
   */
  private async resolveLabels(
    source: ReportDataSource,
    group: PlannedGroupBy,
    rows: Array<{ key: string; value: number }>,
  ): Promise<ReportDimensionValue[]> {
    const lookup = group.field.labelLookup;
    const nullLabel = group.field.nullLabel ?? 'Unassigned';

    if (!lookup) {
      return rows.map((row) => ({
        key: row.key,
        label: row.key === NULL_KEY ? nullLabel : humanise(row.key),
        value: row.value,
      }));
    }

    const ids = rows.map((row) => row.key).filter((key) => key !== NULL_KEY);

    const client = this.prisma as unknown as Record<string, unknown>;
    const lookupDelegate = client[lookup.model] as PrismaDelegate | undefined;

    if (!lookupDelegate || ids.length === 0) {
      return rows.map((row) => ({
        key: row.key,
        label: row.key === NULL_KEY ? nullLabel : row.key,
        value: row.value,
      }));
    }

    const records: Array<Record<string, unknown>> =
      await lookupDelegate.findMany({
        where: { [lookup.valueField]: { in: ids } },
        select: { [lookup.valueField]: true, [lookup.labelField]: true },
      });

    const labels = new Map(
      records.map((record) => [
        String(record[lookup.valueField]),
        scalarKey(record[lookup.labelField]) ?? '',
      ]),
    );

    return rows.map((row) => ({
      key: row.key,
      label:
        row.key === NULL_KEY ? nullLabel : (labels.get(row.key) ?? 'Unknown'),
      value: row.value,
    }));
  }

  /** Page of underlying records for drill-down. */
  async records(
    source: ReportDataSource,
    where: Record<string, unknown>,
    select: Record<string, unknown>,
    orderBy: Record<string, unknown> | undefined,
    skip: number,
    take: number,
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const delegate = this.delegate(source);
    const [rows, total] = await Promise.all([
      delegate.findMany({ where, select, orderBy, skip, take }),
      delegate.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * Translate a metric's own filter from semantic terms into Prisma.
   *
   * The metric registry writes its predicates the way a report author would —
   * `{ 'workforce.employment_status': { eq: 'ACTIVE' } }` — rather than in
   * Prisma column names. That is the right way round: a metric is a business
   * definition, and pinning it to a column name would put schema knowledge in
   * two places and break silently when a path changed.
   *
   * The translation goes through `buildFilterPredicate`, the same function that
   * resolves a user's filters, so a metric cannot express a predicate a user
   * could not — including reaching a column the field registry does not declare.
   */
  private resolveMetricWhere(
    source: ReportDataSource,
    clause: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolved = resolveRelativeTokens(clause);
    const fields = fieldMap(source);
    const predicates: Record<string, unknown>[] = [];

    for (const [key, condition] of Object.entries(resolved)) {
      // A raw Prisma fragment passes through untouched, so a metric can still
      // express something the filter vocabulary cannot.
      if (key === 'AND' || key === 'OR' || key === 'NOT') {
        predicates.push({ [key]: condition });
        continue;
      }

      const field = fields.get(key);
      if (!field) {
        predicates.push({ [key]: condition });
        continue;
      }

      if (condition === null || typeof condition !== 'object') {
        predicates.push(
          buildFilterPredicate(source, field, {
            field: key,
            operator: 'eq',
            value: condition,
          }),
        );
        continue;
      }

      for (const [operator, value] of Object.entries(
        condition as Record<string, unknown>,
      )) {
        predicates.push(
          buildFilterPredicate(source, field, {
            field: key,
            operator: operator as ReportFilterOperator,
            value,
          }),
        );
      }
    }

    return combinePredicates(predicates);
  }

  /**
   * The scalar column a calculation names.
   *
   * Aggregation cannot reach through a relation in Prisma, so a metric may only
   * aggregate a column on its own model. Rejecting this here turns a registry
   * mistake into a clear error rather than an opaque Prisma failure.
   */
  private column(source: ReportDataSource, fieldKey: string): string {
    const field = fieldMap(source).get(fieldKey);
    if (!field) {
      throw new AppError('REPORT_FIELD_UNKNOWN', {
        message: `Metric references an unknown field: ${fieldKey}`,
        details: { field: fieldKey },
      });
    }
    if ((field.relationPath ?? []).length > 0 || field.path.includes('.')) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: `${field.label} cannot be aggregated because it is not a column on ${source.label}.`,
        details: { field: fieldKey },
      });
    }
    return field.path;
  }
}

/**
 * Render a grouped scalar as a bucket key.
 *
 * Prisma returns a `groupBy` key as `unknown` to the caller, but the column is
 * always a scalar — a uuid, an enum member, a boolean or a date. Narrowing here
 * keeps `String()` off values that would stringify as "[object Object]", which
 * would silently collapse every such row into one bucket.
 */
function scalarKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return null;
}

export const NULL_KEY = '__null__';

/** The one relative-date token a metric may embed in a filter clause. */
export const RELATIVE_NOW_TOKEN = '$NOW';

/**
 * Replace `$NOW` with the instant the query runs.
 *
 * A metric like "employees currently on leave" is an as-of-this-instant
 * question, not a period question: narrowing a period to "now" would ask
 * something different and get a different answer. The token is resolved here,
 * once per query, so every clause in the same metric sees the same instant —
 * resolving it per clause would let a query straddle midnight and contradict
 * itself.
 *
 * It is a registry-authored token, never user input. A client cannot introduce
 * one: filter values arrive through `filter.model.ts`, which coerces a date
 * operand with `new Date(...)` and rejects anything unparseable.
 */
export function resolveRelativeTokens(
  clause: Record<string, unknown>,
  now: Date = new Date(),
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (node === RELATIVE_NOW_TOKEN) return now;
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    if (node instanceof Date) return node;
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        walk(value),
      ]),
    );
  };
  return walk(clause) as Record<string, unknown>;
}

interface PrismaDelegate {
  count(args: Record<string, unknown>): Promise<number>;
  aggregate(args: Record<string, unknown>): Promise<AggregateRow>;
  groupBy(args: Record<string, unknown>): Promise<GroupRow[]>;
  findMany(
    args: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>>;
}

interface AggregateRow {
  _sum?: Record<string, unknown>;
  _avg?: Record<string, unknown>;
  /** Used by `point_in_time_count` to find the latest date in a period. */
  _max?: Record<string, unknown>;
  _count?: { _all?: number };
}

type GroupRow = AggregateRow & Record<string, unknown>;

/**
 * Prisma returns `Decimal` for money and percent columns and `null` for an
 * empty aggregate. Coercing through `Number` rather than trusting the shape
 * keeps a `Decimal` from being serialised as an object into a chart.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
