/*
 * DP-MASTER/WP-35.S2 (ADR-0030). Pure form logic for the work-profile settings
 * screen: turns an API definition into editable rows and back, and mirrors the
 * measurement-mode / unit-kind rule so the unit picker never offers a pair the
 * API would refuse. The API (work-profile-definition.ts) stays the authority;
 * everything here only saves a round trip.
 */

export const WORK_UNIT_KINDS = [
  "DURATION",
  "COUNT",
  "DUTY_COMPLETION",
  "CURRENCY",
] as const;
export type WorkUnitKind = (typeof WORK_UNIT_KINDS)[number];

export const WORK_TYPE_KINDS = [
  "TASK",
  "TRANSACTION",
  "DUTY",
  "OUTPUT",
  "SERVICE",
  "EVENT",
  "CONTRIBUTION",
] as const;
export type WorkTypeKind = (typeof WORK_TYPE_KINDS)[number];

export const MEASUREMENT_MODES = ["TIMED", "QUANTITY", "COMPLETION"] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];

/** Which unit kinds each measurement mode can be expressed in. */
export const MODE_UNIT_KINDS: Record<MeasurementMode, readonly WorkUnitKind[]> =
  {
    TIMED: ["DURATION"],
    QUANTITY: ["COUNT", "CURRENCY"],
    COMPLETION: ["DUTY_COMPLETION"],
  };

export const WORK_UNIT_KIND_LABELS: Record<WorkUnitKind, string> = {
  DURATION: "Duration",
  COUNT: "Count",
  DUTY_COMPLETION: "Duty completion",
  CURRENCY: "Currency",
};

export const WORK_TYPE_KIND_LABELS: Record<WorkTypeKind, string> = {
  TASK: "Task",
  TRANSACTION: "Transaction",
  DUTY: "Duty",
  OUTPUT: "Output",
  SERVICE: "Service",
  EVENT: "Event",
  CONTRIBUTION: "Contribution",
};

export const MEASUREMENT_MODE_LABELS: Record<MeasurementMode, string> = {
  TIMED: "Timed",
  QUANTITY: "Quantity",
  COMPLETION: "Completion",
};

export const WORK_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type WorkUnit = {
  id: string;
  key: string;
  name: string;
  kind: WorkUnitKind;
  isActive: boolean;
};

export type ComplexityBandDraft = {
  key: string;
  name: string;
  multiplier: number | null;
};

export type WorkTypeDraft = {
  key: string;
  name: string;
  kind: WorkTypeKind;
  unitKey: string;
  measurementMode: MeasurementMode;
  standardEffortMinutes: number | null;
  bands: ComplexityBandDraft[];
  samplePercent: number | null;
  requiresVerification: boolean;
};

export type WorkProfileDefinitionPayload = {
  workTypes: Array<Record<string, unknown>>;
};

export function emptyWorkType(): WorkTypeDraft {
  return {
    key: "",
    name: "",
    kind: "TASK",
    unitKey: "",
    measurementMode: "QUANTITY",
    standardEffortMinutes: null,
    bands: [],
    samplePercent: null,
    requiresVerification: false,
  };
}

/** A key suggestion from a display name; the user can still edit it. */
export function keyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const oneOf = <T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T,
): T => (list.includes(value as T) ? (value as T) : fallback);

/** Stored definition JSON to editable rows. Tolerates anything: it is only ever read back. */
export function draftsFromDefinition(definition: unknown): WorkTypeDraft[] {
  if (!isRecord(definition) || !Array.isArray(definition.workTypes)) return [];
  return definition.workTypes.filter(isRecord).map((type) => {
    const bands = Array.isArray(type.complexityBands)
      ? type.complexityBands.filter(isRecord).map((band) => ({
          key: typeof band.key === "string" ? band.key : "",
          name: typeof band.name === "string" ? band.name : "",
          multiplier: asNumber(band.multiplier),
        }))
      : [];
    const quality = isRecord(type.quality) ? type.quality : {};
    return {
      key: typeof type.key === "string" ? type.key : "",
      name: typeof type.name === "string" ? type.name : "",
      kind: oneOf(WORK_TYPE_KINDS, type.kind, "TASK"),
      unitKey: typeof type.unitKey === "string" ? type.unitKey : "",
      measurementMode: oneOf(MEASUREMENT_MODES, type.measurementMode, "QUANTITY"),
      standardEffortMinutes: asNumber(type.standardEffortMinutes),
      bands,
      samplePercent: asNumber(quality.samplePercent),
      requiresVerification: quality.requiresVerification === true,
    };
  });
}

