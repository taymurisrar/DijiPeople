/*
 * DP-MASTER/WP-35.S1 (ADR-0030, U01, U03, M04). The pure rules for a work profile
 * version's definition: which work types a role performs, how each is measured,
 * and in what unit. Kept free of I/O so every rule is unit-tested and so the same
 * checks can run at authoring time, at publish time and later in a package import.
 */
export const WORK_TYPE_KINDS = [
  'TASK',
  'TRANSACTION',
  'DUTY',
  'OUTPUT',
  'SERVICE',
  'EVENT',
  'CONTRIBUTION',
] as const;
export type WorkTypeKind = (typeof WORK_TYPE_KINDS)[number];

export const MEASUREMENT_MODES = ['TIMED', 'QUANTITY', 'COMPLETION'] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];

export const WORK_UNIT_KINDS = [
  'DURATION',
  'COUNT',
  'DUTY_COMPLETION',
  'CURRENCY',
] as const;
export type WorkUnitKindValue = (typeof WORK_UNIT_KINDS)[number];

/** Stable, portable, lower-case key shared by profiles, units, types and bands. */
export const WORK_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/**
 * Which unit kinds a measurement mode can be expressed in. Incompatible pairs
 * are rejected, never converted.
 */
export const MODE_UNIT_KINDS: Record<
  MeasurementMode,
  readonly WorkUnitKindValue[]
> = {
  TIMED: ['DURATION'],
  QUANTITY: ['COUNT', 'CURRENCY'],
  COMPLETION: ['DUTY_COMPLETION'],
};

export type ComplexityBand = { key: string; name: string; multiplier: number };

export type WorkTypeDefinition = {
  key: string;
  name: string;
  kind: WorkTypeKind;
  unitKey: string;
  measurementMode: MeasurementMode;
  /** Validated standard effort per unit, in minutes. QUANTITY and COMPLETION only. */
  standardEffortMinutes?: number;
  complexityBands?: ComplexityBand[];
  quality?: { samplePercent?: number; requiresVerification?: boolean };
};

export type WorkProfileDefinition = { workTypes: WorkTypeDefinition[] };

