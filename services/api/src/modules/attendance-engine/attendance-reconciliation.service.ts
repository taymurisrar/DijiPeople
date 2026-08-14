import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceDayStatus,
  AttendanceExceptionSeverity,
  AttendanceExceptionStatus,
  AttendanceCorrectionType,
  AttendanceExceptionType,
  AttendanceSessionStatus,
  EmployeeWorkMode,
  Prisma,
  RawAttendanceCaptureSource,
  RawAttendanceProcessingStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  combineDateAndTimeInTimezone,
  differenceInMinutes,
} from '../attendance/attendance-time.util';
import {
  AttendanceDayContextService,
  type AttendanceDayContext,
} from './attendance-day-context.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';
import {
  AttendanceSessionBuilderService,
  type BuiltException,
  type BuiltSession,
  type PunchWorkMode,
} from './attendance-session-builder.service';
import {
  PunchInterpreterService,
  type DeviceInterpretationConfig,
  type InterpretablePunch,
  type InterpretedPunch,
  type PunchDirection,
} from './punch-interpreter.service';

/**
 * Turns evidence into attendance.
 *
 * PROVIDER-NEUTRAL. Nothing in this file knows about ZKTeco, or about any
 * device vendor. It consumes RawAttendanceEvent, which is the same shape whether
 * a punch came from a terminal, a browser, a phone, an HR correction, a partner
 * API or a file import — so the same reconciliation runs for all six.
 *
 * DETERMINISTIC. Given the same events, mapping, shift, policies and approved
 * adjustments, this produces byte-identical sessions, totals and exceptions. The
 * only clock reads are the audit stamps (`lastReconciledAt`, `detectedAt`), never
 * a calculation input. That is what makes it safe to re-run: a recalculation
 * months later reproduces the same day rather than a different one.
 *
 * RAW EVENTS ARE NEVER MODIFIED, except for the processing-status bookkeeping
 * the model already provides. A correction does not rewrite what the device
 * reported; it is a separate, approved statement that is applied on top.
 */

/** Bumped when the calculation changes in a way that would alter past results. */
export const RECONCILIATION_VERSION = 1;

export interface ReconciliationResult {
  attendanceDayId: string | null;
  status: AttendanceDayStatus;
  sessionCount: number;
  workedMinutes: number;
  openExceptionCount: number;
  /** True when the day was locked and derived state was deliberately untouched. */
  skippedBecauseLocked: boolean;
  /** True when the day predates the tenant's engine cutover. */
  skippedBeforeCutover: boolean;
}

@Injectable()
export class AttendanceReconciliationService {
  private readonly logger = new Logger(AttendanceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AttendanceDayContextService,
    private readonly policies: AttendancePolicyResolverService,
    private readonly interpreter: PunchInterpreterService,
    private readonly sessions: AttendanceSessionBuilderService,
  ) {}

