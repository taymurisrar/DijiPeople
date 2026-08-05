export const PLATFORM_THEME_PRESETS = [
  {
    value: "ocean",
    label: "Ocean",
    description: "Clear blue for a calm operations workspace.",
    primaryColor: "#1d4ed8",
    accentColor: "#0ea5e9",
    navigationColor: "#172554",
    surfaceTint: "#eff6ff",
  },
  {
    value: "emerald",
    label: "Emerald",
    description: "Fresh green with strong positive-state contrast.",
    primaryColor: "#047857",
    accentColor: "#10b981",
    navigationColor: "#064e3b",
    surfaceTint: "#ecfdf5",
  },
  {
    value: "violet",
    label: "Violet",
    description: "A confident purple palette for product teams.",
    primaryColor: "#6d28d9",
    accentColor: "#8b5cf6",
    navigationColor: "#3b0764",
    surfaceTint: "#f5f3ff",
  },
  {
    value: "sunset",
    label: "Sunset",
    description: "Warm coral accents for a friendlier workspace.",
    primaryColor: "#c2410c",
    accentColor: "#f97316",
    navigationColor: "#7c2d12",
    surfaceTint: "#fff7ed",
  },
] as const;

export type PlatformThemePreset =
  (typeof PLATFORM_THEME_PRESETS)[number]["value"];

export type PlatformAppearance = {
  themePreset: PlatformThemePreset;
  primaryColor: string;
  accentColor: string;
  navigationColor: string;
  surfaceTint: string;
};

export const DEFAULT_PLATFORM_APPEARANCE: PlatformAppearance = {
  themePreset: "ocean",
  primaryColor: "#1d4ed8",
  accentColor: "#0ea5e9",
  navigationColor: "#172554",
  surfaceTint: "#eff6ff",
};

export function appearanceForPreset(
  preset: PlatformThemePreset,
): PlatformAppearance {
  const match = PLATFORM_THEME_PRESETS.find((item) => item.value === preset);
  const resolved = match ?? PLATFORM_THEME_PRESETS[0];
  return {
    themePreset: resolved.value,
    primaryColor: resolved.primaryColor,
    accentColor: resolved.accentColor,
    navigationColor: resolved.navigationColor,
    surfaceTint: resolved.surfaceTint,
  };
}

export function normalizePlatformAppearance(
  value?: Partial<Record<keyof PlatformAppearance, unknown>>,
): PlatformAppearance {
  const preset = PLATFORM_THEME_PRESETS.some(
    (item) => item.value === value?.themePreset,
  )
    ? (value?.themePreset as PlatformThemePreset)
    : DEFAULT_PLATFORM_APPEARANCE.themePreset;
  const fallback = appearanceForPreset(preset);

  return {
    themePreset: preset,
    primaryColor: readColor(value?.primaryColor, fallback.primaryColor),
    accentColor: readColor(value?.accentColor, fallback.accentColor),
    navigationColor: readColor(
      value?.navigationColor,
      fallback.navigationColor,
    ),
    surfaceTint: readColor(value?.surfaceTint, fallback.surfaceTint),
  };
}

function readColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}
