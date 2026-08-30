import {
  ENTITY_KEYS,
  MISC_PERMISSION_KEYS,
} from '../../../common/constants/rbac-matrix';
import { PERMISSION_KEYS } from '../../../common/constants/permissions';
import { getDataSource } from '../semantic/data-sources';
import { isFilterable, isGroupable } from '../semantic/semantic.types';
import type {
  ReportDataSource,
  ReportFieldDefinition,
  ReportFilterOperator,
  ReportMetricDefinition,
} from '../semantic/semantic.types';
import {
  REPORT_METRICS,
  getMetric,
  listMetrics,
  listMetricsForSource,
} from './metric.registry';

/**
 * A metric is a promise that one number means one thing.
 *
 * The failure mode this suite exists for is not a crash: it is a dashboard tile
 * and an export both rendering a figure called "attendance rate" that were
 * computed differently, and nobody noticing for a quarter. So every field a
 * calculation names is resolved against the source it claims to sit on, every
 * aggregation is checked against what that field actually supports, and the two
 * statistical mistakes this domain invites — averaging a ratio, and averaging a
 * percentage column — are checked for by name.
 */

const METRICS = listMetrics();

const PERMISSION_VALUES = new Set<string>([
  ...Object.values(PERMISSION_KEYS),
  ...Object.values(MISC_PERMISSION_KEYS),
]);

const FILTER_OPERATORS: ReadonlySet<string> = new Set<ReportFilterOperator>([
  'eq',
  'ne',
  'contains',
  'startswith',
  'endswith',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notin',
  'between',
  'isnull',
  'isnotnull',
]);

/** Words that assert a judgement the desktop telemetry cannot support. */
const JUDGEMENT_WORDS = [
  'productiv',
  'efficien',
  'slack',
  'lazy',
  'underperform',
];

const sourceOf = (metric: ReportMetricDefinition): ReportDataSource => {
  const source = getDataSource(metric.dataSourceKey);
  if (!source) {
    throw new Error(
      `metric "${metric.key}" names data source "${metric.dataSourceKey}", which is not in the registry`,
    );
  }
  return source;
};

const fieldOf = (
  source: ReportDataSource,
  fieldKey: string,
): ReportFieldDefinition | undefined =>
  source.fields.find((field) => field.key === fieldKey);

/** Every field key a calculation names, whatever kind it is. */
function calculationFieldKeys(metric: ReportMetricDefinition): string[] {
  const calculation = metric.calculation;
  switch (calculation.kind) {
    case 'count':
      return [];
    case 'count_distinct':
    case 'sum':
    case 'avg':
      return [calculation.field];
    case 'ratio':
      return [calculation.numerator, calculation.denominator];
    case 'filtered_count':
      return Object.keys(calculation.where);
    case 'derived':
      // dependsOn may name other metrics; only the entries that are not metric
      // keys are field references.
      return calculation.dependsOn.filter((key) => !REPORT_METRICS.has(key));
  }
}

const isDesktopMetric = (metric: ReportMetricDefinition): boolean =>
  metric.dataSourceKey.startsWith('desktop');