  /**
   * Rebuilds one employee-day from its evidence.
   *
   * Everything derived is replaced inside a single transaction. A crash halfway
   * through must not leave a day with its old sessions deleted and its new ones
   * unwritten — an employee with an empty attendance day is indistinguishable
   * from an absence.
   */
  async reconcile(
    tenantId: string,
    employeeId: string,
    attendanceDate: Date,
  ): Promise<ReconciliationResult> {
    const context = await this.context.build(
      tenantId,
      employeeId,
      attendanceDate,
    );

    if (!context) {
      return emptyResult({ skippedBeforeCutover: false });
    }

    const policy = await this.policies.resolve(tenantId);

    // Existing tenants hold years of AttendanceEntry rows with no raw events
    // behind them. Reconciling those would replace real recorded history with an
    // empty calculation, so the engine refuses to touch anything before the
    // tenant's declared cutover.
    if (
      policy.engineEffectiveFrom &&
      context.attendanceDate < policy.engineEffectiveFrom
    ) {
      return emptyResult({ skippedBeforeCutover: true });
    }

    const existingDay = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_attendanceDate: {
          tenantId,
          employeeId,
          attendanceDate: context.attendanceDate,
        },
      },
      select: { id: true, locked: true },
    });

    if (existingDay?.locked) {
      // The period is finalised. New evidence is preserved and surfaced as an
      // exception; the numbers payroll already used do not move underneath it.
      await this.recordLockedPeriodEvidence(context, existingDay.id);
      return {
        attendanceDayId: existingDay.id,
        status: AttendanceDayStatus.PENDING,
        sessionCount: 0,
        workedMinutes: 0,
        openExceptionCount: 0,
        skippedBecauseLocked: true,
        skippedBeforeCutover: false,
      };
    }

    const [rawEvents, adjustments, authorizedWorkSiteIds, leave] =
      await Promise.all([
        this.loadRawEvents(context),
        this.loadApprovedAdjustments(context),
        this.policies.resolveAuthorizedWorkSites(
          tenantId,
          employeeId,
          context.attendanceDate,
        ),
        this.loadApprovedLeave(context),
      ]);

    const devices = await this.loadDeviceConfiguration(
      tenantId,
      rawEvents,
      policy.defaultPunchDirectionStrategy,
    );

    const { punches, workModes } = this.toInterpretablePunches(
      rawEvents,
      adjustments,
      context,
    );

    const interpreted = this.interpreter.interpret(punches, {
      devices,
      defaultStrategy: policy.defaultPunchDirectionStrategy,
      semanticDuplicateWindowSeconds: policy.semanticDuplicateWindowSeconds,
      shiftStartAt: context.shiftStartAt,
      shiftEndAt: context.shiftEndAt,
    });

    const built = this.sessions.build(interpreted, workModes, {
      policy: policy.sessionPolicy,
      shiftStartAt: context.shiftStartAt,
      shiftEndAt: context.shiftEndAt,
      authorizedWorkSiteIds: new Set(authorizedWorkSiteIds),
    });

    const dayExceptions = this.detectDayExceptions(
      context,
      built.sessions,
      leave,
    );

    const totals = this.calculateTotals(
      context,
      built.sessions,
      policy.overtimeMinimumMinutes,
      this.sumApprovedOvertime(adjustments),
    );

    const allExceptions = [...built.exceptions, ...dayExceptions];

    return this.persist(
      context,
      built.sessions,
      allExceptions,
      totals,
      leave,
      rawEvents.map((event) => event.id),
    );
  }

  // ------------------------------------------------------------------ loading

  /**
   * Loads the raw events that fall inside this attendance day's window.
   *
   * Queried on `occurredAtLocal` — a string — because that is the column every
   * source is guaranteed to populate and the one that is indexed;
   * `occurredAtUtc` is nullable until a timezone has been resolved. The string
   * range is deliberately generous and the precise window is applied in memory
   * once each event's instant has been resolved.
   */
  private async loadRawEvents(context: AttendanceDayContext) {
    const fromKey = localKey(
      new Date(context.windowStartAt.getTime() - DAY_MS),
    );
    const toKey = localKey(new Date(context.windowEndAt.getTime() + DAY_MS));

    const events = await this.prisma.rawAttendanceEvent.findMany({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        occurredAtLocal: { gte: fromKey, lte: toKey },
      },
      orderBy: { occurredAtLocal: 'asc' },
      select: {
        id: true,
        occurredAtLocal: true,
        occurredAtUtc: true,
        deviceTimezone: true,
        captureSource: true,
        workMode: true,
        locationId: true,
        deviceId: true,
        punchStateRaw: true,
        verificationModeRaw: true,
        rawPayload: true,
        device: { select: { id: true, timezone: true, locationId: true } },
      },
    });

    return events
      .map((event) => ({
        ...event,
        occurredAt: this.resolveEventInstant(event, context.timezone),
      }))
      .filter(
        (event) =>
          event.occurredAt >= context.windowStartAt &&
          event.occurredAt < context.windowEndAt,
      )
      .sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      );
  }

  /**
   * Resolves the instant a raw event happened.
   *
   * `occurredAtUtc` is used when the source already resolved it. Otherwise the
   * device's wall-clock string is combined with the most specific timezone
   * available: the event's own declared zone, then the device's, then the
   * employee's. The server's timezone is never consulted — a gateway in one zone
   * reading a terminal in another would otherwise shift every punch.
   */
  private resolveEventInstant(
    event: {
      occurredAtLocal: string;
      occurredAtUtc: Date | null;
      deviceTimezone: string | null;
      device: { timezone: string | null } | null;
    },
    fallbackTimezone: string,
  ): Date {
    if (event.occurredAtUtc) return event.occurredAtUtc;

    const timezone =
      event.deviceTimezone ?? event.device?.timezone ?? fallbackTimezone;

    const [datePart, timePart] = event.occurredAtLocal.split('T');
    const [year, month, day] = datePart.split('-').map(Number);

    return combineDateAndTimeInTimezone(
      new Date(Date.UTC(year, month - 1, day)),
      timePart?.slice(0, 5) ?? '00:00',
      timezone,
    );
  }

  /**
   * Approved corrections for this day.
   *
   * Loaded as INPUT to reconciliation rather than applied over its output. That
   * is what makes a rerun safe: the correction is replayed every time, so
   * rebuilding a day can never silently discard an adjustment a manager
   * approved.
   */
  private loadApprovedAdjustments(context: AttendanceDayContext) {
    return this.prisma.attendanceCorrectionRequest.findMany({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        status: 'APPROVED',
        OR: [
          { attendanceDate: context.attendanceDate },
          {
            attendanceEntry: {
              date: context.attendanceDate,
              employeeId: context.employeeId,
            },
          },
        ],
      },
      orderBy: { createdAtUtc: 'asc' },
      select: {
        id: true,
        correctionType: true,
        requestedCheckInAtUtc: true,
        requestedCheckOutAtUtc: true,
        requestedWorkMode: true,
        requestedWorkSiteId: true,
        requestedOvertimeMinutes: true,
      },
    });
  }

  /**
   * Approved overtime for the day.
   *
   * Sourced from approved OVERTIME_APPROVAL correction requests, because this
   * system has no overtime request model of its own: OvertimePolicy is
   * calculation configuration, and TimePayrollInput sits DOWNSTREAM of
   * attendance, so reading it here would make attendance depend on its own
   * output.
   *
   * Read fresh on every run rather than stored once, which is what makes a
   * revoked approval take effect: withdraw it, reconcile, and the minutes go
   * back to zero without anyone editing a derived record.
   */
  private sumApprovedOvertime(adjustments: readonly AdjustmentRow[]): number {
    return adjustments
      .filter(
        (adjustment) =>
          adjustment.correctionType ===
          AttendanceCorrectionType.OVERTIME_APPROVAL,
      )
      .reduce(
        (total, adjustment) =>
          total + Math.max(0, adjustment.requestedOvertimeMinutes ?? 0),
        0,
      );
  }

  private loadApprovedLeave(context: AttendanceDayContext) {
    return this.prisma.leaveRequest.findFirst({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        status: 'APPROVED',
        startDate: { lte: context.attendanceDate },
        endDate: { gte: context.attendanceDate },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        leaveType: { select: { name: true } },
      },
    });
  }

  /**
   * Per-device interpretation configuration.
   *
   * A device with no explicit vendor-code mapping falls back to the tenant's
   * default strategy, which is why ALTERNATING is the default: it needs no
   * verified code table and therefore works on hardware nobody has certified.
   */
  private async loadDeviceConfiguration(
    tenantId: string,
    events: readonly { deviceId: string | null }[],
    defaultStrategy: DeviceInterpretationConfig['strategy'],
  ): Promise<Map<string, DeviceInterpretationConfig>> {
    const deviceIds = [
      ...new Set(events.map((event) => event.deviceId).filter(isString)),
    ];

    const map = new Map<string, DeviceInterpretationConfig>();
    if (deviceIds.length === 0) return map;

    const devices = await this.prisma.attendanceDevice.findMany({
      where: { tenantId, id: { in: deviceIds } },
      select: { id: true, directionMode: true, configuration: true },
    });

    for (const device of devices) {
      const configuration = (device.configuration ?? {}) as Record<
        string,
        unknown
      >;

      // Only an administrator-verified map unlocks DEVICE_STATE. Without one the
      // vendor integers stay uninterpreted rather than being guessed at.
      const punchStateMap = isRecord(configuration.punchStateMap)
        ? (configuration.punchStateMap as Record<string, PunchDirection>)
        : null;

      const configured = configuration.punchDirectionStrategy;

      map.set(device.id, {
        deviceId: device.id,
        directionMode: device.directionMode,
        punchStateMap,
        strategy: isStrategy(configured) ? configured : defaultStrategy,
      });
    }

    return map;
  }

  // ------------------------------------------------------------ interpretation

  /**
   * Converts raw events and approved corrections into a single punch stream.
   *
   * Corrections enter as ordinary punches with a MANUAL source, so the session
   * builder pairs them by exactly the same rules as device punches. Modelling an
   * approved "add the missing check-out" as a punch rather than as a patch on
   * the result is what keeps one pairing implementation instead of two.
   */
  private toInterpretablePunches(
    events: readonly RawEventRow[],
    adjustments: readonly AdjustmentRow[],
    context: AttendanceDayContext,
  ): { punches: InterpretablePunch[]; workModes: Map<string, PunchWorkMode> } {
    const punches: InterpretablePunch[] = [];
    const workModes = new Map<string, PunchWorkMode>();

    for (const event of events) {
      const workSiteId = event.locationId ?? event.device?.locationId ?? null;

      punches.push({
        rawEventId: event.id,
        captureSource: event.captureSource,
        occurredAt: event.occurredAt,
        punchStateRaw: event.punchStateRaw,
        verificationModeRaw: event.verificationModeRaw,
        deviceId: event.deviceId,
        workSiteId,
        // Web and mobile know which action the employee took; a terminal punch
        // carries no such statement and must be inferred.
        declaredDirection: declaredDirectionFor(event),
      });

      workModes.set(event.id, {
        rawEventId: event.id,
        workMode: resolveEventWorkMode(event),
        workSiteId,
      });
    }

    for (const adjustment of adjustments) {
      // An overtime approval changes whether time is payable, not when it was
      // worked. Replaying it as a punch would invent a session.
      if (
        adjustment.correctionType === AttendanceCorrectionType.OVERTIME_APPROVAL
      ) {
        continue;
      }

      for (const [instant, direction] of [
        [adjustment.requestedCheckInAtUtc, 'CHECK_IN' as const],
        [adjustment.requestedCheckOutAtUtc, 'CHECK_OUT' as const],
      ] as const) {
        if (!instant) continue;

        // A synthetic id, distinct from any raw event id, so an adjustment can
        // never be mistaken for evidence the device reported.
        const syntheticId = `adjustment:${adjustment.id}:${direction}`;

        punches.push({
          rawEventId: syntheticId,
          captureSource: RawAttendanceCaptureSource.MANUAL,
          occurredAt: instant,
          punchStateRaw: null,
          verificationModeRaw: null,
          deviceId: null,
          workSiteId: adjustment.requestedWorkSiteId,
          declaredDirection: direction,
        });

        workModes.set(syntheticId, {
          rawEventId: syntheticId,
          workMode: adjustment.requestedWorkMode ?? EmployeeWorkMode.OFFICE,
          workSiteId: adjustment.requestedWorkSiteId,
        });
      }
    }

    void context;
    return { punches, workModes };
  }

  // -------------------------------------------------------------- calculation

  /**
   * Day totals.
   *
   * Late and early are measured against the SHIFT and the WHOLE DAY, never per
   * session. Measuring early departure per session is precisely how a hybrid day
   * — office until 13:00, remote from 14:00 to 18:00 — becomes a fictional five
   * hours of early departure.
   */
  private calculateTotals(
    context: AttendanceDayContext,
    sessions: readonly BuiltSession[],
    overtimeMinimumMinutes: number,
    approvedOvertimeMinutes: number,
  ) {
    const work = sessions.filter(
      (session) =>
        !session.isBreak &&
        session.status !== AttendanceSessionStatus.CANCELLED,
    );
    const breaks = sessions.filter((session) => session.isBreak);

    const completed = work.filter(
      (session) => session.endedAt !== null && session.durationMinutes !== null,
    );

    const workedMinutes = completed.reduce(
      (total, session) => total + (session.durationMinutes ?? 0),
      0,
    );

    const byMode = (mode: EmployeeWorkMode) =>
      completed
        .filter((session) => session.workMode === mode)
        .reduce((total, session) => total + (session.durationMinutes ?? 0), 0);

    const starts = work.map((session) => session.startedAt).sort(byTime);
    const ends = completed
      .map((session) => session.endedAt)
      .filter((value): value is Date => value !== null)
      .sort(byTime);

    const firstCheckInAt = starts[0] ?? null;
    const lastCheckOutAt = ends[ends.length - 1] ?? null;

    let lateMinutes = 0;
    let earlyArrivalMinutes = 0;
    let earlyDepartureMinutes = 0;

    if (context.shift && context.shiftStartAt && firstCheckInAt) {
      const graceEnd = new Date(
        context.shiftStartAt.getTime() +
          context.shift.lateGraceMinutes * 60_000,
      );

      if (firstCheckInAt > graceEnd) {
        // Measured from the shift start, not from the end of grace: grace forgives
        // the lateness, it does not redefine when the shift began.
        lateMinutes = Math.max(
          0,
          differenceInMinutes(firstCheckInAt, context.shiftStartAt),
        );
      } else if (firstCheckInAt < context.shiftStartAt) {
        // Early arrival is recorded, and is NOT overtime. Turning up at 07:30 for
        // a 09:00 shift does not earn 90 minutes; only an approved overtime
        // decision does.
        earlyArrivalMinutes = differenceInMinutes(
          context.shiftStartAt,
          firstCheckInAt,
        );
      }
    }

    if (context.shift && context.shiftEndAt && lastCheckOutAt) {
      const graceStart = new Date(
        context.shiftEndAt.getTime() -
          context.shift.earlyExitGraceMinutes * 60_000,
      );

      if (lastCheckOutAt < graceStart) {
        earlyDepartureMinutes = Math.max(
          0,
          differenceInMinutes(context.shiftEndAt, lastCheckOutAt),
        );
      }
    }

    const extraRaw = Math.max(0, workedMinutes - context.scheduledMinutes);

    return {
      workedMinutes,
      officeMinutes: byMode(EmployeeWorkMode.OFFICE),
      remoteMinutes: byMode(EmployeeWorkMode.REMOTE),
      fieldMinutes: byMode(EmployeeWorkMode.FIELD),
      breakMinutes: breaks.reduce(
        (total, session) => total + (session.durationMinutes ?? 0),
        0,
      ),
      lateMinutes,
      earlyArrivalMinutes,
      earlyDepartureMinutes,
      // Below the threshold, extra time is not even proposed as overtime, so it
      // cannot drift into a payroll input by accident.
      extraMinutes: extraRaw >= overtimeMinimumMinutes ? extraRaw : 0,
      // Capped at what was actually worked beyond schedule: approving four hours
      // of overtime on a day someone worked twenty minutes past their shift
      // should not manufacture the difference.
      approvedOvertimeMinutes: Math.min(approvedOvertimeMinutes, extraRaw),
      firstCheckInAt,
      lastCheckOutAt,
      derivedWorkMode: deriveWorkMode(completed),
      sessionCount: work.length,
      hasIncompleteSession: work.some(
        (session) => session.status === AttendanceSessionStatus.INCOMPLETE,
      ),
    };
  }

  /**
   * Day-level conditions the session builder cannot see.
   *
   * Each of these is a fact worth a human's attention rather than something to
   * resolve automatically: attendance during approved leave, work on a holiday
   * or a weekend, or punches from outside the employment period.
   */
  private detectDayExceptions(
    context: AttendanceDayContext,
    sessions: readonly BuiltSession[],
    leave: LeaveRow | null,
  ): BuiltException[] {
    const exceptions: BuiltException[] = [];
    const worked = sessions.some((session) => !session.isBreak);

    if (leave && worked) {
      // The leave is NOT cancelled and the attendance is NOT discarded. Both are
      // real, they contradict each other, and only HR can say which should stand.
      exceptions.push({
        type: AttendanceExceptionType.ATTENDANCE_DURING_LEAVE,
        message: `Attendance was recorded on a day of approved ${leave.leaveType?.name ?? 'leave'}. Both records have been kept.`,
        rawEventId: null,
        sessionSequence: null,
        workSiteId: null,
        deviceId: null,
        detail: {
          leaveRequestId: leave.id,
          leaveType: leave.leaveType?.name ?? null,
        },
      });
    }

    if (context.holiday && worked) {
      exceptions.push({
        type: AttendanceExceptionType.HOLIDAY_WORK,
        message: `Work was recorded on ${context.holiday.name}.`,
        rawEventId: null,
        sessionSequence: null,
        workSiteId: null,
        deviceId: null,
        detail: {
          holidayId: context.holiday.id,
          holidayName: context.holiday.name,
        },
      });
    }

    if (context.isWeekend && worked && !context.holiday) {
      exceptions.push({
        type: AttendanceExceptionType.WEEKEND_WORK,
        message: 'Work was recorded on a non-working day.',
        rawEventId: null,
        sessionSequence: null,
        workSiteId: null,
        deviceId: null,
        detail: { attendanceDate: context.attendanceDate.toISOString() },
      });
    }

    if (worked) {
      const { joinedAt, exitedAt } = context.employment;

      // Preserved and flagged, never dropped. A punch after someone's last day is
      // either a genuine handover or a badge that was not returned, and both need
      // to be visible.
      if (joinedAt && context.attendanceDate < startOfDay(joinedAt)) {
        exceptions.push(employmentException(context, 'before', joinedAt));
      } else if (exitedAt && context.attendanceDate > startOfDay(exitedAt)) {
        exceptions.push(employmentException(context, 'after', exitedAt));
      }
    }

    return exceptions;
  }

  // ---------------------------------------------------------------- persistence

  /**
   * Writes the reconciled day, its sessions and its exceptions atomically.
   *
   * Derived rows are replaced wholesale inside one transaction. Deleting the old
   * sessions in one statement and writing the new ones in another would leave an
   * employee's day empty if the process died between them, and an empty day
   * reads as an absence.
   */
  private async persist(
    context: AttendanceDayContext,
    sessions: readonly BuiltSession[],
    exceptions: readonly BuiltException[],
    totals: ReturnType<AttendanceReconciliationService['calculateTotals']>,
    leave: LeaveRow | null,
    rawEventIds: readonly string[],
  ): Promise<ReconciliationResult> {
    const now = new Date();
    const status = this.resolveDayStatus(context, totals, exceptions, leave);

    return this.prisma.$transaction(async (tx) => {
      const day = await tx.attendanceDay.upsert({
        where: {
          tenantId_employeeId_attendanceDate: {
            tenantId: context.tenantId,
            employeeId: context.employeeId,
            attendanceDate: context.attendanceDate,
          },
        },
        create: {
          tenantId: context.tenantId,
          employeeId: context.employeeId,
          attendanceDate: context.attendanceDate,
          workScheduleId: context.workScheduleId,
          shiftTemplateId: context.shiftTemplateId,
          timezone: context.timezone,
          status,
          scheduledMinutes: context.scheduledMinutes,
          ...toDayMetrics(totals),
          isHoliday: Boolean(context.holiday),
          isWeekend: context.isWeekend,
          isOffDay: !context.isWorkingDay,
          onLeave: Boolean(leave),
          reconciliationVersion: RECONCILIATION_VERSION,
          lastReconciledAt: now,
        },
        update: {
          workScheduleId: context.workScheduleId,
          shiftTemplateId: context.shiftTemplateId,
          timezone: context.timezone,
          status,
          scheduledMinutes: context.scheduledMinutes,
          ...toDayMetrics(totals),
          isHoliday: Boolean(context.holiday),
          isWeekend: context.isWeekend,
          isOffDay: !context.isWorkingDay,
          onLeave: Boolean(leave),
          reconciliationVersion: RECONCILIATION_VERSION,
          lastReconciledAt: now,
        },
        select: { id: true },
      });

      // Replaced rather than merged. Sessions are wholly derived, so the previous
      // set carries no information the new one lacks, and matching them up would
      // be a source of subtle drift for no benefit.
      await tx.attendanceSession.deleteMany({
        where: { attendanceDayId: day.id },
      });

      if (sessions.length > 0) {
        await tx.attendanceSession.createMany({
          data: sessions.map((session) => ({
            tenantId: context.tenantId,
            employeeId: context.employeeId,
            attendanceDayId: day.id,
            sequence: session.sequence,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            startSource: session.startSource,
            endSource: session.endSource,
            // Synthetic adjustment ids are not raw events and must not be stored
            // as foreign keys pointing at rows that do not exist.
            startRawEventId: realEventId(session.startRawEventId),
            endRawEventId: realEventId(session.endRawEventId),
            workMode: session.workMode,
            workSiteId: session.workSiteId,
            startDeviceId: session.startDeviceId,
            endDeviceId: session.endDeviceId,
            status: session.status,
            durationMinutes: session.durationMinutes,
            isAdjusted: isAdjustmentSourced(session),
            adjustmentSource: session.adjustmentNote ?? null,
            isBreak: session.isBreak,
          })),
        });
      }

      const openCount = await this.reconcileExceptions(
        tx,
        context,
        day.id,
        exceptions,
        now,
      );

      await tx.attendanceDay.update({
        where: { id: day.id },
        data: {
          sessionCount: totals.sessionCount,
          openExceptionCount: openCount,
        },
      });

      const entryId = await this.projectToAttendanceEntry(
        tx,
        context,
        day.id,
        totals,
        status,
        now,
      );

      if (entryId) {
        await tx.attendanceDay.update({
          where: { id: day.id },
          data: { attendanceEntryId: entryId },
        });
      }

      if (rawEventIds.length > 0) {
        // Bookkeeping the raw model already provides. The event's own reported
        // values are untouched — only its processing state moves.
        await tx.rawAttendanceEvent.updateMany({
          where: { id: { in: [...rawEventIds] }, tenantId: context.tenantId },
          data: {
            processingStatus: RawAttendanceProcessingStatus.PROCESSED,
            processedAt: now,
          },
        });
      }

      return {
        attendanceDayId: day.id,
        status,
        sessionCount: totals.sessionCount,
        workedMinutes: totals.workedMinutes,
        openExceptionCount: openCount,
        skippedBecauseLocked: false,
        skippedBeforeCutover: false,
      };
    });
  }

  /**
   * Upserts this run's exceptions and resolves the ones that no longer apply.
   *
   * A stale exception is RESOLVED, not deleted. "This day once had a missing
   * checkout, and it was fixed on the 3rd" is part of the audit trail for
   * attendance that was eventually paid; deleting the row erases the reason a
   * correction exists.
   */
  private async reconcileExceptions(
    tx: Prisma.TransactionClient,
    context: AttendanceDayContext,
    attendanceDayId: string,
    exceptions: readonly BuiltException[],
    now: Date,
  ): Promise<number> {
    const seen = new Set<string>();

    for (const exception of exceptions) {
      const dedupeKey = exceptionDedupeKey(context, exception);
      seen.add(dedupeKey);

      await tx.attendanceException.upsert({
        where: {
          tenantId_dedupeKey: { tenantId: context.tenantId, dedupeKey },
        },
        create: {
          tenantId: context.tenantId,
          employeeId: context.employeeId,
          attendanceDayId,
          attendanceDate: context.attendanceDate,
          type: exception.type,
          severity: severityFor(exception.type),
          dedupeKey,
          message: exception.message,
          detail: exception.detail as Prisma.InputJsonValue,
          rawEventId: realEventId(exception.rawEventId),
          workSiteId: exception.workSiteId,
          deviceId: exception.deviceId,
          detectedAt: now,
        },
        update: {
          // Deliberately does NOT reopen a resolved or ignored exception. A
          // manager who accepted a missing checkout should not have it thrown
          // back at them on every subsequent reconciliation of that day.
          attendanceDayId,
          message: exception.message,
          detail: exception.detail as Prisma.InputJsonValue,
        },
      });
    }

    const stale = await tx.attendanceException.findMany({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        attendanceDate: context.attendanceDate,
        status: AttendanceExceptionStatus.OPEN,
        dedupeKey: { notIn: seen.size > 0 ? [...seen] : ['__none__'] },
      },
      select: { id: true },
    });

    if (stale.length > 0) {
      await tx.attendanceException.updateMany({
        where: { id: { in: stale.map((row) => row.id) } },
        data: {
          status: AttendanceExceptionStatus.RESOLVED,
          resolvedAt: now,
          resolutionSource: 'RECONCILIATION',
          resolutionNote:
            'No longer applies after the day was reconciled again.',
        },
      });
    }

    return tx.attendanceException.count({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        attendanceDate: context.attendanceDate,
        status: AttendanceExceptionStatus.OPEN,
      },
    });
  }

  /**
   * Projects the reconciled day onto AttendanceEntry.
   *
   * AttendanceEntry remains the public daily record — the dashboard, reports,
   * timesheets, payroll preparation and every export read it — so the engine
   * writes THROUGH it rather than around it. `workedMinutes` is the important
   * part: a hybrid day's checkOut minus checkIn is 10 hours where the employee
   * worked 8h30m, and that difference would otherwise reach payroll.
   */
  private async projectToAttendanceEntry(
    tx: Prisma.TransactionClient,
    context: AttendanceDayContext,
    attendanceDayId: string,
    totals: ReturnType<AttendanceReconciliationService['calculateTotals']>,
    status: AttendanceDayStatus,
    now: Date,
  ): Promise<string | null> {
    // Nothing happened and nothing was previously recorded: creating an empty
    // row would turn "no evidence" into an assertion about the day.
    if (totals.sessionCount === 0) {
      const existing = await tx.attendanceEntry.findFirst({
        where: {
          tenantId: context.tenantId,
          employeeId: context.employeeId,
          date: context.attendanceDate,
        },
        select: { id: true },
      });
      return existing?.id ?? null;
    }

    const entryStatus = toEntryStatus(status, totals);
    const attendanceMode = toEntryMode(totals.derivedWorkMode);

    const shared = {
      workScheduleId: context.workScheduleId,
      shiftTemplateId: context.shiftTemplateId,
      checkIn: totals.firstCheckInAt,
      checkOut: totals.lastCheckOutAt,
      attendanceMode,
      status: entryStatus,
      workedMinutes: totals.workedMinutes,
      sessionCount: totals.sessionCount,
      derivedWorkMode: totals.derivedWorkMode,
      reconciled: true,
      lastReconciledAt: now,
      isLateCheckIn: totals.lateMinutes > 0,
      lateCheckInMinutes: totals.lateMinutes > 0 ? totals.lateMinutes : null,
    };

    const entry = await tx.attendanceEntry.upsert({
      where: {
        tenantId_employeeId_date: {
          tenantId: context.tenantId,
          employeeId: context.employeeId,
          date: context.attendanceDate,
        },
      },
      create: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        date: context.attendanceDate,
        source: 'SYSTEM',
        ...shared,
      },
      update: shared,
      select: { id: true },
    });

    void attendanceDayId;
    return entry.id;
  }

  /**
   * The day's outcome.
   *
   * A day with blocking exceptions is NEEDS_REVIEW rather than PRESENT: the
   * engine has evidence it could not resolve, and reporting a confident result
   * on top of an unresolved contradiction is how wrong attendance reaches
   * payroll unnoticed.
   */
  private resolveDayStatus(
    context: AttendanceDayContext,
    totals: ReturnType<AttendanceReconciliationService['calculateTotals']>,
    exceptions: readonly BuiltException[],
    leave: LeaveRow | null,
  ): AttendanceDayStatus {
    const blocking = exceptions.some(
      (exception) =>
        severityFor(exception.type) === AttendanceExceptionSeverity.BLOCKING,
    );

    if (totals.sessionCount === 0) {
      if (leave) return AttendanceDayStatus.ON_LEAVE;
      if (context.holiday) return AttendanceDayStatus.HOLIDAY;
      if (!context.isWorkingDay) {
        return context.isWeekend
          ? AttendanceDayStatus.WEEKEND
          : AttendanceDayStatus.OFF_DAY;
      }
      return AttendanceDayStatus.ABSENT;
    }

    if (blocking || totals.hasIncompleteSession) {
      return AttendanceDayStatus.NEEDS_REVIEW;
    }

    // Half the schedule is the boundary between "worked" and "partly worked".
    // With no schedule to compare against, any work counts as present rather
    // than being graded against a target nobody set.
    if (
      context.scheduledMinutes > 0 &&
      totals.workedMinutes < context.scheduledMinutes / 2
    ) {
      return AttendanceDayStatus.PARTIAL;
    }

    return AttendanceDayStatus.PRESENT;
  }

  /**
   * Records that evidence arrived for a day that is already finalised.
   *
   * The raw events keep existing and the derived day does not move. An exception
   * is the honest outcome: something real happened, payroll has already been
   * run, and only an authorised reopen can change the answer.
   */
  private async recordLockedPeriodEvidence(
    context: AttendanceDayContext,
    attendanceDayId: string,
  ): Promise<void> {
    const pending = await this.prisma.rawAttendanceEvent.count({
      where: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        processingStatus: RawAttendanceProcessingStatus.PENDING,
        occurredAtLocal: {
          gte: localKey(context.windowStartAt),
          lte: localKey(context.windowEndAt),
        },
      },
    });

    if (pending === 0) return;

    const dedupeKey = hashKey([
      context.employeeId,
      context.attendanceDate.toISOString(),
      AttendanceExceptionType.LOCKED_PERIOD_EVENT,
    ]);

    await this.prisma.attendanceException.upsert({
      where: { tenantId_dedupeKey: { tenantId: context.tenantId, dedupeKey } },
      create: {
        tenantId: context.tenantId,
        employeeId: context.employeeId,
        attendanceDayId,
        attendanceDate: context.attendanceDate,
        type: AttendanceExceptionType.LOCKED_PERIOD_EVENT,
        severity: AttendanceExceptionSeverity.WARNING,
        dedupeKey,
        message:
          'New attendance evidence arrived for a day that has already been finalised. The recorded attendance was not changed.',
        detail: { pendingEventCount: pending },
      },
      update: { detail: { pendingEventCount: pending } },
    });

    this.logger.warn(
      `Attendance evidence arrived for locked day ${context.attendanceDate.toISOString().slice(0, 10)} (employee ${context.employeeId}); derived attendance was left unchanged.`,
    );
  }
}

