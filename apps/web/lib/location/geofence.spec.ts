import {
  CUSTOM_PRESET_KEY,
  GEOFENCE_RADIUS_PRESETS,
  INHERIT_PRESET_KEY,
  LOCATION_ACCURACY_PRESETS,
  normalizeMeters,
  presetDescription,
  resolvePresetKey,
} from "./geofence-presets";
import { evaluateGeofenceTest, geofenceTestVerdictLabel } from "./geofence-test";

describe("radius and accuracy presets", () => {
  it("selects the matching preset", () => {
    expect(resolvePresetKey(100, GEOFENCE_RADIUS_PRESETS)).toBe("100");
    expect(resolvePresetKey(50, GEOFENCE_RADIUS_PRESETS)).toBe("50");
    expect(resolvePresetKey(500, GEOFENCE_RADIUS_PRESETS)).toBe("500");
  });

  it("reads an unmatched value as Custom rather than as unset", () => {
    expect(resolvePresetKey(137, GEOFENCE_RADIUS_PRESETS)).toBe(CUSTOM_PRESET_KEY);
  });

  it("reads a missing value as inherited", () => {
    expect(resolvePresetKey(null, GEOFENCE_RADIUS_PRESETS)).toBe(INHERIT_PRESET_KEY);
    expect(resolvePresetKey(undefined, LOCATION_ACCURACY_PRESETS)).toBe(
      INHERIT_PRESET_KEY,
    );
  });

  it("maps accuracy presets to the documented metres", () => {
    expect(LOCATION_ACCURACY_PRESETS.map((preset) => preset.value)).toEqual([
      30, 100, 200,
    ]);
    expect(GEOFENCE_RADIUS_PRESETS.map((preset) => preset.value)).toEqual([
      50, 100, 200, 500,
    ]);
  });

  it("describes a preset without claiming exact coverage", () => {
    const description = presetDescription(100, GEOFENCE_RADIUS_PRESETS);
    expect(description).toContain("usually");
    expect(presetDescription(137, GEOFENCE_RADIUS_PRESETS)).toBe("");
  });

  it("normalizes typed metres and refuses a zero-size fence", () => {
    expect(normalizeMeters("250")).toBe(250);
    expect(normalizeMeters(250.4)).toBe(250);
    expect(normalizeMeters(0)).toBe(1);
    expect(normalizeMeters(-40)).toBe(1);
    expect(normalizeMeters("")).toBeNull();
    expect(normalizeMeters(null)).toBeNull();
    expect(normalizeMeters("wide")).toBeNull();
    expect(normalizeMeters(500_000)).toBe(100_000);
  });
});

describe("test this location", () => {
  const site = { latitude: 24.8607, longitude: 67.0011 };

  it("reports inside when the capture is within the radius", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8609, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: 8,
    });
    expect(result.isInside).toBe(true);
    expect(result.verdict).toBe("INSIDE");
    expect(result.distanceMeters).toBeLessThan(100);
    expect(geofenceTestVerdictLabel(result)).toBe("Inside work site");
  });

  it("reports outside when the capture is clearly beyond the radius", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8707, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: 10,
    });
    expect(result.isInside).toBe(false);
    expect(result.verdict).toBe("OUTSIDE");
    expect(result.distanceMeters).toBeGreaterThan(1000);
  });

  it("refuses to call a boundary reading when accuracy cannot separate the two", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8618, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: 80,
    });
    expect(result.isInside).toBe(false);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(geofenceTestVerdictLabel(result)).toBe(
      "Too close to call at this accuracy",
    );
  });

  it("flags a reading worse than the configured accuracy requirement", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8608, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: 350,
      maximumAccuracyMeters: 100,
    });
    expect(result.accuracyExceedsRequirement).toBe(true);
    expect(result.accuracyMeters).toBe(350);
  });

  it("copes with a browser that reports no accuracy at all", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8608, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: null,
      maximumAccuracyMeters: 100,
    });
    expect(result.accuracyMeters).toBeNull();
    expect(result.accuracyExceedsRequirement).toBe(false);
    expect(result.verdict).toBe("INSIDE");
  });

  it("produces no attendance payload — only measurements", () => {
    const result = evaluateGeofenceTest({
      site,
      captured: { latitude: 24.8608, longitude: 67.0011 },
      radiusMeters: 100,
      accuracyMeters: 12,
    });
    expect(Object.keys(result).sort()).toEqual([
      "accuracyExceedsRequirement",
      "accuracyMeters",
      "distanceMeters",
      "isInside",
      "radiusMeters",
      "verdict",
    ]);
  });
});