describe('report metric registry', () => {
  it('exposes every metric through the registry, the getter and the list', () => {
    expect(METRICS.length).toBeGreaterThan(0);
    expect(REPORT_METRICS.size).toBe(METRICS.length);
    for (const metric of METRICS) {
      expect(getMetric(metric.key)).toBe(metric);
    }
    expect(getMetric('not-a-metric')).toBeUndefined();
  });

  it('has a unique key per metric', () => {
    const keys = METRICS.map((metric) => metric.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('partitions cleanly by data source', () => {
    const bySource = new Map<string, number>();
    for (const metric of METRICS) {
      bySource.set(
        metric.dataSourceKey,
        (bySource.get(metric.dataSourceKey) ?? 0) + 1,
      );
    }
    let total = 0;
    for (const [sourceKey, count] of bySource) {
      const listed = listMetricsForSource(sourceKey);
      expect(listed).toHaveLength(count);
      for (const metric of listed) {
        expect(metric.dataSourceKey).toBe(sourceKey);
      }
      total += count;
    }
    expect(total).toBe(METRICS.length);
    expect(listMetricsForSource('not-a-source')).toEqual([]);
  });

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: its data source resolves',
    (_key, metric) => {
      expect(() => sourceOf(metric)).not.toThrow();
      expect(ENTITY_KEYS).toBeDefined();
    },
  );
});

describe('metric calculations name real fields', () => {
  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: every field in the calculation exists on its own source',
    (_key, metric) => {
      const source = sourceOf(metric);
      for (const fieldKey of calculationFieldKeys(metric)) {
        const field = fieldOf(source, fieldKey);
        expect(
          field
            ? fieldKey
            : `${metric.key} references "${fieldKey}", which is not a field of source "${source.key}"`,
        ).toBe(fieldKey);
      }
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: sum, avg and ratio only use fields that support them',
    (_key, metric) => {
      const source = sourceOf(metric);
      const calculation = metric.calculation;

      const requireAggregation = (fieldKey: string, aggregation: string) => {
        const field = fieldOf(source, fieldKey);
        expect(field?.aggregatable).toBe(true);
        expect(
          (field?.supportedAggregations ?? []).includes(
            aggregation as never,
          )
            ? aggregation
            : `${metric.key} applies "${aggregation}" to ${fieldKey}, which declares [${(field?.supportedAggregations ?? []).join(', ')}]`,
        ).toBe(aggregation);
      };

      if (calculation.kind === 'sum' || calculation.kind === 'avg') {
        requireAggregation(calculation.field, calculation.kind);
      }
      if (calculation.kind === 'ratio') {
        requireAggregation(calculation.numerator, 'sum');
        requireAggregation(calculation.denominator, 'sum');
      }
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: never averages a percent field',
    (_key, metric) => {
      if (metric.calculation.kind !== 'avg') return;
      const field = fieldOf(sourceOf(metric), metric.calculation.field);
      // Averaging a stored ratio across rows is a ratio of ratios. The `ratio`
      // calculation exists so the correct form is the reachable one.
      expect(
        field?.type === 'percent'
          ? `${metric.key} averages the percent field ${field.key}; use kind "ratio" instead`
          : 'ok',
      ).toBe('ok');
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: count_distinct counts something with a stable identity',
    (_key, metric) => {
      if (metric.calculation.kind !== 'count_distinct') return;
      const field = fieldOf(sourceOf(metric), metric.calculation.field);
      // Counting distinct labels merges two records that share one. A relation
      // field must therefore name the root-model key it is grouped by.
      const reachedByRelation = (field?.relationPath ?? []).length > 0;
      expect(
        !reachedByRelation || field?.groupByField !== undefined
          ? 'ok'
          : `${metric.key} counts distinct "${field?.key}", which is reached through a relation and declares no groupByField`,
      ).toBe('ok');
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: filtered_count predicates use the semantic operator vocabulary',
    (_key, metric) => {
      if (metric.calculation.kind !== 'filtered_count') return;
      for (const [fieldKey, predicate] of Object.entries(
        metric.calculation.where,
      )) {
        expect(typeof predicate).toBe('object');
        for (const operator of Object.keys(
          predicate as Record<string, unknown>,
        )) {
          expect(
            FILTER_OPERATORS.has(operator)
              ? operator
              : `${metric.key} filters ${fieldKey} with unknown operator "${operator}"`,
          ).toBe(operator);
        }
      }
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: filtered_count enum values are members of the field enum',
    (_key, metric) => {
      if (metric.calculation.kind !== 'filtered_count') return;
      const source = sourceOf(metric);
      for (const [fieldKey, predicate] of Object.entries(
        metric.calculation.where,
      )) {
        const field = fieldOf(source, fieldKey);
        if (field?.type !== 'enum') continue;
        const allowed = new Set(field.enumValues ?? []);
        for (const value of Object.values(
          predicate as Record<string, unknown>,
        )) {
          const candidates = Array.isArray(value) ? value : [value];
          for (const candidate of candidates) {
            if (typeof candidate !== 'string') continue;
            expect(
              allowed.has(candidate)
                ? candidate
                : `${metric.key} filters ${fieldKey} on "${candidate}", which is not a member of that enum`,
            ).toBe(candidate);
          }
        }
      }
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: derived dependencies resolve to a metric or to a field of its source',
    (_key, metric) => {
      if (metric.calculation.kind !== 'derived') return;
      expect(metric.calculation.dependsOn.length).toBeGreaterThan(0);
      const source = sourceOf(metric);
      for (const dependency of metric.calculation.dependsOn) {
        const resolved =
          REPORT_METRICS.has(dependency) ||
          fieldOf(source, dependency) !== undefined;
        expect(
          resolved
            ? dependency
            : `${metric.key} depends on "${dependency}", which is neither a metric nor a field of source "${source.key}"`,
        ).toBe(dependency);
      }
    },
  );

  it('has no cycle among derived metrics', () => {
    const state = new Map<string, 'visiting' | 'done'>();

    const visit = (key: string, trail: string[]): void => {
      if (state.get(key) === 'done') return;
      if (state.get(key) === 'visiting') {
        throw new Error(
          `metric dependency cycle: ${[...trail, key].join(' -> ')}`,
        );
      }
      state.set(key, 'visiting');
      const metric = REPORT_METRICS.get(key);
      if (metric?.calculation.kind === 'derived') {
        for (const dependency of metric.calculation.dependsOn) {
          if (REPORT_METRICS.has(dependency)) {
            visit(dependency, [...trail, key]);
          }
        }
      }
      state.set(key, 'done');
    };

    expect(() => {
      for (const metric of METRICS) visit(metric.key, []);
    }).not.toThrow();
  });
});

describe('metric dimensions and filters', () => {
  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: every supported dimension is a groupable field of its source',
    (_key, metric) => {
      const source = sourceOf(metric);
      expect(metric.supportedDimensions.length).toBeGreaterThan(0);
      for (const dimension of metric.supportedDimensions) {
        const field = fieldOf(source, dimension);
        expect(
          field
            ? dimension
            : `${metric.key} offers dimension "${dimension}", which is not a field of source "${source.key}"`,
        ).toBe(dimension);
        if (!field) continue;
        expect(
          isGroupable(field)
            ? dimension
            : `${metric.key} offers dimension "${dimension}", which is not groupable`,
        ).toBe(dimension);
      }
    },
  );

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: every supported filter is a filterable field of its source',
    (_key, metric) => {
      const source = sourceOf(metric);
      for (const filter of metric.supportedFilters ?? []) {
        const field = fieldOf(source, filter);
        expect(field).toBeDefined();
        if (field) expect(isFilterable(field)).toBe(true);
      }
    },
  );
});

describe('metric disclosure', () => {
  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: carries at least one caveat',
    (_key, metric) => {
      expect(metric.caveats?.length ?? 0).toBeGreaterThan(0);
      for (const caveat of metric.caveats ?? []) {
        expect(caveat.trim().length).toBeGreaterThan(20);
      }
    },
  );

  it('gives every desktop metric a caveat naming the known contamination', () => {
    const desktop = METRICS.filter(isDesktopMetric);
    expect(desktop.length).toBeGreaterThan(0);
    for (const metric of desktop) {
      const caveats = metric.caveats ?? [];
      expect(caveats.length).toBeGreaterThan(0);
      // Fleet-health metrics describe devices, not telemetry totals, so they
      // carry their own caveats rather than the contamination ones.
      if (metric.dataSourceKey !== 'desktop_activity') continue;
      const joined = caveats.join(' ');
      expect(joined).toContain('BUG-0036');
      expect(joined).toContain('UTC');
      expect(joined).toContain('retention');
    }
  });

  it('keeps desktop metric wording neutral', () => {
    for (const metric of METRICS.filter(isDesktopMetric)) {
      const text = [
        metric.label,
        metric.description,
        ...(metric.caveats ?? []),
      ]
        .join(' ')
        .toLowerCase();
      for (const word of JUDGEMENT_WORDS) {
        expect(
          text.includes(word)
            ? `${metric.key} uses the word "${word}"; desktop telemetry observes machine interaction, not work`
            : 'ok',
        ).toBe('ok');
      }
    }
  });

  it('states the denominator wherever agent uptime is the denominator', () => {
    const metric = getMetric('desktop.active_share_of_agent_uptime');
    expect(metric).toBeDefined();
    expect(metric?.label).toBe('Active share of agent uptime');
    expect(metric?.calculation.kind).toBe('ratio');
    expect(
      [metric?.description ?? '', ...(metric?.caveats ?? [])].join(' '),
    ).toContain('not scheduled hours');
  });

  it.each(METRICS.map((metric) => [metric.key, metric] as const))(
    '%s: any declared permission is a real permission key',
    (_key, metric) => {
      if (metric.permission === undefined) return;
      expect(PERMISSION_VALUES.has(metric.permission)).toBe(true);
    },
  );

  it('gates every desktop metric behind a desktop analytics permission', () => {
    for (const metric of METRICS.filter(isDesktopMetric)) {
      expect(metric.permission).toBeDefined();
      expect(metric.permission?.startsWith('desktop-analytics.')).toBe(true);
      expect(metric.sensitivity).toBe('RESTRICTED');

      // Telemetry metrics describe how a person used their machine, so none of
      // them may imply a direction of virtue: there is no good amount of idle
      // time. Fleet-health metrics describe software — an outdated agent is
      // straightforwardly worse than a current one — so they may have one.
      if (metric.dataSourceKey === 'desktop_activity') {
        expect(metric.direction).toBe('neutral');
      }
    }
  });

  it('confines the $NOW token to the two as-of-now leave metrics', () => {
    const usingNow = METRICS.filter((metric) =>
      JSON.stringify(metric.calculation).includes('$NOW'),
    ).map((metric) => metric.key);

    expect(usingNow.sort()).toEqual([
      'leave.employees_currently_on_leave',
      'leave.upcoming_leave_requests',
    ]);

    for (const key of usingNow) {
      // A period cannot narrow an as-of-now number, so it must not offer to.
      expect(getMetric(key)?.comparable).toBe(false);
    }
  });
});