// ------------------------------------------------------------------- helpers

const DAY_MS = 24 * 60 * 60 * 1000;

type RawEventRow = {
  id: string;
  occurredAt: Date;
  occurredAtLocal: string;
  captureSource: RawAttendanceCaptureSource;
  workMode: EmployeeWorkMode | null;
  locationId: string | null;
  deviceId: string | null;
  punchStateRaw: number | null;
  verificationModeRaw: number | null;
  rawPayload: Prisma.JsonValue | null;
  device: {
    id: string;
    timezone: string | null;
    locationId: string | null;
  } | null;
};

type AdjustmentRow = {
  id: string;
  requestedCheckInAtUtc: Date | null;
  requestedCheckOutAtUtc: Date | null;
  requestedWorkMode: EmployeeWorkMode | null;
  requestedWorkSiteId: string | null;
  correctionType: AttendanceCorrectionType;
  requestedOvertimeMinutes: number | null;
};

type LeaveRow = {
  id: string;
  leaveType: { name: string } | null;
};

/**
 * The direction a source stated for itself.
 *
 * A DEVICE punch states nothing — a terminal records that a card was presented,
 * not why — so it must be inferred by the configured strategy. Every other
 * source is an explicit action: a web check-out knows it is a check-out, and the
 * capture path records that in the event's sanitised payload. Inferring a
 * direction that the source already told us would be strictly worse.
 */
