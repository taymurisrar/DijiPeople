import { Injectable } from '@nestjs/common';
import {
  AttendanceExceptionType,
  AttendanceSessionStatus,
  EmployeeWorkMode,
  RawAttendanceCaptureSource,
} from '@prisma/client';

import type { InterpretedPunch } from './punch-interpreter.service';

/**
 * Pairs interpreted punches into work sessions.
 *
 * PURE. No database, no clock, no tenant lookups — everything it needs arrives
 * as arguments. Punch pairing is where the subtle attendance bugs live (the
 * hybrid day counted as a five-hour early departure, the overnight shift split
 * in two, the double-tap that opened a phantom session), and those are only
 * cheap to test if the rules can be exercised without a database.
 *
 * It never decides late, early or overtime. Those are properties of a whole
 * reconciled day measured against a shift, and computing them per session is
 * exactly how "office ended at 13:00" becomes a false early departure on a day
 * the employee went on to work remotely until 18:00.
 */

export interface SessionBuildPolicy {
  /**
   * What to do when a check-in arrives while a session is already open.
   *
   * REQUIRE_EXPLICIT_CHECKOUT and CREATE_EXCEPTION both preserve the
   * uncertainty; AUTO_CLOSE_PREVIOUS resolves it silently and is opt-in only,
   * because inventing a checkout time is inventing paid minutes.
   */
  openSessionPolicy:
    | 'REQUIRE_EXPLICIT_CHECKOUT'
    | 'AUTO_CLOSE_PREVIOUS'
    | 'CREATE_EXCEPTION';

  /**
   * Whether a session may start at one authorised work site and end at another.
   * A genuine possibility for an employee who moves between offices, and a
   * red flag otherwise, so the tenant decides.
   */
  crossSitePolicy: 'ALLOWED' | 'WARNING' | 'APPROVAL_REQUIRED' | 'BLOCKED';

  /**
   * Close an unterminated session at the scheduled shift end instead of leaving
   * it open. Off by default: see MISSING_CHECKOUT.
   */
  autoCloseAtShiftEnd: boolean;

  /** Treat the gap between a checkout and the next check-in as an unpaid break. */
  treatGapsAsBreaks: boolean;
}

export interface SessionBuildContext {
  policy: SessionBuildPolicy;
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  /** Work sites the employee was authorised for, at the time of these events. */
  authorizedWorkSiteIds: ReadonlySet<string>;
}

export interface BuiltSession {
  sequence: number;
  startedAt: Date;
  endedAt: Date | null;
  startSource: RawAttendanceCaptureSource;
  endSource: RawAttendanceCaptureSource | null;
  startRawEventId: string | null;
  endRawEventId: string | null;
  workMode: EmployeeWorkMode;
  workSiteId: string | null;
  startDeviceId: string | null;
  endDeviceId: string | null;
  status: AttendanceSessionStatus;
  durationMinutes: number | null;
  isBreak: boolean;
  /** Set when the builder itself closed or altered the session. */
  adjustmentNote?: string;
}

export interface BuiltException {
  type: AttendanceExceptionType;
  message: string;
  rawEventId: string | null;
  sessionSequence: number | null;
  workSiteId: string | null;
  deviceId: string | null;
  detail: Record<string, unknown>;
}

export interface SessionBuildResult {
  sessions: BuiltSession[];
  exceptions: BuiltException[];
}

/** The work mode a punch implies, given where it came from. */
export interface PunchWorkMode {
  rawEventId: string;
  workMode: EmployeeWorkMode;
  workSiteId: string | null;
}

@Injectable()
export class AttendanceSessionBuilderService {
  /**
   * Builds the day's sessions.
   *
   * Deterministic: the same punches, policy and shift always produce the same
   * sessions in the same order, which is what makes re-running reconciliation
   * safe.
   */
  build(
    punches: readonly InterpretedPunch[],
    workModes: ReadonlyMap<string, PunchWorkMode>,
    context: SessionBuildContext,
  ): SessionBuildResult {
    const sessions: BuiltSession[] = [];
    const exceptions: BuiltException[] = [];

    /** The session currently open, if any. */
    let open: BuiltSession | null = null;
    /** A break opened inside the current session. */
    let breakStartedAt: Date | null = null;
    let sequence = 0;

    const ordered = [...punches].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );

    for (const punch of ordered) {
      // Recorded, and deliberately inert: a double-tap must not open or close
      // anything. The raw event still exists and still shows on the day detail.
      if (punch.suppressedAsDuplicate) {
        exceptions.push({
          type: AttendanceExceptionType.DUPLICATE_SEMANTIC_PUNCH,
          message:
            'A repeated punch within the duplicate window was recorded but did not change the day.',
          rawEventId: punch.rawEventId,
          sessionSequence: null,
          workSiteId: punch.workSiteId,
          deviceId: punch.deviceId,
          detail: { occurredAt: punch.occurredAt.toISOString() },
        });
        continue;
      }

      const mode = workModes.get(punch.rawEventId);

      switch (punch.direction) {
        case 'CHECK_IN': {
          if (open) {
            const handled = this.handleOverlappingCheckIn(
              open,
              punch,
              context,
              exceptions,
            );

            if (handled === 'IGNORE_PUNCH') {
              continue;
            }

            // AUTO_CLOSE_PREVIOUS: the open session is closed at this punch, so
            // the two never overlap in the stored result.
            open.endedAt = punch.occurredAt;
            open.endSource = punch.captureSource;
            open.status = AttendanceSessionStatus.ADJUSTED;
            open.durationMinutes = minutesBetween(
              open.startedAt,
              punch.occurredAt,
            );
            sessions.push(open);
            open = null;
          }

          open = {
            sequence: sequence++,
            startedAt: punch.occurredAt,
            endedAt: null,
            startSource: punch.captureSource,
            endSource: null,
            startRawEventId: punch.rawEventId,
            endRawEventId: null,
            workMode: mode?.workMode ?? EmployeeWorkMode.OFFICE,
            workSiteId: mode?.workSiteId ?? punch.workSiteId,
            startDeviceId: punch.deviceId,
            endDeviceId: null,
            status: AttendanceSessionStatus.OPEN,
            durationMinutes: null,
            isBreak: false,
          };

          this.checkWorkSiteAuthorization(punch, mode, context, exceptions);
          breakStartedAt = null;
          break;
        }

        case 'CHECK_OUT': {
          if (!open) {
            // A checkout with nothing to close. The uncertainty is preserved
            // rather than resolved by inventing a start time.
            exceptions.push({
              type: AttendanceExceptionType.MISSING_CHECKIN,
              message:
                'A check-out was recorded with no matching check-in. The start of this work period is unknown.',
              rawEventId: punch.rawEventId,
              sessionSequence: null,
              workSiteId: punch.workSiteId,
              deviceId: punch.deviceId,
              detail: { checkOutAt: punch.occurredAt.toISOString() },
            });
            continue;
          }

          this.closeSession(open, punch, mode, context, exceptions);
          sessions.push(open);
          open = null;
          breakStartedAt = null;
          break;
        }

        case 'BREAK_START': {
          if (!open) break;
          breakStartedAt = punch.occurredAt;
          break;
        }

        case 'BREAK_END': {
          if (!open || !breakStartedAt) break;

          // A break becomes its own zero-work session rather than being folded
          // into the surrounding one, so the day detail can show it and the
          // totals can exclude it explicitly.
          sessions.push({
            sequence: sequence++,
            startedAt: breakStartedAt,
            endedAt: punch.occurredAt,
            startSource: punch.captureSource,
            endSource: punch.captureSource,
            startRawEventId: null,
            endRawEventId: punch.rawEventId,
            workMode: open.workMode,
            workSiteId: open.workSiteId,
            startDeviceId: punch.deviceId,
            endDeviceId: punch.deviceId,
            status: AttendanceSessionStatus.CLOSED,
            durationMinutes: minutesBetween(breakStartedAt, punch.occurredAt),
            isBreak: true,
          });

          breakStartedAt = null;
          break;
        }

        case 'UNKNOWN':
        default: {
          exceptions.push({
            type: AttendanceExceptionType.UNKNOWN_PUNCH_DIRECTION,
            message:
              'A punch was recorded but it is not clear whether it was an arrival or a departure.',
            rawEventId: punch.rawEventId,
            sessionSequence: null,
            workSiteId: punch.workSiteId,
            deviceId: punch.deviceId,
            detail: {
              occurredAt: punch.occurredAt.toISOString(),
              interpretationSource: punch.interpretationSource,
            },
          });
          break;
        }
      }
    }

    if (open) {
      this.finishUnterminatedSession(open, context, exceptions);
      sessions.push(open);
    }

    if (context.policy.treatGapsAsBreaks) {
      this.recordGapsAsBreaks(sessions);
    }

