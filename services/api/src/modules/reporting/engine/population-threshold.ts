import type { ReportDimensionValue } from '../semantic/semantic.types';

/**
 * Small-population suppression.
 *
 * An aggregate over two people is not an aggregate — it is those two people,
 * with a thin coat of arithmetic. "Average active time, Design team: 2 people"
 * identifies individuals to anyone who knows who is on the team, which is
 * everyone. So sensitive sources refuse to answer below a threshold rather than
 * answering identifiably.
 *
 * The policy lives here, in one place, rather than in each surface, and it is
 * deliberately conservative by default: suppression applies to the desktop
 * sources, where the data is about a person's workstation rather than about
 * their employment record. Workforce headcount is not suppressed — a
 * three-person department is not a secret, and suppressing it would break every
 * ordinary HR report.
 */

export const DEFAULT_MINIMUM_POPULATION = 5;

/** Sources whose buckets are suppressed below the threshold. */
export const SUPPRESSED_SOURCE_KEYS: ReadonlySet<string> = new Set([
  'desktop_activity',
  'desktop_device',
]);

export const SUPPRESSION_LABEL = 'Insufficient population for analysis';

export interface SuppressionResult {
  values: ReportDimensionValue[];
  /** True when at least one bucket was withheld. */
  suppressed: boolean;
  suppressedBuckets: number;
}

export function minimumPopulationFor(
  sourceKey: string,
  configured?: number | null,
): number {
  if (!SUPPRESSED_SOURCE_KEYS.has(sourceKey)) return 0;
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return Math.max(0, Math.trunc(configured));
  }
  return DEFAULT_MINIMUM_POPULATION;
}

/**
 * Withhold buckets whose population is below the threshold.
 *
 * The bucket is *removed*, not zeroed. Rendering it as zero would be a lie that
 * looks like data, and it would still reveal that the group exists and is
 * small. A count of withheld buckets is returned so the surface can say
 * plainly that something was withheld — silently returning fewer rows is how a
 * reader draws a wrong conclusion from an honest system.
 */
export function applySuppression(
  values: ReportDimensionValue[],
  populations: ReadonlyMap<string, number>,
  minimumPopulation: number,
): SuppressionResult {
  if (minimumPopulation <= 0) {
    return { values, suppressed: false, suppressedBuckets: 0 };
  }

  const kept: ReportDimensionValue[] = [];
  let suppressedBuckets = 0;

  for (const value of values) {
    const population = populations.get(value.key) ?? 0;
    if (population < minimumPopulation) {
      suppressedBuckets += 1;
      continue;
    }
    kept.push(value);
  }

  return {
    values: kept,
    suppressed: suppressedBuckets > 0,
    suppressedBuckets,
  };
}

/**
 * Whether a single scalar metric may be shown at all.
 *
 * A tenant-wide figure over four employees is as identifying as a bucket of
 * four, so the same rule applies to the headline number on a suppressed source.
 */
export function isPopulationSufficient(
  population: number,
  minimumPopulation: number,
): boolean {
  return minimumPopulation <= 0 || population >= minimumPopulation;
}