function declaredDirectionFor(event: RawEventRow): PunchDirection | null {
  if (event.captureSource === RawAttendanceCaptureSource.DEVICE) return null;
  if (!isRecord(event.rawPayload)) return null;

  const declared = event.rawPayload.direction;

  return typeof declared === 'string' && DECLARABLE_DIRECTIONS.has(declared)
    ? (declared as PunchDirection)
    : null;
}

/**
 * Directions a capture source may declare. UNKNOWN is absent deliberately: a
 * source that does not know its own direction should say nothing and let the
 * strategy decide, rather than asserting ignorance as a value.
 */
const DECLARABLE_DIRECTIONS = new Set([
  'CHECK_IN',
  'CHECK_OUT',
  'BREAK_START',
  'BREAK_END',
]);

/**
 * The work mode a punch implies.
 *
 * A DEVICE punch is OFFICE by definition — someone stood at a physical terminal
 * — and that is forced server-side at ingestion, so it cannot be relabelled by a
 * compromised gateway. Other sources carry the mode the capture path already
 * validated.
 */
function resolveEventWorkMode(event: RawEventRow): EmployeeWorkMode {
  if (event.captureSource === RawAttendanceCaptureSource.DEVICE) {
    return EmployeeWorkMode.OFFICE;
  }

  // HYBRID is a property of a whole day, never of one punch, so a stored HYBRID
  // is meaningless here and falls back to OFFICE.
  if (event.workMode && event.workMode !== EmployeeWorkMode.HYBRID) {
    return event.workMode;
  }

  return EmployeeWorkMode.OFFICE;
}

