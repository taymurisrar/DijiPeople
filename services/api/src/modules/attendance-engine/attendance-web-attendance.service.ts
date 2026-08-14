import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AttendanceMethod,
  EmployeeWorkMode,
  WorkSiteDevicePolicy,
  WorkSiteWebAttendancePolicy,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AttendanceGeofenceService,
  type GeofenceEvaluation,
  type ReportedPosition,
} from './attendance-geofence.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';
import { AttendanceReconciliationQueueService } from './attendance-reconciliation-queue.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';

/**
 * Decides whether a web or mobile attendance action may be recorded, and as what.
 *
 * SERVER-DERIVED, ALWAYS. The browser sends coordinates and nothing else that
 * matters. It does not get to say whether it is inside the office, how far away
 * it is, or which work mode to record — those are the three claims that would
 * make the office-device rule a suggestion. The client's job is to report a
 * position; every conclusion drawn from it is reached here.
 *
 * THE RULE THIS EXISTS FOR: an employee standing inside a work site that
 * requires an attendance device cannot check in from their phone. Enforced here,
 * on the server, because a front-end check is a UI convenience and not a control.
 */

export type WebAttendanceDecisionOutcome =
  /** Record it, as the returned work mode. */
  | 'ALLOW'
  /** Refuse; the employee must use a device or is not permitted to work this way. */
  | 'BLOCK'
  /** Refuse a direct punch, but a fallback request may be raised instead. */
  | 'REQUIRE_FALLBACK_REQUEST';

export interface WebAttendanceDecision {
  outcome: WebAttendanceDecisionOutcome;
  /** The mode the server decided. Never what the client asked for. */
  workMode: EmployeeWorkMode;
  workSiteId: string | null;
  workSiteName: string | null;
  /** Stable code for the client to branch on; the message is for the human. */
  reasonCode: string;
  message: string | null;
  /** Geofence evidence, persisted with the attendance record for audit. */
  evidence: {
    insideGeofence: boolean;
    distanceMeters: number | null;
    accuracyMeters: number | null;
    accuracyLimitMeters: number | null;
    /// The radius the distance was measured against. Configuration that can
    /// change, so a decision cannot be explained later without it.
    geofenceRadiusMeters: number | null;
    nearestWorkSiteId: string | null;
    nearestWorkSiteName: string | null;
    evaluatedAt: string;
  };
}

export interface WebAttendanceRequest {
  tenantId: string;
  employeeId: string;
  position: ReportedPosition;
  /**
   * How the punch is being captured. A separate axis from work mode: this is
   * the channel (WEB, MOBILE), and the decision returns the arrangement
   * (OFFICE, REMOTE, FIELD) it should be recorded under.
   */
  captureMethod?: AttendanceMethod;
  /** When the caller knows this is a fallback attempt after a device failure. */
  fallbackRequested?: boolean;
  /** The moment the decision is being made, supplied so it stays testable. */
  at: Date;
}

@Injectable()
export class AttendanceWebAttendanceService {
  private readonly logger = new Logger(AttendanceWebAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geofence: AttendanceGeofenceService,
    private readonly policies: AttendancePolicyResolverService,
    private readonly queue: AttendanceReconciliationQueueService,
    private readonly impossibleTravel: ImpossibleTravelDetectorService,
  ) {}