export const MAX_WORK_TYPES = 100;
export const MAX_COMPLEXITY_BANDS = 20;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Structural and semantic checks that need no database: one message per problem. */
export function validateWorkProfileDefinition(raw: unknown): string[] {
  if (!isObject(raw) || !Array.isArray(raw.workTypes)) {
    return ['The definition must be an object with a workTypes list.'];
  }
  const problems: string[] = [];
  const types = raw.workTypes as unknown[];
  if (types.length === 0) problems.push('Add at least one work type.');
  if (types.length > MAX_WORK_TYPES) {
    problems.push(`A profile holds at most ${MAX_WORK_TYPES} work types.`);
  }

  const seen = new Set<string>();
  types.forEach((entry, index) => {
    const label = `Work type ${index + 1}`;
    if (!isObject(entry)) {
      problems.push(`${label} is not an object.`);
      return;
    }
    const key = entry.key;
    if (typeof key !== 'string' || !WORK_KEY_PATTERN.test(key)) {
      problems.push(
        `${label}: key must be 2-64 characters of a-z, 0-9, ".", "_" or "-".`,
      );
    } else if (seen.has(key)) {
      problems.push(`${label}: key "${key}" is used twice.`);
    } else {
      seen.add(key);
    }
    if (
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 120
    ) {
      problems.push(`${label}: name is required (up to 120 characters).`);
    }
    if (!(WORK_TYPE_KINDS as readonly unknown[]).includes(entry.kind)) {
      problems.push(
        `${label}: kind must be one of ${WORK_TYPE_KINDS.join(', ')}.`,
      );
    }
    if (
      typeof entry.unitKey !== 'string' ||
      !WORK_KEY_PATTERN.test(entry.unitKey)
    ) {
      problems.push(`${label}: unitKey must reference a unit key.`);
    }
    const mode = entry.measurementMode;
    if (!(MEASUREMENT_MODES as readonly unknown[]).includes(mode)) {
      problems.push(
        `${label}: measurementMode must be one of ${MEASUREMENT_MODES.join(', ')}.`,
      );
    }

    if (entry.standardEffortMinutes !== undefined) {
      const minutes = entry.standardEffortMinutes;
      if (
        typeof minutes !== 'number' ||
        !Number.isFinite(minutes) ||
        minutes <= 0 ||
        minutes > 100_000
      ) {
        problems.push(
          `${label}: standardEffortMinutes must be a number above 0.`,
        );
      } else if (mode === 'TIMED') {
        // Timed work is measured by the clock; a per-unit standard would be
        // double accounting (M04).
        problems.push(`${label}: timed work has no standard effort per unit.`);
      }
    }

    if (entry.complexityBands !== undefined) {
      if (
        !Array.isArray(entry.complexityBands) ||
        entry.complexityBands.length > MAX_COMPLEXITY_BANDS
      ) {
        problems.push(
          `${label}: complexityBands must be a list of at most ${MAX_COMPLEXITY_BANDS}.`,
        );
      } else {
        const bandKeys = new Set<string>();
        (entry.complexityBands as unknown[]).forEach((band, i) => {
          const b = isObject(band) ? band : {};
          if (typeof b.key !== 'string' || !WORK_KEY_PATTERN.test(b.key)) {
            problems.push(`${label}, band ${i + 1}: key is invalid.`);
          } else if (bandKeys.has(b.key)) {
            problems.push(
              `${label}, band ${i + 1}: key "${b.key}" is used twice.`,
            );
          } else {
            bandKeys.add(b.key);
          }
          if (typeof b.name !== 'string' || !b.name.trim()) {
            problems.push(`${label}, band ${i + 1}: name is required.`);
          }
          if (
            typeof b.multiplier !== 'number' ||
            !Number.isFinite(b.multiplier) ||
            b.multiplier <= 0 ||
            b.multiplier > 100
          ) {
            problems.push(
              `${label}, band ${i + 1}: multiplier must be a number above 0.`,
            );
          }
        });
      }
    }

    if (entry.quality !== undefined) {
      const q = isObject(entry.quality) ? entry.quality : null;
      if (!q) {
        problems.push(`${label}: quality must be an object.`);
      } else {
        if (
          q.samplePercent !== undefined &&
          (typeof q.samplePercent !== 'number' ||
            q.samplePercent < 0 ||
            q.samplePercent > 100)
        ) {
          problems.push(
            `${label}: quality.samplePercent must be between 0 and 100.`,
          );
        }
        if (
          q.requiresVerification !== undefined &&
          typeof q.requiresVerification !== 'boolean'
        ) {
          problems.push(
            `${label}: quality.requiresVerification must be true or false.`,
          );
        }
      }
    }
  });
  return problems;
}

/**
 * Checks each work type's unit against the tenant's units: it must exist, be
 * active, and be a kind the measurement mode can use. Pure: the caller passes the
 * units it loaded, already scoped to the tenant.
 */
export function validateUnitCompatibility(
  definition: WorkProfileDefinition,
  units: { key: string; kind: WorkUnitKindValue; isActive: boolean }[],
): string[] {
  const byKey = new Map(units.map((unit) => [unit.key, unit]));
  const problems: string[] = [];
  definition.workTypes.forEach((type) => {
    const unit = byKey.get(type.unitKey);
    if (!unit) {
      problems.push(
        `Work type "${type.key}": unit "${type.unitKey}" does not exist.`,
      );
      return;
    }
    if (!unit.isActive) {
      problems.push(
        `Work type "${type.key}": unit "${type.unitKey}" is inactive.`,
      );
    }
    if (!MODE_UNIT_KINDS[type.measurementMode].includes(unit.kind)) {
      problems.push(
        `Work type "${type.key}": ${type.measurementMode} work cannot be measured in a ${unit.kind} unit ("${type.unitKey}").`,
      );
    }
  });
  return problems;
}
