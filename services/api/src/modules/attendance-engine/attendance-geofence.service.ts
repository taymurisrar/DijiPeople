import { Injectable } from '@nestjs/common';

/**
 * Where an attendance action happened, relative to the employee's work sites.
 *
 * PURE AND DETERMINISTIC. No database, no browser, no external map API — the
 * caller supplies the candidate sites and the reported position. That matters
 * because "were they inside the office?" is the question that decides whether a
 * web punch is accepted, and a decision that depends on a third-party service
 * being reachable is a decision that fails at the worst moment.
 *
 * PRIVACY. This answers one question about one moment. There is no method here
 * that takes a series of positions, and nothing in the engine stores a movement
 * history: coordinates are captured for a check-in or a check-out and for
 * nothing else.
 */

/** A position as reported by a device, before it has been believed. */
export interface ReportedPosition {
  latitude: number;
  longitude: number;
  /** The reporting device's own estimate of its error radius, in metres. */
  accuracyMeters?: number | null;
  capturedAt?: Date | null;
}

/** A work site as a geofence. */
export interface GeofenceCandidate {
  workSiteId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** Site override; falls back to the tenant default when absent. */
  radiusMeters: number | null;
  /** Site override for the worst GPS accuracy that may still be believed. */
  maximumAccuracyMeters: number | null;
  timezone: string | null;
}

export interface GeofenceEvaluationInput {
  position: ReportedPosition;
  /** Only sites the employee is authorised for, at the event's moment. */
  candidates: readonly GeofenceCandidate[];
  /** Tenant default radius, used where a site sets none. */
  defaultRadiusMeters: number;
  /** Tenant default accuracy ceiling, used where a site sets none. */
  defaultMaximumAccuracyMeters: number | null;
}

export interface GeofenceMatch {
  workSiteId: string;
  name: string;
  distanceMeters: number;
  radiusMeters: number;
  insideGeofence: boolean;
  timezone: string | null;
}

export interface GeofenceEvaluation {
  /** False when the position itself cannot be believed. */
  positionUsable: boolean;
  /** Set when the position was rejected; a stable code, not prose. */
  rejectionCode: 'COORDINATES_INVALID' | 'ACCURACY_TOO_LOW' | null;
  rejectionMessage: string | null;
  /** The accuracy ceiling actually applied, for the audit record. */
  appliedAccuracyLimitMeters: number | null;
  reportedAccuracyMeters: number | null;
  /** Closest authorised site, whether or not the position is inside it. */
  nearest: GeofenceMatch | null;
  /** The site whose geofence contains the position, if any. */
  insideSite: GeofenceMatch | null;
  /** Every candidate, nearest first. Evidence for the attendance record. */
  matches: GeofenceMatch[];
}

/** Mean Earth radius (IUGG), in metres. */
const EARTH_RADIUS_METERS = 6_371_008.8;

/** Below this, a "radius" is a point and no one could ever be inside it. */
const MINIMUM_USABLE_RADIUS_METERS = 5;

@Injectable()
export class AttendanceGeofenceService {
  /**
   * Evaluates a reported position against the employee's authorised sites.
   *
   * Accuracy is checked BEFORE distance, and a position that fails is not used
   * at all. A reading accurate to ±1500m sitting 40m from the office tells you
   * nothing about whether the person is in the building, and treating it as a
   * match would make the office-device rule trivially bypassable by anyone whose
   * phone reports poor accuracy.
   */
  evaluate(input: GeofenceEvaluationInput): GeofenceEvaluation {
    const { position } = input;

    if (
      !isValidLatitude(position.latitude) ||
      !isValidLongitude(position.longitude)
    ) {
      return {
        positionUsable: false,
        rejectionCode: 'COORDINATES_INVALID',
        rejectionMessage:
          'The location reported by your device is not valid. Please try again.',
        appliedAccuracyLimitMeters: null,
        reportedAccuracyMeters: numberOrNull(position.accuracyMeters),
        nearest: null,
        insideSite: null,
        matches: [],
      };
    }

    const matches = this.rankCandidates(input);
    const nearest = matches[0] ?? null;

    // The nearest site's own ceiling wins, so a high-security site can demand
    // better accuracy than the tenant default without raising it everywhere.
    const accuracyLimit = this.resolveAccuracyLimit(
      nearest ? this.candidateFor(input.candidates, nearest.workSiteId) : null,
      input.defaultMaximumAccuracyMeters,
    );

    const reportedAccuracy = numberOrNull(position.accuracyMeters);

    if (
      accuracyLimit !== null &&
      reportedAccuracy !== null &&
      reportedAccuracy > accuracyLimit
    ) {
      return {
        positionUsable: false,
        rejectionCode: 'ACCURACY_TOO_LOW',
        rejectionMessage:
          'Your location could not be verified accurately enough. Please improve location accuracy and try again.',
        appliedAccuracyLimitMeters: accuracyLimit,
        reportedAccuracyMeters: reportedAccuracy,
        // Still returned, as evidence for the audit record — but the caller must
        // not treat them as a decision, which `positionUsable: false` enforces.
        nearest,
        insideSite: null,
        matches,
      };
    }

    return {
      positionUsable: true,
      rejectionCode: null,
      rejectionMessage: null,
      appliedAccuracyLimitMeters: accuracyLimit,
      reportedAccuracyMeters: reportedAccuracy,
      nearest,
      insideSite: matches.find((match) => match.insideGeofence) ?? null,
      matches,
    };
  }