/**
 * The day's work mode, derived from what was actually worked.
 *
 * More than one distinct mode across the day's sessions is HYBRID. This is the
 * ONLY place HYBRID is ever produced — no capture path may assert it.
 */
function deriveWorkMode(
  sessions: readonly BuiltSession[],
): EmployeeWorkMode | null {
  const modes = new Set(sessions.map((session) => session.workMode));

  if (modes.size === 0) return null;
  if (modes.size > 1) return EmployeeWorkMode.HYBRID;

  return [...modes][0];
}

/** AttendanceMode carries HYBRID, so the projection can state it directly. */
function toEntryMode(mode: EmployeeWorkMode | null) {
  switch (mode) {
    case EmployeeWorkMode.REMOTE:
      return 'REMOTE' as const;
    case EmployeeWorkMode.HYBRID:
      return 'HYBRID' as const;
    case EmployeeWorkMode.FIELD:
    case EmployeeWorkMode.OFFICE:
    default:
      return 'OFFICE' as const;
  }
}

/**
 * Maps the reconciled outcome onto the legacy entry status.
 *
 * MISSED_CHECK_OUT is preferred over a generic review state where it applies,
 * because the existing screens and notifications already understand it.
 */
function toEntryStatus(
  status: AttendanceDayStatus,
  totals: { hasIncompleteSession: boolean; lateMinutes: number },
) {
  if (totals.hasIncompleteSession) return 'MISSED_CHECK_OUT' as const;

  switch (status) {
    case AttendanceDayStatus.ABSENT:
      return 'ABSENT' as const;
    case AttendanceDayStatus.ON_LEAVE:
      return 'ON_LEAVE' as const;
    case AttendanceDayStatus.PARTIAL:
      return 'HALF_DAY' as const;
    case AttendanceDayStatus.NEEDS_REVIEW:
      return 'PRESENT' as const;
    case AttendanceDayStatus.PRESENT:
    default:
      return totals.lateMinutes > 0 ? ('LATE' as const) : ('PRESENT' as const);
  }
}

