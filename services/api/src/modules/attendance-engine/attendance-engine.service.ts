import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  Prisma,
} from '@prisma/client';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateAtUtcMidnight } from '../attendance/attendance-time.util';
import { AuditService } from '../audit/audit.service';
import { AttendanceReconciliationQueueService } from './attendance-reconciliation-queue.service';
import { AttendanceReconciliationService } from './attendance-reconciliation.service';

/**
 * The read and act surface over reconciled attendance.
 *
 * AUTHORISATION IS THE EXISTING ONE. There is no second access model here: an
 * employee sees their own days, a manager sees their reporting line, and holders
 * of the tenant-wide attendance permissions see everything — decided by the same
 * permission keys the attendance module already uses. Inventing a parallel scope
 * for the engine would mean two answers to "may this person see this" and one of
 * them would eventually be wrong.
 *
 * LOCATION IS SENSITIVE. Coordinates never appear in list responses. They belong
 * to the day they were captured for and are returned only on a detail an
 * authorised caller explicitly asked for.
 */

const MAX_PAGE_SIZE = 200;

@Injectable()
export class AttendanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: AttendanceReconciliationService,
    private readonly queue: AttendanceReconciliationQueueService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------------- day detail

  /**
   * One reconciled day, with everything needed to explain it.
   *
   * Sessions, exceptions, adjustments and the leave/holiday context are returned
   * together because the question a person actually asks is "why does my day say
   * that", and answering it from four separate requests invites a UI that shows
   * three of them.
   */
  async getDay(
    user: AuthenticatedUser,
    employeeId: string,
    date: string,
  ): Promise<AttendanceDayDetail> {
    await this.assertCanReadEmployee(user, employeeId);

    const attendanceDate = parseDate(date);

    const day = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_attendanceDate: {
          tenantId: user.tenantId,
          employeeId,
          attendanceDate,
        },
      },
      include: {
        sessions: { orderBy: { sequence: 'asc' } },
        exceptions: { orderBy: { detectedAt: 'desc' } },
        shiftTemplate: {
          select: { id: true, name: true, startTime: true, endTime: true },
        },
      },
    });

    if (!day) {
      // Not an error. A day with no reconciled record is a day nothing has been
      // recorded for, and the caller needs to be able to say so rather than
      // showing a failure.
      return {
        exists: false,
        employeeId,
        attendanceDate: date,
        sessions: [],
        exceptions: [],
        adjustments: [],
      };
    }

    const workSiteIds = [
      ...new Set(day.sessions.map((s) => s.workSiteId).filter(isString)),
    ];

    const [workSites, adjustments] = await Promise.all([
      workSiteIds.length > 0
        ? this.prisma.location.findMany({
            where: { tenantId: user.tenantId, id: { in: workSiteIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId,
          OR: [
            { attendanceDate },
            { attendanceEntry: { date: attendanceDate, employeeId } },
          ],
        },
        orderBy: { createdAtUtc: 'desc' },
        select: {
          id: true,
          requestNumber: true,
          correctionType: true,
          status: true,
          reason: true,
          requestedCheckInAtUtc: true,
          requestedCheckOutAtUtc: true,
          isWebFallback: true,
          createdAtUtc: true,
        },
      }),
    ]);

    const siteNames = new Map(
      workSites.map((site) => [site.id, site.name] as const),
    );

    return {
      exists: true,
      employeeId,
      attendanceDate: date,
      status: day.status,
      timezone: day.timezone,
      shift: day.shiftTemplate,
      scheduledMinutes: day.scheduledMinutes,
      workedMinutes: day.workedMinutes,
      officeMinutes: day.officeMinutes,
      remoteMinutes: day.remoteMinutes,
      fieldMinutes: day.fieldMinutes,
      breakMinutes: day.breakMinutes,
      lateMinutes: day.lateMinutes,
      earlyArrivalMinutes: day.earlyArrivalMinutes,
      earlyDepartureMinutes: day.earlyDepartureMinutes,
      extraMinutes: day.extraMinutes,
      approvedOvertimeMinutes: day.approvedOvertimeMinutes,
      derivedWorkMode: day.derivedWorkMode,
      firstCheckInAt: day.firstCheckInAt,
      lastCheckOutAt: day.lastCheckOutAt,
      isHoliday: day.isHoliday,
      isWeekend: day.isWeekend,
      isOffDay: day.isOffDay,
      onLeave: day.onLeave,
      locked: day.locked,
      lockedAt: day.lockedAt,
      lockReason: day.lockReason,
      reconciliationVersion: day.reconciliationVersion,
      lastReconciledAt: day.lastReconciledAt,
      sessions: day.sessions.map((session) => ({
        id: session.id,
        sequence: session.sequence,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes,
        workMode: session.workMode,
        workSiteId: session.workSiteId,
        workSiteName: session.workSiteId
          ? (siteNames.get(session.workSiteId) ?? null)
          : null,
        startSource: session.startSource,
        endSource: session.endSource,
        status: session.status,
        isBreak: session.isBreak,
        isAdjusted: session.isAdjusted,
      })),
      exceptions: day.exceptions.map(toExceptionSummary),
      adjustments,
    };
  }

  /**
   * A range of reconciled days, for a calendar or a summary.
   *
   * Deliberately thin: totals and status only, no sessions and no location. A
   * month view does not need coordinates, and returning them would put an
   * employee's movements into a response that is easy to over-share.
   */
  async listDays(
    user: AuthenticatedUser,
    query: { employeeId: string; from: string; to: string },
  ) {
    await this.assertCanReadEmployee(user, query.employeeId);

    const from = parseDate(query.from);
    const to = parseDate(query.to);

    if (to < from) {
      throw new BadRequestException(
        'The end date must not be before the start date.',
      );
    }

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: query.employeeId,
        attendanceDate: { gte: from, lte: to },
      },
      orderBy: { attendanceDate: 'asc' },
      select: {
        id: true,
        attendanceDate: true,
        status: true,
        scheduledMinutes: true,
        workedMinutes: true,
        officeMinutes: true,
        remoteMinutes: true,
        fieldMinutes: true,
        lateMinutes: true,
        earlyDepartureMinutes: true,
        extraMinutes: true,
        derivedWorkMode: true,
        sessionCount: true,
        openExceptionCount: true,
        onLeave: true,
        isHoliday: true,
        isWeekend: true,
        locked: true,
      },
    });

    return { items: days };
  }

  // ------------------------------------------------------------- exceptions

  /**
   * The manager/HR exception workspace.
   *
   * Scoped by the same permissions as attendance reading: a manager sees their
   * reporting line, a tenant-wide reader sees everything. The filter set matches
   * what an operator actually triages by — who, where, what kind, how recent.
   */
  async listExceptions(
    user: AuthenticatedUser,
    query: {
      employeeId?: string;
      departmentId?: string;
      workSiteId?: string;
      type?: AttendanceExceptionType;
      status?: AttendanceExceptionStatus;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 25));

    const scopedEmployeeIds = await this.resolveReadableEmployeeIds(user, {
      employeeId: query.employeeId,
      departmentId: query.departmentId,
    });

    // An empty scope means "this caller may see nobody", which must return
    // nothing rather than falling through to an unfiltered query.
    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return { items: [], page, pageSize, total: 0 };
    }

    const where: Prisma.AttendanceExceptionWhereInput = {
      tenantId: user.tenantId,
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(query.workSiteId ? { workSiteId: query.workSiteId } : {}),
      ...(query.type ? { type: query.type } : {}),
      // Defaults to what needs attention; a workspace that opened on resolved
      // history would bury the work.
      status: query.status ?? AttendanceExceptionStatus.OPEN,
      ...(query.from || query.to
        ? {
            attendanceDate: {
              ...(query.from ? { gte: parseDate(query.from) } : {}),
              ...(query.to ? { lte: parseDate(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.attendanceException.findMany({
        where,
        orderBy: [{ attendanceDate: 'desc' }, { detectedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              departmentId: true,
            },
          },
          workSite: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendanceException.count({ where }),
    ]);

    return { items: items.map(toExceptionListItem), page, pageSize, total };
  }

  /**
   * Records a human decision on an exception.
   *
   * The row is never deleted. "This day had a missing checkout and a manager
   * accepted it on the 3rd" is the justification for attendance that was
   * eventually paid, and deleting it removes the reason from the record.
   */
  async resolveException(
    user: AuthenticatedUser,
    exceptionId: string,
    input: {
      status: Extract<
        AttendanceExceptionStatus,
        'RESOLVED' | 'IGNORED' | 'APPROVED' | 'REJECTED'
      >;
      note?: string;
    },
  ) {
    const exception = await this.prisma.attendanceException.findFirst({
      where: { id: exceptionId, tenantId: user.tenantId },
      select: { id: true, employeeId: true, status: true, type: true },
    });

    if (!exception) {
      throw new NotFoundException('Attendance exception could not be found.');
    }

    await this.assertCanManageEmployee(user, exception.employeeId);

    const updated = await this.prisma.attendanceException.update({
      where: { id: exception.id },
      data: {
        status: input.status,
        resolvedAt: new Date(),
        resolvedById: user.userId,
        resolutionNote: input.note?.trim()?.slice(0, 1000) ?? null,
        resolutionSource: 'MANUAL',
      },
      select: { id: true, status: true, attendanceDayId: true },
    });

    // Keeps the day's open-exception count honest without a full reconciliation
    // run, which would be wasteful for a decision that changed no evidence.
    if (updated.attendanceDayId) {
      await this.refreshOpenExceptionCount(updated.attendanceDayId);
    }

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'attendance.exception_resolved',
      entityType: 'AttendanceException',
      entityId: exception.id,
      sourceModule: 'attendance-engine',
      beforeSnapshot: { status: exception.status },
      afterSnapshot: { status: input.status, type: exception.type },
    });

    return updated;
  }

  // ----------------------------------------------------------------- locking

  /**
   * Locks or reopens a reconciled day.
   *
   * Locking is what makes finalised payroll safe: after it, arriving evidence is
   * still stored but the derived numbers do not move. Reopening is a deliberate,
   * audited act — and it queues a reconciliation, because the reason to reopen a
   * day is almost always that something needs recalculating.
   */
  async setDayLock(
    user: AuthenticatedUser,
    input: {
      employeeId: string;
      date: string;
      locked: boolean;
      reason?: string;
    },
  ) {
    await this.assertCanManageEmployee(user, input.employeeId);

    const attendanceDate = parseDate(input.date);

    const day = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_attendanceDate: {
          tenantId: user.tenantId,
          employeeId: input.employeeId,
          attendanceDate,
        },
      },
      select: { id: true, locked: true },
    });

    if (!day) {
      throw new NotFoundException(
        'No reconciled attendance exists for that day.',
      );
    }

    const updated = await this.prisma.attendanceDay.update({
      where: { id: day.id },
      data: {
        locked: input.locked,
        lockedAt: input.locked ? new Date() : null,
        lockedById: input.locked ? user.userId : null,
        lockReason: input.locked ? (input.reason?.slice(0, 500) ?? null) : null,
      },
      select: { id: true, locked: true, lockedAt: true },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: input.locked
        ? 'attendance.day_locked'
        : 'attendance.day_unlocked',
      entityType: 'AttendanceDay',
      entityId: day.id,
      sourceModule: 'attendance-engine',
      beforeSnapshot: { locked: day.locked },
      afterSnapshot: { locked: input.locked, reason: input.reason ?? null },
    });

    if (!input.locked) {
      await this.queue.enqueue({
        tenantId: user.tenantId,
        employeeId: input.employeeId,
        attendanceDate,
        reason: 'ATTENDANCE_DAY_REOPENED',
        requestedById: user.userId,
      });
    }

    return updated;
  }

  // ---------------------------------------------------------- admin actions

  /**
   * Queues reconciliation for a range.
   *
   * Queued, never run inline: a month for a department is thousands of days, and
   * an HTTP request is the wrong place to discover that. The bound exists so a
   * mistyped range cannot enqueue a decade.
   */
  async requestReconciliation(
    user: AuthenticatedUser,
    input: { employeeId: string; from: string; to: string; reason?: string },
  ) {
    await this.assertCanManageEmployee(user, input.employeeId);

    const from = parseDate(input.from);
    const to = parseDate(input.to);

    if (to < from) {
      throw new BadRequestException(
        'The end date must not be before the start date.',
      );
    }

    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days > MAX_BACKFILL_DAYS) {
      throw new BadRequestException(
        `A reconciliation request may cover at most ${MAX_BACKFILL_DAYS} days.`,
      );
    }

    const entries = Array.from({ length: days }, (_, offset) => ({
      tenantId: user.tenantId,
      employeeId: input.employeeId,
      attendanceDate: new Date(from.getTime() + offset * DAY_MS),
      reason: input.reason?.slice(0, 200) ?? 'MANUAL_REQUEST',
    }));

    const queued = await this.queue.enqueueMany(entries);

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'attendance.reconciliation_requested',
      entityType: 'Employee',
      entityId: input.employeeId,
      sourceModule: 'attendance-engine',
      afterSnapshot: { from: input.from, to: input.to, queued },
    });

    return { queued };
  }

  /**
   * Reconciles one day immediately.
   *
   * Bounded to a single day so it stays an HTTP-shaped operation. Used by
   * support and by the tests, where waiting on a background cycle would make an
   * assertion depend on a timer.
   */
  async reconcileNow(
    user: AuthenticatedUser,
    input: { employeeId: string; date: string },
  ) {
    await this.assertCanManageEmployee(user, input.employeeId);

    return this.reconciliation.reconcile(
      user.tenantId,
      input.employeeId,
      parseDate(input.date),
    );
  }

  // --------------------------------------------------------- exception detail

  /**
   * One exception with everything a reviewer needs to decide.
   *
   * Assembled in one call on purpose. The question being answered is "should this
   * count, and why", and making somebody open the attendance module, the leave
   * module and the corrections list to answer it is how exceptions go unreviewed.
   *
   * Precise coordinates are NOT here. They are fetched separately, behind
   * `attendance.locationEvidence.read`, so opening an exception never leaks a
   * position to someone who may only manage attendance.
   */
  async getExceptionDetail(user: AuthenticatedUser, exceptionId: string) {
    const exception = await this.prisma.attendanceException.findFirst({
      where: { id: exceptionId, tenantId: user.tenantId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workMode: true,
          },
        },
        workSite: { select: { id: true, name: true } },
        correctionRequest: {
          select: {
            id: true,
            requestNumber: true,
            correctionType: true,
            status: true,
            reason: true,
            requestedCheckInAtUtc: true,
            requestedCheckOutAtUtc: true,
            requestedWorkMode: true,
            requestedOvertimeMinutes: true,
            actionComment: true,
            approvedAtUtc: true,
            rejectedAtUtc: true,
            requestedByUser: { select: { firstName: true, lastName: true } },
            actionedByUser: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!exception) {
      throw new NotFoundException('Attendance exception could not be found.');
    }

    // The same scope as reading the employee's attendance: an exception is a fact
    // about a person's day, so seeing it requires being allowed to see the day.
    await this.assertCanReadEmployee(user, exception.employeeId);

    const dateKey = formatDateKey(exception.attendanceDate);

    const [day, leave, corrections] = await Promise.all([
      this.prisma.attendanceDay.findUnique({
        where: {
          tenantId_employeeId_attendanceDate: {
            tenantId: user.tenantId,
            employeeId: exception.employeeId,
            attendanceDate: exception.attendanceDate,
          },
        },
        include: {
          sessions: { orderBy: { sequence: 'asc' } },
          shiftTemplate: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
              lateGraceMinutes: true,
              earlyExitGraceMinutes: true,
            },
          },
        },
      }),
      // Leave context, so an ATTENDANCE_DURING_LEAVE reviewer sees "approved
      // annual leave plus device attendance" without opening another module.
      this.prisma.leaveRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId: exception.employeeId,
          status: 'APPROVED',
          startDate: { lte: exception.attendanceDate },
          endDate: { gte: exception.attendanceDate },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          leaveType: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: exception.employeeId,
          OR: [
            { attendanceDate: exception.attendanceDate },
            {
              attendanceEntry: {
                date: exception.attendanceDate,
                employeeId: exception.employeeId,
              },
            },
          ],
        },
        orderBy: { createdAtUtc: 'desc' },
        select: {
          id: true,
          requestNumber: true,
          correctionType: true,
          status: true,
          reason: true,
          createdAtUtc: true,
          approvedAtUtc: true,
          rejectedAtUtc: true,
        },
      }),
    ]);

    const workSiteIds = [
      ...new Set(
        (day?.sessions ?? []).map((s) => s.workSiteId).filter(isString),
      ),
    ];
    const workSites = workSiteIds.length
      ? await this.prisma.location.findMany({
          where: { tenantId: user.tenantId, id: { in: workSiteIds } },
          select: { id: true, name: true },
        })
      : [];
    const siteNames = new Map(
      workSites.map((site) => [site.id, site.name] as const),
    );

    return {
      id: exception.id,
      type: exception.type,
      status: exception.status,
      severity: exception.severity,
      message: exception.message,
      // Structured context the detector or builder recorded. Never coordinates:
      // the detectors put ids and arithmetic here, not positions.
      detail: exception.detail,
      attendanceDate: dateKey,
      detectedAt: exception.detectedAt,
      resolvedAt: exception.resolvedAt,
      resolvedById: exception.resolvedById,
      resolutionNote: exception.resolutionNote,
      resolutionSource: exception.resolutionSource,
      employee: {
        id: exception.employee.id,
        employeeCode: exception.employee.employeeCode,
        name: `${exception.employee.firstName} ${exception.employee.lastName}`.trim(),
        configuredWorkMode: exception.employee.workMode,
      },
      workSite: exception.workSite,

      // The reconciled day, or an explicit statement that there is not one yet.
      // A guessed total would be worse than none.
      attendanceDay: day
        ? {
            status: day.status,
            locked: day.locked,
            lockedAt: day.lockedAt,
            lockReason: day.lockReason,
            derivedWorkMode: day.derivedWorkMode,
            scheduledMinutes: day.scheduledMinutes,
            workedMinutes: day.workedMinutes,
            officeMinutes: day.officeMinutes,
            remoteMinutes: day.remoteMinutes,
            fieldMinutes: day.fieldMinutes,
            breakMinutes: day.breakMinutes,
            lateMinutes: day.lateMinutes,
            earlyDepartureMinutes: day.earlyDepartureMinutes,
            earlyArrivalMinutes: day.earlyArrivalMinutes,
            extraMinutes: day.extraMinutes,
            approvedOvertimeMinutes: day.approvedOvertimeMinutes,
            firstCheckInAt: day.firstCheckInAt,
            lastCheckOutAt: day.lastCheckOutAt,
            isHoliday: day.isHoliday,
            isWeekend: day.isWeekend,
            isOffDay: day.isOffDay,
            onLeave: day.onLeave,
            lastReconciledAt: day.lastReconciledAt,
            shift: day.shiftTemplate,
          }
        : null,

      sessions: (day?.sessions ?? []).map((session) => ({
        id: session.id,
        sequence: session.sequence,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes,
        workMode: session.workMode,
        workSiteId: session.workSiteId,
        workSiteName: session.workSiteId
          ? (siteNames.get(session.workSiteId) ?? null)
          : null,
        startSource: session.startSource,
        endSource: session.endSource,
        status: session.status,
        isBreak: session.isBreak,
        isAdjusted: session.isAdjusted,
      })),

      leave: leave
        ? {
            id: leave.id,
            typeName: leave.leaveType?.name ?? null,
            startDate: leave.startDate,
            endDate: leave.endDate,
            totalDays: leave.totalDays,
          }
        : null,

      linkedCorrection: exception.correctionRequest
        ? describeCorrection(exception.correctionRequest)
        : null,
      corrections,

      /**
       * Whether this exception type has coordinates worth asking for, and whether
       * this caller may see them. Both are decided here so the UI never offers a
       * button that would be refused.
       */
      locationEvidence: {
        relevant: LOCATION_EXCEPTION_TYPES.has(exception.type),
        viewable:
          LOCATION_EXCEPTION_TYPES.has(exception.type) &&
          (this.hasAny(user, ['attendance.locationEvidence.read']) ||
            (await this.isSelf(user, exception.employeeId))),
      },

      // Only what is reliably recorded. No invented chronology: each entry below
      // comes from a persisted timestamp.
      history: buildHistory(exception, corrections),
    };
  }

  // ------------------------------------------------------------- team days

  /**
   * Reconciled days across a team, with the filters a reviewer actually triages
   * by.
   *
   * FILTERED IN THE DATABASE, not in the browser. A tenant with four hundred
   * employees over a month is twelve thousand rows; filtering the current page
   * client-side would show a reviewer "3 hybrid days" when the real answer was
   * ninety.
   */
  async listTeamDays(
    user: AuthenticatedUser,
    query: {
      from: string;
      to: string;
      employeeId?: string;
      departmentId?: string;
      view?: TeamDayView;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 50));

    const scopedEmployeeIds = await this.resolveReadableEmployeeIds(user, {
      employeeId: query.employeeId,
      departmentId: query.departmentId,
    });

    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return { items: [], page, pageSize, total: 0, view: query.view ?? 'ALL' };
    }

    const where: Prisma.AttendanceDayWhereInput = {
      tenantId: user.tenantId,
      attendanceDate: { gte: parseDate(query.from), lte: parseDate(query.to) },
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...this.viewFilter(query.view),
    };

    const [rows, total] = await Promise.all([
      this.prisma.attendanceDay.findMany({
        where,
        orderBy: [{ attendanceDate: 'desc' }, { employeeId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          shiftTemplate: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendanceDay.count({ where }),
    ]);

    // Correction status per day, in one query rather than per row.
    const pendingCorrections =
      await this.prisma.attendanceCorrectionRequest.groupBy({
        by: ['employeeId', 'attendanceDate'],
        where: {
          tenantId: user.tenantId,
          status: 'PENDING_APPROVAL',
          attendanceDate: {
            gte: parseDate(query.from),
            lte: parseDate(query.to),
          },
          ...(scopedEmployeeIds
            ? { employeeId: { in: scopedEmployeeIds } }
            : {}),
        },
        _count: { _all: true },
      });

    const pendingByKey = new Map(
      pendingCorrections
        .filter((row) => row.attendanceDate !== null)
        .map((row) => [
          `${row.employeeId}:${formatDateKey(row.attendanceDate as Date)}`,
          row._count._all,
        ]),
    );

    return {
      view: query.view ?? 'ALL',
      page,
      pageSize,
      total,
      items: rows.map((row) => {
        const dateKey = formatDateKey(row.attendanceDate);
        return {
          id: row.id,
          attendanceDate: dateKey,
          // The projected public record, so the UI can link to the existing
          // attendance detail page instead of growing a second one. Null until
          // the day has been reconciled at least once.
          attendanceEntryId: row.attendanceEntryId,
          employee: {
            id: row.employee.id,
            employeeCode: row.employee.employeeCode,
            name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
          },
          shift: row.shiftTemplate,
          status: row.status,
          // PENDING means the engine has evidence it has not finished with. The
          // UI must not present the other numbers as final while this is true.
          reconciliationPending:
            row.status === 'PENDING' || row.lastReconciledAt === null,
          firstCheckInAt: row.firstCheckInAt,
          lastCheckOutAt: row.lastCheckOutAt,
          workedMinutes: row.workedMinutes,
          scheduledMinutes: row.scheduledMinutes,
          derivedWorkMode: row.derivedWorkMode,
          lateMinutes: row.lateMinutes,
          earlyDepartureMinutes: row.earlyDepartureMinutes,
          extraMinutes: row.extraMinutes,
          approvedOvertimeMinutes: row.approvedOvertimeMinutes,
          openExceptionCount: row.openExceptionCount,
          pendingCorrectionCount:
            pendingByKey.get(`${row.employee.id}:${dateKey}`) ?? 0,
          locked: row.locked,
          onLeave: row.onLeave,
          isHoliday: row.isHoliday,
          isWeekend: row.isWeekend,
        };
      }),
    };
  }

  /**
   * Translates a named view into a database filter.
   *
   * Each is a real predicate, so a view's row count is the truth rather than
   * whatever happened to be on the page.
   */
  private viewFilter(view?: TeamDayView): Prisma.AttendanceDayWhereInput {
    switch (view) {
      case 'NEEDS_REVIEW':
        return { openExceptionCount: { gt: 0 } };

      case 'PENDING_RECONCILIATION':
        return { status: 'PENDING' };

      case 'MISSING_PUNCHES':
        return {
          exceptions: {
            some: {
              status: AttendanceExceptionStatus.OPEN,
              type: {
                in: [
                  AttendanceExceptionType.MISSING_CHECKIN,
                  AttendanceExceptionType.MISSING_CHECKOUT,
                ],
              },
            },
          },
        };

      case 'HYBRID':
        // From the DERIVED mode, never the employee's configured one: what they
        // are permitted to do is a different question from what they did.
        return { derivedWorkMode: 'HYBRID' };

      case 'PENDING_CORRECTIONS':
        return {
          employee: {
            attendanceCorrectionRequests: {
              some: { status: 'PENDING_APPROVAL' },
            },
          },
        };

      case 'LOCKED':
        return { locked: true };

      case 'LOCKED_WITH_NEW_EVIDENCE':
        // The case that matters: finalised attendance a punch arrived after.
        return {
          locked: true,
          exceptions: {
            some: {
              status: AttendanceExceptionStatus.OPEN,
              type: AttendanceExceptionType.LOCKED_PERIOD_EVENT,
            },
          },
        };

      case 'ATTENDANCE_DURING_LEAVE':
        return {
          exceptions: {
            some: {
              status: AttendanceExceptionStatus.OPEN,
              type: AttendanceExceptionType.ATTENDANCE_DURING_LEAVE,
            },
          },
        };

      case 'UNAUTHORIZED_WORK_SITE':
        return {
          exceptions: {
            some: {
              status: AttendanceExceptionStatus.OPEN,
              type: AttendanceExceptionType.UNAUTHORIZED_WORK_SITE,
            },
          },
        };

      case 'ALL':
      default:
        return {};
    }
  }

  // -------------------------------------------------------- location evidence

  /**
   * The exact coordinates behind a location-validated attendance decision.
   *
   * Behind its own permission, deliberately narrower than reading attendance:
   * the business result — "accepted as remote, 4.2 km from Doha HQ" — is what
   * almost everyone needs, and precise employee locations should be seen by as
   * few people as possible.
   *
   * Employees may read their own. Anyone else needs
   * `attendance.locationEvidence.read`; holding `attendance.manage` is not
   * enough, because managing attendance and tracking where someone physically
   * was are different privileges.
   */
  async listLocationEvidence(
    user: AuthenticatedUser,
    query: { employeeId: string; from: string; to: string },
  ) {
    const isSelf = await this.isSelf(user, query.employeeId);

    if (!isSelf && !this.hasAny(user, ['attendance.locationEvidence.read'])) {
      throw new ForbiddenException(
        'You do not have permission to view attendance location evidence.',
      );
    }

    // Self-service still goes through the ordinary read scope, so an employee
    // whose attendance is hidden from them does not see its coordinates either.
    if (!isSelf) {
      await this.assertCanReadEmployee(user, query.employeeId);
    }

    const rows = await this.prisma.attendanceLocationEvidence.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: query.employeeId,
        attendanceDate: {
          gte: parseDate(query.from),
          lte: parseDate(query.to),
        },
      },
      orderBy: { capturedAt: 'desc' },
      take: 200,
      include: { matchedWorkSite: { select: { id: true, name: true } } },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'attendance.location_evidence_viewed',
      entityType: 'Employee',
      entityId: query.employeeId,
      sourceModule: 'attendance-engine',
      // The fact of the access, and how much was seen. Never the coordinates
      // themselves: an audit log is read far more widely than this endpoint.
      afterSnapshot: { from: query.from, to: query.to, records: rows.length },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        attendanceDate: row.attendanceDate,
        capturedAt: row.capturedAt,
        action: row.action,
        captureSource: row.captureSource,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        accuracyMeters: row.accuracyMeters,
        distanceMeters: row.distanceMeters,
        insideGeofence: row.insideGeofence,
        geofenceRadiusMeters: row.geofenceRadiusMeters,
        effectiveAccuracyLimitMeters: row.effectiveAccuracyLimitMeters,
        outcome: row.outcome,
        reasonCode: row.reasonCode,
        resolvedWorkMode: row.resolvedWorkMode,
        matchedWorkSite: row.matchedWorkSite,
        ipAddress: row.ipAddress,
      })),
    };
  }

  // ------------------------------------------------------- exception summary

  /**
   * Counts for the workspace's quick filters.
   *
   * Every number comes from a real query against the caller's own scope. A
   * summary that over-counts what someone may actually open is worse than no
   * summary: it advertises work they cannot do.
   */
  async exceptionSummary(
    user: AuthenticatedUser,
    query: { from?: string; to?: string } = {},
  ) {
    const scopedEmployeeIds = await this.resolveReadableEmployeeIds(user, {});

    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return emptySummary();
    }

    const where: Prisma.AttendanceExceptionWhereInput = {
      tenantId: user.tenantId,
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(query.from || query.to
        ? {
            attendanceDate: {
              ...(query.from ? { gte: parseDate(query.from) } : {}),
              ...(query.to ? { lte: parseDate(query.to) } : {}),
            },
          }
        : {}),
    };

    const open = { ...where, status: AttendanceExceptionStatus.OPEN };

    const [
      total,
      blocking,
      missingPunch,
      leaveConflict,
      workSiteConflict,
      lockedPeriod,
    ] = await Promise.all([
      this.prisma.attendanceException.count({ where: open }),
      this.prisma.attendanceException.count({
        where: { ...open, severity: 'BLOCKING' },
      }),
      this.prisma.attendanceException.count({
        where: {
          ...open,
          type: {
            in: [
              AttendanceExceptionType.MISSING_CHECKIN,
              AttendanceExceptionType.MISSING_CHECKOUT,
            ],
          },
        },
      }),
      this.prisma.attendanceException.count({
        where: {
          ...open,
          type: AttendanceExceptionType.ATTENDANCE_DURING_LEAVE,
        },
      }),
      this.prisma.attendanceException.count({
        where: {
          ...open,
          type: {
            in: [
              AttendanceExceptionType.UNAUTHORIZED_WORK_SITE,
              AttendanceExceptionType.CROSS_SITE_SESSION,
            ],
          },
        },
      }),
      this.prisma.attendanceException.count({
        where: { ...open, type: AttendanceExceptionType.LOCKED_PERIOD_EVENT },
      }),
    ]);

    return {
      open: total,
      critical: blocking,
      missingPunch,
      leaveConflict,
      workSiteConflict,
      lockedPeriod,
    };
  }

  // ----------------------------------------------------------------- helpers

  private async refreshOpenExceptionCount(
    attendanceDayId: string,
  ): Promise<void> {
    const open = await this.prisma.attendanceException.count({
      where: {
        attendanceDayId,
        status: AttendanceExceptionStatus.OPEN,
      },
    });

    await this.prisma.attendanceDay.update({
      where: { id: attendanceDayId },
      data: { openExceptionCount: open },
    });
  }

  /**
   * Whether the caller may READ this employee's attendance.
   *
   * An employee always may for themselves. Beyond that it defers to the existing
   * attendance permissions, so the engine cannot become a way around the access
   * rules the rest of the module enforces.
   */
  private async assertCanReadEmployee(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (await this.isSelf(user, employeeId)) return;

    if (this.hasAny(user, ['attendance.manage', 'attendance.read.all'])) return;

    const isReport = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: user.tenantId,
        isDeleted: false,
        manager: { userId: user.userId },
      },
      select: { id: true },
    });

    if (!isReport) {
      throw new ForbiddenException(
        'You do not have access to this employee’s attendance.',
      );
    }
  }

  /** Acting on attendance needs more than reading it. */
  private async assertCanManageEmployee(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (this.hasAny(user, ['attendance.manage'])) return;

    const isReport = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: user.tenantId,
        isDeleted: false,
        manager: { userId: user.userId },
      },
      select: { id: true },
    });

    if (!isReport) {
      throw new ForbiddenException(
        'You do not have permission to act on this employee’s attendance.',
      );
    }
  }

  /**
   * The employees a caller may see.
   *
   * Returns null for "everyone in the tenant", so the caller can omit the filter
   * entirely rather than building a list of every employee id.
   */
  private async resolveReadableEmployeeIds(
    user: AuthenticatedUser,
    filters: { employeeId?: string; departmentId?: string },
  ): Promise<string[] | null> {
    if (this.hasAny(user, ['attendance.manage', 'attendance.read.all'])) {
      if (!filters.employeeId && !filters.departmentId) return null;

      const scoped = await this.prisma.employee.findMany({
        where: {
          tenantId: user.tenantId,
          ...(filters.employeeId ? { id: filters.employeeId } : {}),
          ...(filters.departmentId
            ? { departmentId: filters.departmentId }
            : {}),
        },
        select: { id: true },
      });
      return scoped.map((row) => row.id);
    }

    const reports = await this.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filters.employeeId ? { id: filters.employeeId } : {}),
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        isDeleted: false,
        OR: [{ manager: { userId: user.userId } }, { userId: user.userId }],
      },
      select: { id: true },
    });

    return reports.map((row) => row.id);
  }

  private async isSelf(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<boolean> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    return employee !== null;
  }

  private hasAny(user: AuthenticatedUser, keys: readonly string[]): boolean {
    const held = new Set(user.permissionKeys ?? []);
    return keys.some((key) => held.has(key));
  }
}

