import type {
  ReportMetricDefinition,
  ReportMetricRegistry,
} from '../semantic/semantic.types';
import { ATTENDANCE_METRICS } from './attendance.metrics';
import { DESKTOP_METRICS } from './desktop.metrics';
import { LEAVE_METRICS } from './leave.metrics';
import { RECRUITMENT_METRICS } from './recruitment.metrics';
import { WORKFORCE_METRICS } from './workforce.metrics';

/**
 * The metric registry — one authoritative definition per number.
 *
 * A dashboard tile, a report column, an export and a scheduled delivery all
 * resolve "headcount" here, which is the only way they can be relied on to
 * agree. A screen that computes its own version of a number in this list has
 * created a second source of truth, and the two will diverge on the day one of
 * them is changed.
 *
 * ## Conventions this registry relies on
 *
 * **Field references are semantic keys, never Prisma paths.** Every `field`,
 * `numerator`, `denominator` and every key inside a `filtered_count` `where`
 * is a `<source>.<field>` key from the data source registry. Nothing here names
 * a database column directly: the registry is the allow-list, and a calculation
 * that stepped outside it would be the one place a Prisma path could reach a
 * query without being checked. `metric-registry.spec.ts` resolves every one of
 * them and fails if any does not exist on the metric's own source.
 *
 * **`filtered_count` predicates use the semantic operator vocabulary** — the
 * same `eq` / `in` / `gt` / `isnull` set `ReportFilterOperator` defines, not
 * Prisma's. The planner translates them exactly as it translates a filter a
 * user built.
 *
 * **`count_distinct` counts the field's `groupByField` when it declares one.**
 * A field reached through a relation has a relation path for its label and a
 * root-model foreign key for its identity; counting distinct labels would merge
 * two people who share one.
 *
 * **`derived` metrics name what they are computed from** in `dependsOn`, which
 * may hold other metric keys or field keys of the same source. They are the
 * escape hatch for the four numbers this vocabulary genuinely cannot express —
 * net change, turnover, a funnel, a time-to-hire — and each one carries, in its
 * caveats, the specific thing the planner has to get right.
 *
 * **`$NOW`** appears in two leave metrics that are inherently as-of-this-instant.
 * See `leave.metrics.ts`; it is the only relative token in the registry.
 */
const ALL_METRICS: readonly ReportMetricDefinition[] = [
  ...WORKFORCE_METRICS,
  ...ATTENDANCE_METRICS,
  ...LEAVE_METRICS,
  ...RECRUITMENT_METRICS,
  ...DESKTOP_METRICS,
];

function buildRegistry(
  metrics: readonly ReportMetricDefinition[],
): ReportMetricRegistry {
  const registry = new Map<string, ReportMetricDefinition>();
  for (const metric of metrics) {
    if (registry.has(metric.key)) {
      // Thrown at module load. Two definitions of one metric key is exactly the
      // disagreement this registry exists to prevent, and the second would
      // silently win.
      throw new Error(
        `Duplicate report metric key: ${metric.key}. Metric keys must be unique across the registry.`,
      );
    }
    registry.set(metric.key, metric);
  }
  return registry;
}

export const REPORT_METRICS: ReportMetricRegistry = buildRegistry(ALL_METRICS);

export function getMetric(key: string): ReportMetricDefinition | undefined {
  return REPORT_METRICS.get(key);
}

export function listMetrics(): ReportMetricDefinition[] {
  return [...REPORT_METRICS.values()];
}

export function listMetricsForSource(
  sourceKey: string,
): ReportMetricDefinition[] {
  return listMetrics().filter((metric) => metric.dataSourceKey === sourceKey);
}

export {
  ATTENDANCE_METRICS,
  DESKTOP_METRICS,
  LEAVE_METRICS,
  RECRUITMENT_METRICS,
  WORKFORCE_METRICS,
};
export { RELATIVE_NOW } from './leave.metrics';