    return { sessions: sessions.sort(bySequence), exceptions };
  }

  /**
   * Decides what a check-in arriving over an open session means.
   *
   * The default is to keep both facts and let a human decide, because the two
   * plausible stories — "they forgot to check out" and "the reader fired twice"
   * — imply different corrections and the engine cannot tell them apart.
   */
  private handleOverlappingCheckIn(
    open: BuiltSession,
    punch: InterpretedPunch,
    context: SessionBuildContext,
    exceptions: BuiltException[],
  ): 'IGNORE_PUNCH' | 'CLOSE_PREVIOUS' {
    const detail = {
      openSessionStartedAt: open.startedAt.toISOString(),
      openSessionWorkMode: open.workMode,
      conflictingPunchAt: punch.occurredAt.toISOString(),
      policy: context.policy.openSessionPolicy,
    };

    if (context.policy.openSessionPolicy === 'AUTO_CLOSE_PREVIOUS') {
      exceptions.push({
        type: AttendanceExceptionType.OVERLAPPING_SESSION,
        message:
          'A new work period started before the previous one was closed. The previous period was closed automatically, as this tenant has configured.',
        rawEventId: punch.rawEventId,
        sessionSequence: open.sequence,
        workSiteId: punch.workSiteId,
        deviceId: punch.deviceId,
        detail,
      });
      return 'CLOSE_PREVIOUS';
    }

    // REQUIRE_EXPLICIT_CHECKOUT and CREATE_EXCEPTION behave identically here:
    // the earlier session keeps running and the conflicting punch is recorded
    // but not acted on. They differ at the WEB check-in boundary, where the
    // former refuses the request outright.
    exceptions.push({
      type: AttendanceExceptionType.OVERLAPPING_SESSION,
      message:
        'A new work period started before the previous one was closed. Both are recorded and need review.',
      rawEventId: punch.rawEventId,
      sessionSequence: open.sequence,
      workSiteId: punch.workSiteId,
      deviceId: punch.deviceId,
      detail,
    });

    open.status = AttendanceSessionStatus.CONFLICT;
    return 'IGNORE_PUNCH';
  }

  /**
   * Closes an open session on a check-out.
   *
   * Does NOT require the closing punch to come from the same device, or even the
   * same work site: an employee entering by the main door and leaving by the
   * back one is one ordinary office session, and demanding symmetry would
   * manufacture exceptions on every multi-reader site.
   */
  private closeSession(
    open: BuiltSession,
    punch: InterpretedPunch,
    mode: PunchWorkMode | undefined,
    context: SessionBuildContext,
    exceptions: BuiltException[],
  ): void {
    open.endedAt = punch.occurredAt;
    open.endSource = punch.captureSource;
    open.endRawEventId = punch.rawEventId;
    open.endDeviceId = punch.deviceId;
    open.durationMinutes = minutesBetween(open.startedAt, punch.occurredAt);
    open.status = AttendanceSessionStatus.CLOSED;

    const endWorkSiteId = mode?.workSiteId ?? punch.workSiteId;
    const crossedSites =
      open.workSiteId !== null &&
      endWorkSiteId !== null &&
      open.workSiteId !== endWorkSiteId;

    if (!crossedSites) return;

    const detail = {
      startWorkSiteId: open.workSiteId,
      endWorkSiteId,
      policy: context.policy.crossSitePolicy,
    };

    if (context.policy.crossSitePolicy === 'BLOCKED') {
      // The session is still stored — the punches happened — but it is marked
      // as conflicting so nothing downstream treats it as settled.
      open.status = AttendanceSessionStatus.CONFLICT;
    }

    if (context.policy.crossSitePolicy !== 'ALLOWED') {
      exceptions.push({
        type: AttendanceExceptionType.CROSS_SITE_SESSION,
        message:
          'This work period started at one work site and ended at another.',
        rawEventId: punch.rawEventId,
        sessionSequence: open.sequence,
        workSiteId: endWorkSiteId,
        deviceId: punch.deviceId,
        detail,
      });
    }
  }

  /**
   * Handles a session nobody closed.
   *
   * The default keeps it INCOMPLETE with no end time and raises an exception.
   * Auto-closing at the shift end is available but opt-in, because a checkout
   * the engine invented is indistinguishable downstream from one the employee
   * actually made — and it is paid.
   */
  private finishUnterminatedSession(
    open: BuiltSession,
    context: SessionBuildContext,
    exceptions: BuiltException[],
  ): void {
    if (context.policy.autoCloseAtShiftEnd && context.shiftEndAt) {
      // Never extends a session backwards: a check-in after the shift ended
      // cannot be closed at a time before it started.
      const closeAt =
        context.shiftEndAt > open.startedAt
          ? context.shiftEndAt
          : open.startedAt;

      open.endedAt = closeAt;
      open.status = AttendanceSessionStatus.ADJUSTED;
      open.durationMinutes = minutesBetween(open.startedAt, closeAt);
      open.adjustmentNote = 'Closed automatically at the scheduled shift end.';

      exceptions.push({
        type: AttendanceExceptionType.MISSING_CHECKOUT,
        message:
          'No check-out was recorded. The work period was closed at the scheduled shift end, as this tenant has configured.',
        rawEventId: open.startRawEventId,
        sessionSequence: open.sequence,
        workSiteId: open.workSiteId,
        deviceId: open.startDeviceId,
        detail: {
          startedAt: open.startedAt.toISOString(),
          closedAt: closeAt.toISOString(),
          autoClosed: true,
        },
      });
      return;
    }

    open.status = AttendanceSessionStatus.INCOMPLETE;
    open.durationMinutes = null;

    exceptions.push({
      type: AttendanceExceptionType.MISSING_CHECKOUT,
      message:
        'A work period was started but never closed. The worked time cannot be calculated until it is corrected.',
      rawEventId: open.startRawEventId,
      sessionSequence: open.sequence,
      workSiteId: open.workSiteId,
      deviceId: open.startDeviceId,
      detail: { startedAt: open.startedAt.toISOString(), autoClosed: false },
    });
  }

  /**
   * Flags an unauthorised site punch without discarding it.
   *
   * The punch is real evidence that a person was at a terminal. Dropping it
   * would lose that; accepting it silently would credit attendance at a site the
   * employee is not assigned to. So it is kept, and a human decides.
   */
  private checkWorkSiteAuthorization(
    punch: InterpretedPunch,
    mode: PunchWorkMode | undefined,
    context: SessionBuildContext,
    exceptions: BuiltException[],
  ): void {
    const workSiteId = mode?.workSiteId ?? punch.workSiteId;
    if (!workSiteId) return;
    if (context.authorizedWorkSiteIds.has(workSiteId)) return;

    exceptions.push({
      type: AttendanceExceptionType.UNAUTHORIZED_WORK_SITE,
      message:
        'This punch came from a work site the employee is not authorised for. It has been kept as evidence and needs review.',
      rawEventId: punch.rawEventId,
      sessionSequence: null,
      workSiteId,
      deviceId: punch.deviceId,
      detail: {
        occurredAt: punch.occurredAt.toISOString(),
        authorizedWorkSiteIds: [...context.authorizedWorkSiteIds],
      },
    });
  }

  /**
   * Marks the gaps between work sessions as breaks.
   *
   * Opt-in. A gap is not automatically an unpaid break — an employee who checked
   * out at 12:30 and back in at 14:00 may have been at lunch, or may have been
   * travelling between sites on work time, and only tenant policy knows which.
   */
  private recordGapsAsBreaks(sessions: BuiltSession[]): void {
    const work = sessions
      .filter((session) => !session.isBreak && session.endedAt)
      .sort(byStart);

    for (let index = 0; index < work.length - 1; index++) {
      const current = work[index];
      const next = work[index + 1];
      if (!current.endedAt) continue;

      const gap = minutesBetween(current.endedAt, next.startedAt);
      if (gap <= 0) continue;

      sessions.push({
        sequence: sessions.length,
        startedAt: current.endedAt,
        endedAt: next.startedAt,
        startSource: current.endSource ?? current.startSource,
        endSource: next.startSource,
        startRawEventId: null,
        endRawEventId: null,
        workMode: current.workMode,
        workSiteId: current.workSiteId,
        startDeviceId: null,
        endDeviceId: null,
        status: AttendanceSessionStatus.CLOSED,
        durationMinutes: gap,
        isBreak: true,
      });
    }
  }
}

/**
 * Whole minutes between two instants.
 *
 * Truncated, not rounded: crediting a partial minute of work that was not
 * performed is the wrong direction to be wrong in, and it compounds across a
 * month of sessions.
 */
function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function bySequence(left: BuiltSession, right: BuiltSession): number {
  return left.sequence - right.sequence;
}

function byStart(left: BuiltSession, right: BuiltSession): number {
  return left.startedAt.getTime() - right.startedAt.getTime();
}
