import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceExceptionSeverity,
  AttendanceExceptionStatus,
  AttendanceExceptionType,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceGeofenceService } from './attendance-geofence.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';

/**
 * Flags attendance recorded in two places too far apart to have travelled
 * between.
 *
 * A RISK SIGNAL, NOTHING MORE. It never rejects attendance, never alters a
 * session, never reduces worked time and never blocks payroll. It raises an
 * exception a human reads, because the honest explanations — a bad GPS fix, a
 * VPN, a shared login, someone genuinely on a plane — are indistinguishable to
 * the arithmetic and quite distinguishable to a person.
 *
 * NO EXTERNAL SERVICE. Distance comes from the same Haversine implementation the
 * geofence uses; there is no geocoding, no routing and no map API. A control that
 * fails when a third party is unreachable is not a control.
 *
 * THE TWO-CONDITION RULE is what keeps it useful. Distance alone would flag
 * ordinary travel; implied speed alone would flag two GPS readings 200 m apart a
 * second later, which happens constantly. Both must be exceeded.
 */

export interface TravelEvaluation {
  /** Pairs examined, whether or not they were flagged. */
  pairsExamined: number;
  /** Exceptions created or refreshed. */
  flagged: number;
  /** Skipped because the detector is switched off for the tenant. */
  disabled: boolean;
}

interface EvidencePoint {
  id: string;
  capturedAt: Date;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  matchedWorkSiteName: string | null;
  attendanceDate: Date;
}

/** Kilometres per metre, for turning the geofence's metres into kilometres. */
const METERS_PER_KM = 1000;

@Injectable()
export class ImpossibleTravelDetectorService {
  private readonly logger = new Logger(ImpossibleTravelDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geofence: AttendanceGeofenceService,
    private readonly policies: AttendancePolicyResolverService,
  ) {}

  /**
   * Evaluates one newly accepted evidence record against its neighbours.
   *
   * Bounded on purpose: it compares against the nearest earlier and the nearest
   * later accepted evidence, not the employee's history. Scanning everything on
   * every punch would turn a check-in into an O(history) query for a signal
   * nobody reads in real time.
   *
   * BOTH DIRECTIONS, because evidence arrives late. A gateway offline for two
   * days delivers A then C then B; comparing only backwards would evaluate A→C
   * and A→B and never notice that B→C is the impossible leg.
   */
  async evaluateForEvidence(
    tenantId: string,
    evidenceId: string,
  ): Promise<TravelEvaluation> {
    const policy = await this.policies.resolve(tenantId);

    if (!policy.impossibleTravelDetectionEnabled) {
      return { pairsExamined: 0, flagged: 0, disabled: true };
    }

    const subject = await this.loadPoint(tenantId, evidenceId);
    if (!subject) {
      return { pairsExamined: 0, flagged: 0, disabled: false };
    }

    const employeeId = subject.employeeId;

    const [earlier, later] = await Promise.all([
      this.findNeighbour(tenantId, employeeId, subject.point, 'before'),
      this.findNeighbour(tenantId, employeeId, subject.point, 'after'),
    ]);

    let pairsExamined = 0;
    let flagged = 0;

    for (const [from, to] of [
      [earlier, subject.point],
      [subject.point, later],
    ] as const) {
      if (!from || !to) continue;

      pairsExamined += 1;
      const outcome = this.assess(from, to, policy);

      if (outcome) {
        await this.raise(tenantId, employeeId, from, to, outcome);
        flagged += 1;
      }
    }

    return { pairsExamined, flagged, disabled: false };
  }