// --------------------------------------------------------------------- types

const DAY_MS = 24 * 60 * 60 * 1000;

/** A month per request. A mistyped range must not enqueue a decade. */
const MAX_BACKFILL_DAYS = 31;

export interface AttendanceDayDetail {
  exists: boolean;
  employeeId: string;
  attendanceDate: string;
  status?: string;
  timezone?: string | null;
  shift?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  scheduledMinutes?: number;
  workedMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  fieldMinutes?: number;
  breakMinutes?: number;
  lateMinutes?: number;
  earlyArrivalMinutes?: number;
  earlyDepartureMinutes?: number;
  extraMinutes?: number;
  approvedOvertimeMinutes?: number;
  derivedWorkMode?: string | null;
  firstCheckInAt?: Date | null;
  lastCheckOutAt?: Date | null;
  isHoliday?: boolean;
  isWeekend?: boolean;
  isOffDay?: boolean;
  onLeave?: boolean;
  locked?: boolean;
  lockedAt?: Date | null;
  lockReason?: string | null;
  reconciliationVersion?: number;
  lastReconciledAt?: Date | null;
  sessions: unknown[];
  exceptions: unknown[];
  adjustments: unknown[];
}

/** The named views the manager daily review offers. */
export type TeamDayView =
  | 'ALL'
  | 'NEEDS_REVIEW'
  | 'PENDING_RECONCILIATION'
  | 'MISSING_PUNCHES'
  | 'HYBRID'
  | 'PENDING_CORRECTIONS'
  | 'LOCKED'
  | 'LOCKED_WITH_NEW_EVIDENCE'
  | 'ATTENDANCE_DURING_LEAVE'
  | 'UNAUTHORIZED_WORK_SITE';

