/**
 * Business-friendly presets for the numbers administrators find hardest to
 * guess: how big a geofence should be, and how precise a device's reported
 * location must be before it is trusted.
 *
 * These are starting points, not standards. GPS behaviour varies with building
 * material, weather and hardware, so the labels describe the kind of site the
 * value suits rather than promising coverage.
 */

export type NumericPreset = {
  readonly value: number;
  readonly label: string;
  /** Shown under the preset row once selected. */
  readonly description?: string;
};

export const GEOFENCE_RADIUS_PRESETS: readonly NumericPreset[] = [
  { value: 50, label: "Small office", description: "A single floor or unit." },
  {
    value: 100,
    label: "Office building",
    description:
      "100 m usually covers an office building and its immediate entrance area.",
  },
  {
    value: 200,
    label: "Office campus",
    description: "Several buildings with shared grounds or parking.",
  },
  {
    value: 500,
    label: "Large campus",
    description: "A large site such as a plant, warehouse yard or hospital campus.",
  },
];

export const LOCATION_ACCURACY_PRESETS: readonly NumericPreset[] = [
  {
    value: 30,
    label: "High accuracy",
    description: "Best for small sites. Devices indoors may struggle to reach it.",
  },
  {
    value: 100,
    label: "Recommended",
    description: "Works for most offices without rejecting ordinary phone readings.",
  },
  {
    value: 200,
    label: "Flexible",
    description: "Accepts weaker readings, such as inside large or shielded buildings.",
  },
];

export const CUSTOM_PRESET_KEY = "CUSTOM";
export const INHERIT_PRESET_KEY = "INHERIT";

/**
 * Which preset button should read as selected.
 *
 * A value that matches no preset is "Custom" rather than nothing selected, so
 * the control never looks unset while holding a real number.
 */
export function resolvePresetKey(
  value: number | null | undefined,
  presets: readonly NumericPreset[],
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return INHERIT_PRESET_KEY;
  }
  const match = presets.find((preset) => preset.value === value);
  return match ? String(match.value) : CUSTOM_PRESET_KEY;
}

export function presetDescription(
  value: number | null | undefined,
  presets: readonly NumericPreset[],
) {
  if (value === null || value === undefined) return "";
  return presets.find((preset) => preset.value === value)?.description ?? "";
}

/**
 * Bounds a metre value coming from a slider or a typed field.
 *
 * Zero is rejected rather than clamped to zero: a geofence of no size would
 * make every punch outside it, which is never what an administrator means.
 */
export function normalizeMeters(
  value: unknown,
  options: { readonly min?: number; readonly max?: number } = {},
): number | null {
  const min = options.min ?? 1;
  const max = options.max ?? 100_000;
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}