function toDayMetrics(
  totals: ReturnType<AttendanceReconciliationService['calculateTotals']>,
) {
  return {
    workedMinutes: totals.workedMinutes,
    officeMinutes: totals.officeMinutes,
    remoteMinutes: totals.remoteMinutes,
    fieldMinutes: totals.fieldMinutes,
    breakMinutes: totals.breakMinutes,
    lateMinutes: totals.lateMinutes,
    earlyArrivalMinutes: totals.earlyArrivalMinutes,
    earlyDepartureMinutes: totals.earlyDepartureMinutes,
    extraMinutes: totals.extraMinutes,
    approvedOvertimeMinutes: totals.approvedOvertimeMinutes,
    firstCheckInAt: totals.firstCheckInAt,
    lastCheckOutAt: totals.lastCheckOutAt,
    derivedWorkMode: totals.derivedWorkMode,
  };
}

/**
 * BLOCKING marks conditions where the day's numbers cannot be trusted;
 * everything else is worth seeing but does not invalidate the result.
 */
function severityFor(
  type: AttendanceExceptionType,
): AttendanceExceptionSeverity {
  switch (type) {
    case AttendanceExceptionType.MISSING_CHECKIN:
    case AttendanceExceptionType.MISSING_CHECKOUT:
    case AttendanceExceptionType.OVERLAPPING_SESSION:
    case AttendanceExceptionType.UNKNOWN_PUNCH_DIRECTION:
      return AttendanceExceptionSeverity.BLOCKING;

    case AttendanceExceptionType.DUPLICATE_SEMANTIC_PUNCH:
    case AttendanceExceptionType.HOLIDAY_WORK:
    case AttendanceExceptionType.WEEKEND_WORK:
      return AttendanceExceptionSeverity.INFO;

    default:
      return AttendanceExceptionSeverity.WARNING;
  }
}