/**
 * Exception types whose coordinates are worth offering.
 *
 * Anything else has no position behind it, so the UI should not imply there is
 * evidence to reveal.
 */
const LOCATION_EXCEPTION_TYPES = new Set<AttendanceExceptionType>([
  AttendanceExceptionType.GEOFENCE_FAILURE,
  AttendanceExceptionType.GPS_ACCURACY_FAILURE,
  AttendanceExceptionType.UNAUTHORIZED_WORK_SITE,
  AttendanceExceptionType.IMPOSSIBLE_TRAVEL,
]);

function describeCorrection(request: {
  id: string;
  requestNumber: string;
  correctionType: string;
  status: string;
  reason: string;
  requestedCheckInAtUtc: Date | null;
  requestedCheckOutAtUtc: Date | null;
  requestedWorkMode: string | null;
  requestedOvertimeMinutes: number | null;
  actionComment: string | null;
  approvedAtUtc: Date | null;
  rejectedAtUtc: Date | null;
  requestedByUser: { firstName: string; lastName: string } | null;
  actionedByUser: { firstName: string; lastName: string } | null;
}) {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    correctionType: request.correctionType,
    status: request.status,
    reason: request.reason,
    requestedCheckInAtUtc: request.requestedCheckInAtUtc,
    requestedCheckOutAtUtc: request.requestedCheckOutAtUtc,
    requestedWorkMode: request.requestedWorkMode,
    requestedOvertimeMinutes: request.requestedOvertimeMinutes,
    requestedBy: request.requestedByUser
      ? `${request.requestedByUser.firstName} ${request.requestedByUser.lastName}`.trim()
      : null,
    approver: request.actionedByUser
      ? `${request.actionedByUser.firstName} ${request.actionedByUser.lastName}`.trim()
      : null,
    decisionNote: request.actionComment,
    decidedAt: request.approvedAtUtc ?? request.rejectedAtUtc,
  };
}

