/**
 * Evaluating a captured position against a configured geofence.
 *
 * A configuration helper, not an attendance decision: it answers "would a punch
 * from here land inside the circle you just drew", and produces no payload any
 * attendance endpoint would accept. Kept separate from the engine's own geofence
 * service on purpose — that service decides real attendance, and this must never
 * be mistaken for it.
 */

import { distanceMeters, type Coordinates } from "./geo";

export type GeofenceTestResult = {
  readonly distanceMeters: number;
  readonly accuracyMeters: number | null;
  readonly radiusMeters: number;
  readonly isInside: boolean;
  /** True when the reading is too imprecise for the answer to mean much. */
  readonly accuracyExceedsRequirement: boolean;
  readonly verdict: "INSIDE" | "OUTSIDE" | "INCONCLUSIVE";
};

export function evaluateGeofenceTest(input: {
  readonly site: Coordinates;
  readonly captured: Coordinates;
  readonly radiusMeters: number;
  readonly accuracyMeters?: number | null;
  /** The configured accuracy requirement, if any. */
  readonly maximumAccuracyMeters?: number | null;
}): GeofenceTestResult {
  const distance = Math.round(distanceMeters(input.site, input.captured));
  const accuracy =
    typeof input.accuracyMeters === "number" && Number.isFinite(input.accuracyMeters)
      ? Math.round(input.accuracyMeters)
      : null;
  const radius = Math.max(0, Math.round(input.radiusMeters));
  const isInside = distance <= radius;
  const accuracyExceedsRequirement =
    typeof input.maximumAccuracyMeters === "number" &&
    accuracy !== null &&
    accuracy > input.maximumAccuracyMeters;

  /*
   * A reading whose error bar straddles the boundary cannot honestly be called
   * inside or outside, and telling an administrator "outside" when the device
   * simply could not tell would send them chasing a geofence that is fine.
   */
  const inconclusive =
    accuracy !== null && Math.abs(distance - radius) < accuracy && !isInside;

  return {
    distanceMeters: distance,
    accuracyMeters: accuracy,
    radiusMeters: radius,
    isInside,
    accuracyExceedsRequirement,
    verdict: isInside ? "INSIDE" : inconclusive ? "INCONCLUSIVE" : "OUTSIDE",
  };
}

export function geofenceTestVerdictLabel(result: GeofenceTestResult) {
  if (result.verdict === "INSIDE") return "Inside work site";
  if (result.verdict === "OUTSIDE") return "Outside work site";
  return "Too close to call at this accuracy";
}