/** Editable rows to the payload the API validates. Empty optional parts are omitted. */
export function definitionFromDrafts(
  drafts: readonly WorkTypeDraft[],
): WorkProfileDefinitionPayload {
  return {
    workTypes: drafts.map((draft) => {
      const type: Record<string, unknown> = {
        key: draft.key.trim(),
        name: draft.name.trim(),
        kind: draft.kind,
        unitKey: draft.unitKey,
        measurementMode: draft.measurementMode,
      };
      // Timed work is measured by the clock; the API refuses a per-unit standard.
      if (
        draft.measurementMode !== "TIMED" &&
        draft.standardEffortMinutes !== null
      ) {
        type.standardEffortMinutes = draft.standardEffortMinutes;
      }
      if (draft.bands.length) {
        type.complexityBands = draft.bands.map((band) => ({
          key: band.key.trim(),
          name: band.name.trim(),
          multiplier: band.multiplier,
        }));
      }
      const quality: Record<string, unknown> = {};
      if (draft.samplePercent !== null) {
        quality.samplePercent = draft.samplePercent;
      }
      if (draft.requiresVerification) quality.requiresVerification = true;
      if (Object.keys(quality).length) type.quality = quality;
      return type;
    }),
  };
}

/** Active units a measurement mode can use; the current pick stays so an edit never silently drops it. */
export function unitsForMode(
  units: readonly WorkUnit[],
  mode: MeasurementMode,
  currentKey = "",
): WorkUnit[] {
  const kinds = MODE_UNIT_KINDS[mode];
  return units.filter(
    (unit) =>
      unit.key === currentKey || (unit.isActive && kinds.includes(unit.kind)),
  );
}

/** First unit that fits a mode, used when the mode changes under a row. */
export function defaultUnitKey(
  units: readonly WorkUnit[],
  mode: MeasurementMode,
): string {
  return unitsForMode(units, mode)[0]?.key ?? "";
}

/**
 * Quick checks before a round trip. The API repeats every rule and its message
 * wins: this only catches the obvious so a save is not wasted.
 */
export function validateDrafts(
  drafts: readonly WorkTypeDraft[],
  units: readonly WorkUnit[],
): string[] {
  const problems: string[] = [];
  if (drafts.length === 0) problems.push("Add at least one work type.");
  const seen = new Set<string>();
  const unitByKey = new Map(units.map((unit) => [unit.key, unit]));
  drafts.forEach((draft, index) => {
    const label = draft.name.trim() || `Work type ${index + 1}`;
    if (!WORK_KEY_PATTERN.test(draft.key.trim())) {
      problems.push(`${label}: the key must be 2-64 characters of a-z, 0-9, ".", "_" or "-".`);
    } else if (seen.has(draft.key.trim())) {
      problems.push(`${label}: the key "${draft.key.trim()}" is used twice.`);
    } else {
      seen.add(draft.key.trim());
    }
    if (!draft.name.trim()) problems.push(`${label}: a name is required.`);
    const unit = unitByKey.get(draft.unitKey);
    if (!unit) {
      problems.push(`${label}: choose a unit.`);
    } else if (!MODE_UNIT_KINDS[draft.measurementMode].includes(unit.kind)) {
      problems.push(
        `${label}: ${MEASUREMENT_MODE_LABELS[draft.measurementMode]} work cannot use a ${WORK_UNIT_KIND_LABELS[unit.kind]} unit.`,
      );
    }
    if (
      draft.standardEffortMinutes !== null &&
      draft.standardEffortMinutes <= 0
    ) {
      problems.push(`${label}: standard effort must be above 0.`);
    }
    draft.bands.forEach((band, bandIndex) => {
      if (!WORK_KEY_PATTERN.test(band.key.trim()) || !band.name.trim()) {
        problems.push(`${label}: band ${bandIndex + 1} needs a key and a name.`);
      }
      if (band.multiplier === null || band.multiplier <= 0) {
        problems.push(`${label}: band ${bandIndex + 1} needs a multiplier above 0.`);
      }
    });
  });
  return problems;
}

/** `yyyy-MM-dd` from a date input to the UTC midnight ISO string the API expects. */
export function isoFromDateInput(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/** The user-facing message of a failed API/proxy response body. */
export function messageFromErrorBody(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    const message = body.message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message)) {
      const text = message.filter((m) => typeof m === "string").join(" ");
      if (text) return text;
    }
  }
  return fallback;
}