/**
 * A chronology built ONLY from persisted timestamps.
 *
 * Deliberately not an event table: the fields already record when the exception
 * was detected, when corrections were raised and decided, when the day was last
 * reconciled and when the exception was resolved. Inventing entries between them
 * would be fabricating a history nobody recorded.
 */
function buildHistory(
  exception: {
    detectedAt: Date;
    resolvedAt: Date | null;
    resolutionSource: string | null;
    resolutionNote: string | null;
    status: string;
  },
  corrections: ReadonlyArray<{
    requestNumber: string;
    createdAtUtc: Date;
    approvedAtUtc: Date | null;
    rejectedAtUtc: Date | null;
  }>,
) {
  const entries: Array<{ at: Date; label: string; detail: string | null }> = [
    { at: exception.detectedAt, label: 'Detected', detail: null },
  ];

  for (const correction of corrections) {
    entries.push({
      at: correction.createdAtUtc,
      label: 'Correction requested',
      detail: correction.requestNumber,
    });
    if (correction.approvedAtUtc) {
      entries.push({
        at: correction.approvedAtUtc,
        label: 'Correction approved',
        detail: correction.requestNumber,
      });
    }
    if (correction.rejectedAtUtc) {
      entries.push({
        at: correction.rejectedAtUtc,
        label: 'Correction rejected',
        detail: correction.requestNumber,
      });
    }
  }

  if (exception.resolvedAt) {
    entries.push({
      at: exception.resolvedAt,
      label:
        exception.resolutionSource === 'RECONCILIATION'
          ? 'Resolved by reconciliation'
          : 'Resolved',
      detail: exception.resolutionNote,
    });
  }

  return entries.sort((left, right) => left.at.getTime() - right.at.getTime());
}

function formatDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function emptySummary() {
  return {
    open: 0,
    critical: 0,
    missingPunch: 0,
    leaveConflict: 0,
    workSiteConflict: 0,
    lockedPeriod: 0,
  };
}

function toExceptionSummary(exception: {
  id: string;
  type: AttendanceExceptionType;
  status: AttendanceExceptionStatus;
  severity: string;
  message: string;
  detail: Prisma.JsonValue | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}) {
  return {
    id: exception.id,
    type: exception.type,
    status: exception.status,
    severity: exception.severity,
    message: exception.message,
    detail: exception.detail,
    detectedAt: exception.detectedAt,
    resolvedAt: exception.resolvedAt,
    resolutionNote: exception.resolutionNote,
  };
}

function toExceptionListItem(exception: {
  id: string;
  type: AttendanceExceptionType;
  status: AttendanceExceptionStatus;
  severity: string;
  message: string;
  attendanceDate: Date;
  detectedAt: Date;
  employee: {
    id: string;
    employeeCode: string | null;
    firstName: string;
    lastName: string;
  };
  workSite: { id: string; name: string } | null;
}) {
  return {
    id: exception.id,
    type: exception.type,
    status: exception.status,
    severity: exception.severity,
    message: exception.message,
    attendanceDate: exception.attendanceDate,
    detectedAt: exception.detectedAt,
    employee: {
      id: exception.employee.id,
      employeeCode: exception.employee.employeeCode,
      name: `${exception.employee.firstName} ${exception.employee.lastName}`.trim(),
    },
    workSite: exception.workSite,
  };
}

/**
 * Parses a YYYY-MM-DD attendance date.
 *
 * Anchored at UTC midnight, matching how business dates are stored throughout.
 * A free-form date string is rejected rather than coerced, because a
 * misinterpreted date silently returns another day's attendance.
 */
function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Dates must be formatted YYYY-MM-DD.');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('That is not a valid date.');
  }

  return businessDateAtUtcMidnight(parsed, 'UTC');
}

function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}
