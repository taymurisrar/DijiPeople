import {
  PLATFORM_THEME_PRESETS,
  appearanceForPreset,
  normalizePlatformAppearance,
} from "./platform-appearance";

describe("platform appearance tokens", () => {
  it("resolves every supported preset to the authoritative token values", () => {
    for (const preset of PLATFORM_THEME_PRESETS) {
      expect(appearanceForPreset(preset.value)).toEqual({
        themePreset: preset.value,
        primaryColor: preset.primaryColor,
        accentColor: preset.accentColor,
        navigationColor: preset.navigationColor,
        surfaceTint: preset.surfaceTint,
      });
    }
  });

  it("keeps valid controlled overrides and rejects unsupported values", () => {
    expect(
      normalizePlatformAppearance({
        themePreset: "violet",
        primaryColor: "#112233",
      }),
    ).toMatchObject({ themePreset: "violet", primaryColor: "#112233" });
    expect(
      normalizePlatformAppearance({
        themePreset: "unsupported",
        primaryColor: "red",
      } as never),
    ).toMatchObject({ themePreset: "ocean", primaryColor: "#1d4ed8" });
  });
});