  /**
   * Decides whether a movement between two points is implausible.
   *
   * Pure and separated from the I/O around it, so the arithmetic can be tested
   * against real coordinates without a database.
   */
  assess(
    from: EvidencePoint,
    to: EvidencePoint,
    policy: {
      impossibleTravelMinimumDistanceKm: number;
      impossibleTravelMaximumSpeedKph: number;
    },
  ): TravelAssessment | null {
    const distanceMeters = this.geofence.distanceMeters(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude,
    );

    // The reported accuracy of both fixes is subtracted before judging. Two
    // readings each accurate to ±2 km could be 4 km apart while describing the
    // same spot, and flagging that would be blaming the employee for the phone.
    const tolerance = (from.accuracyMeters ?? 0) + (to.accuracyMeters ?? 0);
    const effectiveMeters = Math.max(0, distanceMeters - tolerance);
    const distanceKm = effectiveMeters / METERS_PER_KM;

    if (distanceKm < policy.impossibleTravelMinimumDistanceKm) {
      return null;
    }

    const elapsedMinutes = Math.max(
      0,
      (to.capturedAt.getTime() - from.capturedAt.getTime()) / 60_000,
    );

    // Two positions far apart at the same instant is the most impossible case
    // there is, and dividing by zero would hide it.
    if (elapsedMinutes === 0) {
      return {
        distanceKm: round1(distanceKm),
        elapsedMinutes: 0,
        requiredSpeedKph: Number.POSITIVE_INFINITY,
      };
    }

    const requiredSpeedKph = distanceKm / (elapsedMinutes / 60);

    if (requiredSpeedKph <= policy.impossibleTravelMaximumSpeedKph) {
      return null;
    }

    return {
      distanceKm: round1(distanceKm),
      elapsedMinutes: Math.round(elapsedMinutes),
      requiredSpeedKph: Math.round(requiredSpeedKph),
    };
  }

  /**
   * Loads the nearest accepted evidence before or after an instant.
   *
   * Only ALLOW outcomes with usable coordinates participate. A refused punch, or
   * one whose accuracy the geofence already rejected, is not a statement about
   * where anybody was — treating it as one would let a bad GPS fix create a
   * travel alert against a perfectly good punch.
   *
   * THE BACKWARD LOOK INCLUDES AN EXACT TIE (`lte`, minus the subject itself).
   * Two accepted positions sharing an instant is the most impossible case there
   * is, and a strict `lt` on both sides would have been the one thing that let it
   * through unexamined. Only the backward query admits ties, so such a pair is
   * evaluated once rather than from both ends.
   */
  private async findNeighbour(
    tenantId: string,
    employeeId: string,
    subject: EvidencePoint,
    direction: 'before' | 'after',
  ): Promise<EvidencePoint | null> {
    const at = subject.capturedAt;

    const row = await this.prisma.attendanceLocationEvidence.findFirst({
      where: {
        tenantId,
        employeeId,
        outcome: 'ALLOW',
        latitude: { not: null },
        longitude: { not: null },
        ...(direction === 'before'
          ? { capturedAt: { lte: at }, id: { not: subject.id } }
          : { capturedAt: { gt: at } }),
      },
      orderBy: { capturedAt: direction === 'before' ? 'desc' : 'asc' },
      select: {
        id: true,
        capturedAt: true,
        latitude: true,
        longitude: true,
        accuracyMeters: true,
        attendanceDate: true,
        matchedWorkSite: { select: { name: true } },
      },
    });

    return row ? toPoint(row) : null;
  }

  private async loadPoint(
    tenantId: string,
    evidenceId: string,
  ): Promise<{ employeeId: string; point: EvidencePoint } | null> {
    const row = await this.prisma.attendanceLocationEvidence.findFirst({
      where: {
        id: evidenceId,
        tenantId,
        outcome: 'ALLOW',
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        employeeId: true,
        capturedAt: true,
        latitude: true,
        longitude: true,
        accuracyMeters: true,
        attendanceDate: true,
        matchedWorkSite: { select: { name: true } },
      },
    });

    if (!row) return null;

    return { employeeId: row.employeeId, point: toPoint(row) };
  }

