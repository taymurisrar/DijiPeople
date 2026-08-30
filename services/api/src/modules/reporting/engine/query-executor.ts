import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type {
  ReportDataSource,
  ReportDimensionValue,
  ReportMetricDefinition,
} from '../semantic/semantic.types';
import { fieldMap, MAX_BREAKDOWN_BUCKETS, type PlannedGroupBy } from './query-planner';

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

      case 'filtered_count':
        return delegate.count({
          where: { AND: [where, calculation.where] },
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
  ): Promise<{ values: ReportDimensionValue[]; populations: Map<string, number> }> {
    const delegate = this.delegate(source);
    const column = group.column;
    const calculation = metric.calculation;

    const aggregateArgs: Record<string, unknown> = {
      by: [column],
      where,
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
    const raw = groups.map((row) => {
      const rawKey = row[column];
      const key = rawKey === null || rawKey === undefined ? NULL_KEY : String(rawKey);
      populations.set(key, row._count?._all ?? 0);

      let value: number;
      switch (calculation.kind) {
        case 'sum':
          value = toNumber(row._sum?.[this.column(source, calculation.field)]) ?? 0;
          break;
        case 'avg':
          value = toNumber(row._avg?.[this.column(source, calculation.field)]) ?? 0;
          break;
        case 'ratio': {
          const top =
            toNumber(row._sum?.[this.column(source, calculation.numerator)]) ?? 0;
          const bottom =
            toNumber(row._sum?.[this.column(source, calculation.denominator)]) ?? 0;
          value = bottom === 0 ? 0 : (top / bottom) * (calculation.asPercent ? 100 : 1);
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

    const ids = rows
      .map((row) => row.key)
      .filter((key) => key !== NULL_KEY);

    const client = this.prisma as unknown as Record<string, unknown>;
    const lookupDelegate = client[lookup.model] as PrismaDelegate | undefined;

    if (!lookupDelegate || ids.length === 0) {
      return rows.map((row) => ({
        key: row.key,
        label: row.key === NULL_KEY ? nullLabel : row.key,
        value: row.value,
      }));
    }

    const records: Array<Record<string, unknown>> = await lookupDelegate.findMany({
      where: { [lookup.valueField]: { in: ids } },
      select: { [lookup.valueField]: true, [lookup.labelField]: true },
    });

    const labels = new Map(
      records.map((record) => [
        String(record[lookup.valueField]),
        String(record[lookup.labelField] ?? ''),
      ]),
    );

    return rows.map((row) => ({
      key: row.key,
      label:
        row.key === NULL_KEY
          ? nullLabel
          : (labels.get(row.key) ?? 'Unknown'),
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
    if ((field.relationPath ?? []).length > 0) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: `${field.label} cannot be aggregated because it is not a column on ${source.label}.`,
        details: { field: fieldKey },
      });
    }
    return field.path;
  }
}

export const NULL_KEY = '__null__';

interface PrismaDelegate {
  count(args: Record<string, unknown>): Promise<number>;
  aggregate(args: Record<string, unknown>): Promise<AggregateRow>;
  groupBy(args: Record<string, unknown>): Promise<GroupRow[]>;
  findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}

interface AggregateRow {
  _sum?: Record<string, unknown>;
  _avg?: Record<string, unknown>;
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