/**
 * A stable identity for an exception.
 *
 * Keyed on what the exception is ABOUT, not on when it was found, so re-running
 * reconciliation updates one row instead of stacking a new one every cycle.
 */
function exceptionDedupeKey(
  context: AttendanceDayContext,
  exception: BuiltException,
): string {
  return hashKey([
    context.employeeId,
    context.attendanceDate.toISOString(),
    exception.type,
    exception.rawEventId ?? '',
    exception.sessionSequence === null ? '' : String(exception.sessionSequence),
  ]);
}

function hashKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/** Synthetic adjustment ids are not raw events and must not be stored as FKs. */
function realEventId(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith('adjustment:') ? null : value;
}

function isAdjustmentSourced(session: BuiltSession): boolean {
  return (
    session.startRawEventId?.startsWith('adjustment:') === true ||
    session.endRawEventId?.startsWith('adjustment:') === true ||
    session.adjustmentNote !== undefined
  );
}

function employmentException(
  context: AttendanceDayContext,
  side: 'before' | 'after',
  boundary: Date,
): BuiltException {
  return {
    type: AttendanceExceptionType.ATTENDANCE_OUTSIDE_EMPLOYMENT,
    message:
      side === 'before'
        ? 'Attendance was recorded before this employee started.'
        : 'Attendance was recorded after this employee left.',
    rawEventId: null,
    sessionSequence: null,
    workSiteId: null,
    deviceId: null,
    detail: {
      side,
      boundary: boundary.toISOString(),
      attendanceDate: context.attendanceDate.toISOString(),
    },
  };
}

function emptyResult(
  overrides: Partial<ReconciliationResult>,
): ReconciliationResult {
  return {
    attendanceDayId: null,
    status: AttendanceDayStatus.PENDING,
    sessionCount: 0,
    workedMinutes: 0,
    openExceptionCount: 0,
    skippedBecauseLocked: false,
    skippedBeforeCutover: false,
    ...overrides,
  };
}

function startOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** The `occurredAtLocal` string form, for range queries against that column. */
function localKey(value: Date): string {
  return value.toISOString().slice(0, 19);
}

function byTime(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStrategy(
  value: unknown,
): value is DeviceInterpretationConfig['strategy'] {
  return (
    typeof value === 'string' &&
    [
      'DEVICE_STATE',
      'DEVICE_DIRECTION',
      'ALTERNATING',
      'FIRST_IN_LAST_OUT',
      'RULE_ENGINE',
    ].includes(value)
  );
}

export type { InterpretedPunch };