  /**
   * Records why a location-validated attendance action was accepted or refused.
   *
   * REFUSALS ARE RECORDED TOO. "The system said no, and here is exactly why" is
   * precisely what a disputed attendance claim needs, and an employee who was
   * told to use the reader has no other trace that they tried.
   *
   * The radius and accuracy limit are stored alongside the distance because they
   * are configuration that changes. Without them a past decision can only be
   * re-guessed against today's settings, which is not the same as explaining it.
   *
   * Best effort: the attendance action itself has already been decided, and
   * failing it because an audit row could not be written would be the wrong
   * trade — the decision stands either way, and the gap is visible.
   */
  async recordLocationEvidence(input: {
    tenantId: string;
    employeeId: string;
    attendanceDate: Date;
    action: 'CHECK_IN' | 'CHECK_OUT';
    captureSource: 'WEB' | 'MOBILE';
    position: ReportedPosition;
    decision: WebAttendanceDecision;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      const created = await this.prisma.attendanceLocationEvidence.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          attendanceDate: input.attendanceDate,
          capturedAt: input.position.capturedAt ?? new Date(),
          action: input.action,
          captureSource: input.captureSource,
          latitude: toDecimal(input.position.latitude),
          longitude: toDecimal(input.position.longitude),
          accuracyMeters: toInteger(input.position.accuracyMeters),
          matchedWorkSiteId:
            input.decision.workSiteId ??
            input.decision.evidence.nearestWorkSiteId,
          distanceMeters: input.decision.evidence.distanceMeters,
          insideGeofence: input.decision.evidence.insideGeofence,
          geofenceRadiusMeters: input.decision.evidence.geofenceRadiusMeters,
          effectiveAccuracyLimitMeters:
            input.decision.evidence.accuracyLimitMeters,
          outcome: input.decision.outcome,
          reasonCode: input.decision.reasonCode,
          resolvedWorkMode:
            input.decision.outcome === 'ALLOW' ? input.decision.workMode : null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 500) ?? null,
        },
        select: { id: true },
      });

      // Only accepted positions are worth comparing: a refused punch is not a
      // statement about where anybody was. Evaluated here, against the two
      // nearest neighbours only — scanning the employee's history on every
      // check-in would be an expensive way to produce a signal nobody reads in
      // real time.
      if (created && input.decision.outcome === 'ALLOW') {
        await this.impossibleTravel.evaluateForEvidence(
          input.tenantId,
          created.id,
        );
      }
    } catch (error) {
      this.logger.error(
        `Attendance location evidence could not be recorded for employee ${input.employeeId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Records an accepted web or mobile punch as raw evidence.
   *
   * WEB PUNCHES GO THROUGH THE SAME PIPELINE AS DEVICE PUNCHES. Writing them
   * only onto AttendanceEntry would leave the engine with no evidence to
   * reconcile, and a hybrid day needs both the device punches and the web ones
   * in one ordered stream to pair them into sessions at all.
   *
   * The direction is recorded on the event, because a browser check-out knows it
   * is a check-out. That is the difference between a source that states its
   * intent and a terminal, which only records that a card was presented.
   */
  async recordWebPunch(input: {
    tenantId: string;
    employeeId: string;
    direction: 'CHECK_IN' | 'CHECK_OUT';
    occurredAt: Date;
    decision: WebAttendanceDecision;
    timezone: string;
    attendanceDate: Date;
    captureSource: 'WEB' | 'MOBILE';
    isFallback?: boolean;
  }): Promise<void> {
    const occurredAtLocal = toLocalWallClock(input.occurredAt, input.timezone);

    // Scoped to the employee rather than a device: a web punch has no device to
    // scope by, and two employees may legitimately punch in the same second.
    const dedupeScopeKey = `employee:${input.employeeId}`;
    const eventFingerprint = createHash('sha256')
      .update(
        [
          input.employeeId,
          occurredAtLocal,
          input.direction,
          input.captureSource,
        ].join('␟'),
        'utf8',
      )
      .digest('hex');

    await this.prisma.rawAttendanceEvent.upsert({
      where: {
        tenantId_dedupeScopeKey_eventFingerprint: {
          tenantId: input.tenantId,
          dedupeScopeKey,
          eventFingerprint,
        },
      },
      create: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        occurredAtLocal,
        // A web punch happens at a known instant, unlike a terminal's bare wall
        // clock, so the resolved UTC value is recorded rather than inferred.
        occurredAtUtc: input.occurredAt,
        deviceTimezone: input.timezone,
        captureSource: input.captureSource,
        workMode: input.decision.workMode,
        locationId: input.decision.workSiteId,
        eventFingerprint,
        dedupeScopeKey,
        mappingStatus: 'MAPPED',
        processingStatus: 'PENDING',
        // Sanitised and explicit. Geofence evidence for the audit trail, plus
        // the direction the engine would otherwise have to guess at. No raw
        // coordinates: those belong on the attendance record, not on a payload
        // that travels with the event.
        rawPayload: {
          direction: input.direction,
          insideGeofence: input.decision.evidence.insideGeofence,
          distanceMeters: input.decision.evidence.distanceMeters,
          accuracyMeters: input.decision.evidence.accuracyMeters,
          reasonCode: input.decision.reasonCode,
          isFallback: input.isFallback === true,
        },
      },
      // A repeated submission of the same punch is the same evidence. Kept
      // idempotent so a double-tapped button cannot open a phantom session.
      update: {},
      select: { id: true },
    });

    await this.queue.enqueue({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      attendanceDate: input.attendanceDate,
      reason: `WEB_${input.direction}`,
    });
  }

  /**
   * Evaluates a web or mobile attendance attempt.
   *
   * Order matters: the position is validated before anything is concluded from
   * it, then the work-site rules are applied, then the employee's work mode.
   * Checking the work mode first would let an OFFICE employee's block be
   * reported as "you are not allowed to work remotely" when the real answer is
   * "you are standing in the office, use the reader".
   */
  async evaluate(
    request: WebAttendanceRequest,
  ): Promise<WebAttendanceDecision> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: request.employeeId,
        tenantId: request.tenantId,
        isDeleted: false,
      },
      select: { id: true, workMode: true, organizationId: true },
    });

    if (!employee) {
      return this.block(
        'EMPLOYEE_NOT_FOUND',
        'No employee record is linked to this account.',
        EmployeeWorkMode.OFFICE,
        null,
      );
    }

    const policy = await this.policies.resolve(
      request.tenantId,
      employee.organizationId,
    );
    const permissions = this.policies.permissionsFor(employee.workMode);

    if (policy.webAttendancePolicy === 'DISALLOWED') {
      return this.block(
        'WEB_ATTENDANCE_DISABLED',
        'Web attendance is switched off for your organisation. Please use an attendance device.',
        EmployeeWorkMode.OFFICE,
        null,
      );
    }

    const sites = await this.loadAuthorizedSites(
      request.tenantId,
      request.employeeId,
      request.at,
    );

    const evaluation = this.geofence.evaluate({
      position: request.position,
      candidates: sites.map((site) => ({
        workSiteId: site.id,
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        radiusMeters: site.allowedRadiusMeters,
        maximumAccuracyMeters: site.maximumAccuracyMeters,
        timezone: site.timezone,
      })),
      defaultRadiusMeters: policy.defaultRadiusMeters,
      defaultMaximumAccuracyMeters: policy.maximumAccuracyMeters,
    });

    if (!evaluation.positionUsable) {
      // A position that cannot be trusted is not silently downgraded to
      // "outside the office" — that is exactly the loophole that would let poor
      // GPS bypass a device-required site.
      return {
        outcome: 'BLOCK',
        workMode: EmployeeWorkMode.OFFICE,
        workSiteId: null,
        workSiteName: null,
        reasonCode: evaluation.rejectionCode ?? 'LOCATION_UNUSABLE',
        message: evaluation.rejectionMessage,
        evidence: this.toEvidence(evaluation, request.at),
      };
    }

    return evaluation.insideSite
      ? this.decideInsideWorkSite(
          evaluation,
          sites,
          policy,
          permissions,
          request,
        )
      : this.decideOutsideWorkSites(evaluation, permissions, policy, request);
  }

  /**
   * The employee is standing inside an authorised work site.
   *
   * This is the case the phase is really about. A site that requires a device
   * refuses the web punch and says so by name, because "you are within Doha HQ,
   * please use an attendance device" is actionable where a generic refusal is
   * not.
   */
  private decideInsideWorkSite(
    evaluation: GeofenceEvaluation,
    sites: readonly WorkSiteRow[],
    policy: Awaited<ReturnType<AttendancePolicyResolverService['resolve']>>,
    permissions: ReturnType<AttendancePolicyResolverService['permissionsFor']>,
    request: WebAttendanceRequest,
  ): WebAttendanceDecision {
    const inside = evaluation.insideSite!;
    const site = sites.find((item) => item.id === inside.workSiteId)!;
    const sitePolicy = this.policies.resolveWorkSite(site, policy);
    const evidence = this.toEvidence(evaluation, request.at);

    if (!sitePolicy.attendanceEnabled) {
      return {
        outcome: 'BLOCK',
        workMode: EmployeeWorkMode.OFFICE,
        workSiteId: inside.workSiteId,
        workSiteName: inside.name,
        reasonCode: 'WORK_SITE_ATTENDANCE_DISABLED',
        message: `Attendance is not being collected at ${inside.name}.`,
        evidence,
      };
    }

    /*
     * The site's allowed-method restriction, applied BEFORE the device rule.
     *
     * Order matters. A site that permits DEVICE only has said this channel is
     * not usable here at all, so it must not then be offered the web fallback
     * that the device rule would otherwise open — a fallback is for when the
     * reader is broken, not for a method the tenant excluded. Checking it first
     * is what stops `allowedAttendanceMethods` from accidentally loosening a
     * stricter policy instead of tightening it.
     */
    const captureMethod = request.captureMethod ?? AttendanceMethod.WEB;
    if (!sitePolicy.allowedMethods.includes(captureMethod)) {
      return {
        outcome: 'BLOCK',
        workMode: EmployeeWorkMode.OFFICE,
        workSiteId: inside.workSiteId,
        workSiteName: inside.name,
        reasonCode: 'METHOD_NOT_ALLOWED',
        message: `${inside.name} accepts attendance only through ${describeMethods(
          sitePolicy.allowedMethods,
        )}.`,
        evidence,
      };
    }

    const deviceRequired =
      sitePolicy.devicePolicy === WorkSiteDevicePolicy.DEVICE_REQUIRED ||
      sitePolicy.webAttendancePolicy ===
        WorkSiteWebAttendancePolicy.DISALLOWED ||
      policy.officeWebAttendancePolicy === 'DISALLOWED';

    const fallbackOnly =
      sitePolicy.webAttendancePolicy ===
        WorkSiteWebAttendancePolicy.FALLBACK_ONLY ||
      policy.officeWebAttendancePolicy === 'FALLBACK_ONLY';

    if (deviceRequired || fallbackOnly) {
      // A fallback path exists only where the tenant AND the site both allow
      // one. Where they do, this is not an ordinary web punch: it becomes a
      // request that someone approves, which is the whole point of the policy.
      const fallbackAvailable =
        sitePolicy.webFallbackEnabled && policy.webFallbackPolicy !== 'NEVER';

      if (fallbackAvailable) {
        return {
          outcome: 'REQUIRE_FALLBACK_REQUEST',
          workMode: EmployeeWorkMode.OFFICE,
          workSiteId: inside.workSiteId,
          workSiteName: inside.name,
          reasonCode: 'WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE',
          message: `You are currently within ${inside.name}. Please use an attendance device, or request web attendance if the device is unavailable.`,
          evidence,
        };
      }

      return {
        outcome: 'BLOCK',
        workMode: EmployeeWorkMode.OFFICE,
        workSiteId: inside.workSiteId,
        workSiteName: inside.name,
        reasonCode: 'WORK_SITE_REQUIRES_DEVICE',
        message: `You are currently within ${inside.name}. Please use an attendance device to check in.`,
        evidence,
      };
    }

    if (!permissions.allowsOfficeWork) {
      return {
        outcome: 'BLOCK',
        workMode: EmployeeWorkMode.OFFICE,
        workSiteId: inside.workSiteId,
        workSiteName: inside.name,
        reasonCode: 'WORK_MODE_DISALLOWS_OFFICE',
        message: `Your work arrangement does not cover attendance at ${inside.name}.`,
        evidence,
      };
    }

    // Inside an authorised site with no device requirement: an ordinary office
    // session recorded from the web.
    return {
      outcome: 'ALLOW',
      workMode: EmployeeWorkMode.OFFICE,
      workSiteId: inside.workSiteId,
      workSiteName: inside.name,
      reasonCode: 'OFFICE_WEB_ALLOWED',
      message: null,
      evidence,
    };
  }

  /**
   * The employee is outside every authorised work site.
   *
   * The employee's configured work mode decides. OFFICE is refused because an
   * office employee working from home is an exception someone should see, not a
   * silent default — and the refusal names the reason so they can request the
   * correction the policy provides.
   */
  private decideOutsideWorkSites(
    evaluation: GeofenceEvaluation,
    permissions: ReturnType<AttendancePolicyResolverService['permissionsFor']>,
    policy: Awaited<ReturnType<AttendancePolicyResolverService['resolve']>>,
    request: WebAttendanceRequest,
  ): WebAttendanceDecision {
    const evidence = this.toEvidence(evaluation, request.at);
    const nearest = evaluation.nearest;

    if (permissions.allowsFieldWork) {
      // Field work happens away from fixed sites by definition, so being outside
      // every geofence is the expected condition rather than an exception.
      return {
        outcome: 'ALLOW',
        workMode: EmployeeWorkMode.FIELD,
        workSiteId: null,
        workSiteName: null,
        reasonCode: 'FIELD_WORK_ALLOWED',
        message: null,
        evidence,
      };
    }

    if (permissions.allowsRemoteWork) {
      if (policy.webAttendancePolicy === 'FALLBACK_ONLY') {
        return {
          outcome: 'REQUIRE_FALLBACK_REQUEST',
          workMode: EmployeeWorkMode.REMOTE,
          workSiteId: null,
          workSiteName: null,
          reasonCode: 'REMOTE_REQUIRES_APPROVAL',
          message:
            'Remote attendance needs approval in your organisation. Submit a request and your manager will review it.',
          evidence,
        };
      }

      return {
        outcome: 'ALLOW',
        workMode: EmployeeWorkMode.REMOTE,
        workSiteId: null,
        workSiteName: null,
        reasonCode: 'REMOTE_WORK_ALLOWED',
        message: null,
        evidence,
      };
    }

    return {
      outcome: 'BLOCK',
      workMode: EmployeeWorkMode.OFFICE,
      workSiteId: null,
      workSiteName: null,
      reasonCode: 'WORK_MODE_DISALLOWS_REMOTE',
      message: nearest
        ? `Your work arrangement is on-site only, and you are ${formatDistance(nearest.distanceMeters)} from ${nearest.name}. Please check in at your work site, or ask your manager to record this attendance.`
        : 'Your work arrangement is on-site only. Please check in at your work site, or ask your manager to record this attendance.',
      evidence,
    };
  }

  /**
   * The work sites an employee may attend at this moment.
   *
   * Effective-dated through the resolver, then loaded with their geofence
   * columns. Inactive sites are excluded here rather than being ranked and
   * discarded later, so a decommissioned office cannot silently keep accepting
   * attendance.
   */
  private async loadAuthorizedSites(
    tenantId: string,
    employeeId: string,
    at: Date,
  ): Promise<WorkSiteRow[]> {
    const siteIds = await this.policies.resolveAuthorizedWorkSites(
      tenantId,
      employeeId,
      at,
    );

    if (siteIds.length === 0) return [];

    return this.prisma.location.findMany({
      where: {
        tenantId,
        id: { in: siteIds },
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
          { OR: [{ validTo: null }, { validTo: { gte: at } }] },
        ],
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        allowedRadiusMeters: true,
        maximumAccuracyMeters: true,
        timezone: true,
        attendanceEnabled: true,
        devicePolicy: true,
        webAttendancePolicy: true,
        webFallbackEnabled: true,
        allowedAttendanceMethods: true,
      },
    });
  }

  private toEvidence(
    evaluation: GeofenceEvaluation,
    at: Date,
  ): WebAttendanceDecision['evidence'] {
    return {
      insideGeofence: evaluation.insideSite !== null,
      distanceMeters: evaluation.nearest?.distanceMeters ?? null,
      accuracyMeters: evaluation.reportedAccuracyMeters,
      accuracyLimitMeters: evaluation.appliedAccuracyLimitMeters,
      geofenceRadiusMeters: evaluation.nearest?.radiusMeters ?? null,
      nearestWorkSiteId: evaluation.nearest?.workSiteId ?? null,
      nearestWorkSiteName: evaluation.nearest?.name ?? null,
      evaluatedAt: at.toISOString(),
    };
  }

  private block(
    reasonCode: string,
    message: string,
    workMode: EmployeeWorkMode,
    workSiteId: string | null,
  ): WebAttendanceDecision {
    return {
      outcome: 'BLOCK',
      workMode,
      workSiteId,
      workSiteName: null,
      reasonCode,
      message,
      evidence: {
        insideGeofence: false,
        distanceMeters: null,
        accuracyMeters: null,
        accuracyLimitMeters: null,
        geofenceRadiusMeters: null,
        nearestWorkSiteId: null,
        nearestWorkSiteName: null,
        evaluatedAt: new Date().toISOString(),
      },
    };
  }
}

interface WorkSiteRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  allowedRadiusMeters: number | null;
  maximumAccuracyMeters: number | null;
  timezone: string | null;
  attendanceEnabled: boolean | null;
  devicePolicy: WorkSiteDevicePolicy | null;
  webAttendancePolicy: WorkSiteWebAttendancePolicy | null;
  webFallbackEnabled: boolean | null;
  allowedAttendanceMethods: AttendanceMethod[];
}

/**
 * Names the permitted methods the way a person would say them.
 *
 * The enum values are an implementation detail; an employee told
 * "METHOD_NOT_ALLOWED: [DEVICE]" learns nothing they can act on.
 */
function describeMethods(methods: readonly AttendanceMethod[]): string {
  const labels: Record<AttendanceMethod, string> = {
    DEVICE: 'an attendance device',
    WEB: 'the web app',
    MOBILE: 'the mobile app',
    MANUAL: 'a manual entry by your administrator',
  };
  const named = methods.map((method) => labels[method]);
  if (named.length === 0) return 'no method that is currently available to you';
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(', ')} or ${named[named.length - 1]}`;
}

/** Rounded for a human. Nobody needs "1,247 metres" in a refusal message. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Renders an instant as the wall clock a person at that place would read.
 *
 * `RawAttendanceEvent.occurredAtLocal` is wall clock with no offset for every
 * source, so a web punch has to be expressed the same way a terminal's would be.
 * Formatting through Intl with the named zone keeps it correct across DST rather
 * than assuming a fixed offset.
 */
function toLocalWallClock(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}:${read('second')}`;
}

/**
 * Coordinates are stored at seven decimal places — roughly a centimetre, far
 * finer than any GPS fix, so nothing the device reports is lost to rounding.
 */
function toDecimal(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toInteger(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;
}