  /**
   * Great-circle distance in metres.
   *
   * Haversine on a spherical Earth. Accurate to a few metres per kilometre,
   * which is far finer than any office geofence needs, and it has no dependency
   * and no failure mode. A rectangular bounding box would have been simpler and
   * wrong: it makes the geofence bigger on the diagonal and its size depend on
   * latitude, so the same 100m rule would behave differently in Doha and Oslo.
   */
  distanceMeters(
    fromLatitude: number,
    fromLongitude: number,
    toLatitude: number,
    toLongitude: number,
  ): number {
    const phi1 = toRadians(fromLatitude);
    const phi2 = toRadians(toLatitude);
    const deltaPhi = toRadians(toLatitude - fromLatitude);
    const deltaLambda = toRadians(toLongitude - fromLongitude);

    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

    // atan2 rather than asin: numerically stable for antipodal points, where
    // asin loses precision badly.
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_METERS * c;
  }

  private rankCandidates(input: GeofenceEvaluationInput): GeofenceMatch[] {
    const matches: GeofenceMatch[] = [];

    for (const candidate of input.candidates) {
      // A site with no coordinates cannot be a geofence. Skipped rather than
      // treated as "everywhere" or "nowhere", both of which would be a guess.
      if (candidate.latitude === null || candidate.longitude === null) continue;
      if (!isValidLatitude(candidate.latitude)) continue;
      if (!isValidLongitude(candidate.longitude)) continue;

      const radiusMeters = Math.max(
        MINIMUM_USABLE_RADIUS_METERS,
        candidate.radiusMeters ?? input.defaultRadiusMeters,
      );

      const distanceMeters = this.distanceMeters(
        input.position.latitude,
        input.position.longitude,
        candidate.latitude,
        candidate.longitude,
      );

      matches.push({
        workSiteId: candidate.workSiteId,
        name: candidate.name,
        // Rounded for storage and display only; the comparison below uses the
        // unrounded value so a point exactly on the boundary is inside it.
        distanceMeters: Math.round(distanceMeters),
        radiusMeters,
        insideGeofence: distanceMeters <= radiusMeters,
        timezone: candidate.timezone,
      });
    }

    return matches.sort((left, right) => {
      // Inside beats near: standing inside a small geofence that sits within a
      // larger campus one should resolve to the specific building.
      if (left.insideGeofence !== right.insideGeofence) {
        return left.insideGeofence ? -1 : 1;
      }
      return left.distanceMeters - right.distanceMeters;
    });
  }

  private candidateFor(
    candidates: readonly GeofenceCandidate[],
    workSiteId: string,
  ): GeofenceCandidate | null {
    return candidates.find((item) => item.workSiteId === workSiteId) ?? null;
  }

  /** Site override, else tenant default, else no ceiling. */
  private resolveAccuracyLimit(
    candidate: GeofenceCandidate | null,
    tenantDefault: number | null,
  ): number | null {
    if (candidate?.maximumAccuracyMeters != null) {
      return candidate.maximumAccuracyMeters;
    }
    return tenantDefault;
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