  /**
   * Records the finding.
   *
   * Keyed on the evidence PAIR, so re-evaluating the same two points — which
   * happens whenever either neighbour is re-examined — updates one row instead of
   * stacking duplicates.
   *
   * The exception carries ids, distance, elapsed time and implied speed. It does
   * NOT carry coordinates: the exception list is read by every manager, and the
   * positions stay in AttendanceLocationEvidence behind their own permission.
   */
  private async raise(
    tenantId: string,
    employeeId: string,
    from: EvidencePoint,
    to: EvidencePoint,
    assessment: TravelAssessment,
  ): Promise<void> {
    // Ordered by evidence id, so the same pair produces the same key whichever
    // of the two triggered the evaluation.
    const [firstId, secondId] = [from.id, to.id].sort();

    const dedupeKey = createHash('sha256')
      .update(
        [
          employeeId,
          firstId,
          secondId,
          AttendanceExceptionType.IMPOSSIBLE_TRAVEL,
        ].join('|'),
        'utf8',
      )
      .digest('hex');

    const detail = {
      evidenceAId: from.id,
      evidenceBId: to.id,
      distanceKm: assessment.distanceKm,
      elapsedMinutes: assessment.elapsedMinutes,
      requiredSpeedKph: Number.isFinite(assessment.requiredSpeedKph)
        ? assessment.requiredSpeedKph
        : null,
      // Site NAMES are business context a reviewer needs and are not a position.
      fromWorkSite: from.matchedWorkSiteName,
      toWorkSite: to.matchedWorkSiteName,
      fromCapturedAt: from.capturedAt.toISOString(),
      toCapturedAt: to.capturedAt.toISOString(),
    };

    const message = buildMessage(from, to, assessment);

    // Attached to the reconciled day when there is one. Without this the finding
    // exists but the day's openExceptionCount never counts it, so the manager's
    // "Needs review" list — which is keyed on that column — would quietly omit
    // exactly the days somebody needs to look at.
    const attendanceDay = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_attendanceDate: {
          tenantId,
          employeeId,
          attendanceDate: to.attendanceDate,
        },
      },
      select: { id: true },
    });

    await this.prisma.attendanceException.upsert({
      where: { tenantId_dedupeKey: { tenantId, dedupeKey } },
      create: {
        tenantId,
        employeeId,
        attendanceDayId: attendanceDay?.id ?? null,
        // Attributed to the LATER day, which is the one a reviewer opens.
        attendanceDate: to.attendanceDate,
        type: AttendanceExceptionType.IMPOSSIBLE_TRAVEL,
        // WARNING, not BLOCKING: the day's numbers are not in doubt, only how the
        // two locations can both be true. Blocking would stop attendance being
        // treated as a result over what may well be a bad GPS fix.
        severity: AttendanceExceptionSeverity.WARNING,
        status: AttendanceExceptionStatus.OPEN,
        dedupeKey,
        message,
        detail,
      },
      // Deliberately does not reopen a resolved or ignored finding: HR who has
      // already decided "bad GPS" should not be asked again on every re-run.
      update: { message, detail },
      select: { id: true },
    });

    if (attendanceDay) {
      // Recounted rather than incremented, so a re-run of the same pair does not
      // inflate the figure and a closed finding drops back out of it.
      const open = await this.prisma.attendanceException.count({
        where: {
          attendanceDayId: attendanceDay.id,
          status: AttendanceExceptionStatus.OPEN,
        },
      });

      await this.prisma.attendanceDay.update({
        where: { id: attendanceDay.id },
        data: { openExceptionCount: open },
      });
    }

    this.logger.warn(
      `Impossible travel flagged for employee ${employeeId}: ${assessment.distanceKm} km in ${assessment.elapsedMinutes} minute(s).`,
    );
  }
}

export interface TravelAssessment {
  distanceKm: number;
  elapsedMinutes: number;
  /** Infinity when two distant positions share an instant. */
  requiredSpeedKph: number;
}

/**
 * A reviewer-facing sentence. Names the sites and the arithmetic, never the
 * coordinates.
 */
function buildMessage(
  from: EvidencePoint,
  to: EvidencePoint,
  assessment: TravelAssessment,
): string {
  const places =
    from.matchedWorkSiteName && to.matchedWorkSiteName
      ? ` between ${from.matchedWorkSiteName} and ${to.matchedWorkSiteName}`
      : '';

  if (!Number.isFinite(assessment.requiredSpeedKph)) {
    return `Attendance was recorded ${assessment.distanceKm} km apart${places} at the same moment. This needs review.`;
  }

  return `Attendance was recorded ${assessment.distanceKm} km apart${places} within ${assessment.elapsedMinutes} minute(s), which would require about ${assessment.requiredSpeedKph} km/h. This needs review.`;
}

function toPoint(row: {
  id: string;
  capturedAt: Date;
  latitude: unknown;
  longitude: unknown;
  accuracyMeters: number | null;
  attendanceDate: Date;
  matchedWorkSite: { name: string } | null;
}): EvidencePoint {
  return {
    id: row.id,
    capturedAt: row.capturedAt,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracyMeters,
    matchedWorkSiteName: row.matchedWorkSite?.name ?? null,
    attendanceDate: row.attendanceDate,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
