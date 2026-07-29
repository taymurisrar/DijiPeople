import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceEntryStatus,
  AttendanceMode,
  LeaveRequestStatus,
  Prisma,
  TimesheetCompletionStatus,
  TimesheetDayType,
  TimesheetDayTypeSource,
  TimesheetEntrySource,
  TimesheetLockStatus,
  TimesheetStatus,
  TimesheetWeekStatus,
  WorkWeekday,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AuditService } from '../audit/audit.service';
import { EnterpriseConfigurationService } from '../tenant-settings/enterprise-configuration.service';
import { TimesheetCalculationService } from './timesheet-calculation.service';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';

type GenerationReason =
  | 'LAZY_GENERATION'
  | 'CURRENT_MONTH_REPAIR'
  | 'NEXT_MONTH_GENERATION'
  | 'HOLIDAY_RECALCULATION'
  | 'LEAVE_RECALCULATION'
  | 'ATTENDANCE_PREFILL';

@Injectable()
export class TimesheetGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: TimesheetPolicyResolverService,
    private readonly enterpriseConfiguration: EnterpriseConfigurationService,
    private readonly attendanceService: AttendanceService,
    private readonly calculationService: TimesheetCalculationService,
    private readonly auditService: AuditService,
  ) {}

  async synchronize(
    user: Pick<AuthenticatedUser, 'tenantId' | 'userId'>,
    timesheetId: string,
    reason: GenerationReason = 'LAZY_GENERATION',
  ) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, tenantId: user.tenantId },
      include: {
        employee: {
          select: {
            id: true,
            hireDate: true,
            terminationDate: true,
            status: true,
            isDeleted: true,
            organizationId: true,
            businessUnitId: true,
            departmentId: true,
            teamId: true,
            locationId: true,
            defaultWorkScheduleId: true,
          },
        },
      },
    });
    if (!timesheet) throw new NotFoundException('Timesheet was not found.');
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      timesheet.employeeId,
      timesheet.periodStart,
    );
    const settings = policy.values;
    if (!booleanSetting(settings, 'enableTimesheetModule', true)) {
      throw new BadRequestException(
        'Timesheet module is disabled by resolved policy.',
      );
    }

    const [workSchedule, holidays, leaves, attendance] = await Promise.all([
      this.resolveWorkSchedule({
        tenantId: user.tenantId,
        employeeId: timesheet.employeeId,
        organizationId: timesheet.employee.organizationId,
        businessUnitId: timesheet.businessUnitId,
        departmentId: timesheet.employee.departmentId,
        locationId: timesheet.employee.locationId,
        effectiveDate: timesheet.periodStart,
      }),
      this.enterpriseConfiguration.findResolvedHolidaysForRange({
        tenantId: user.tenantId,
        businessUnitId: timesheet.businessUnitId,
        periodStart: timesheet.periodStart,
        periodEnd: timesheet.periodEnd,
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: timesheet.employeeId,
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: timesheet.periodEnd },
          endDate: { gte: timesheet.periodStart },
        },
        include: { leaveType: { select: { id: true, name: true } } },
        orderBy: { startDate: 'asc' },
      }),
      this.attendanceService.getTimesheetAttendanceHours({
        tenantId: user.tenantId,
        employeeId: timesheet.employeeId,
        periodStart: timesheet.periodStart,
        periodEnd: timesheet.periodEnd,
      }),
    ]);
    const holidayByDate = new Map(
      holidays.map((holiday) => [dateKey(holiday.date), holiday]),
    );
    const leaveByDate = buildLeaveMap(leaves);
    const attendanceByDate = new Map(
      attendance.map((entry) => [dateKey(entry.date), entry]),
    );
    const weekRanges = buildWeekRanges(
      timesheet.periodStart,
      timesheet.periodEnd,
      weekdaySetting(settings, 'weekStartDay', WorkWeekday.MONDAY),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          organizationId: timesheet.employee.organizationId,
          businessUnitId:
            timesheet.employee.businessUnitId ?? timesheet.businessUnitId,
          departmentId: timesheet.employee.departmentId,
          teamId: timesheet.employee.teamId,
          generatedAt: timesheet.generatedAt ?? now,
          policyId: policy.effectivePolicy?.id ?? null,
          policyVersion: policy.effectivePolicy?.version ?? null,
          policySnapshot: {
            resolvedAt: now.toISOString(),
            effectivePolicy: policy.effectivePolicy,
            appliedPolicyIds: policy.appliedPolicies.map((item) => item.id),
          },
        },
      });

      for (const range of weekRanges) {
        const existingWeek = await tx.timesheetWeek.findUnique({
          where: {
            timesheetId_weekNumber: {
              timesheetId: timesheet.id,
              weekNumber: range.weekNumber,
            },
          },
        });
        const weekStatus = existingWeek
          ? existingWeek.status
          : initialWeekStatus(range.startDate, range.endDate, now, settings);
        const submissionDeadline = calculateDeadline(range.endDate, settings);
        const week = await tx.timesheetWeek.upsert({
          where: {
            timesheetId_weekNumber: {
              timesheetId: timesheet.id,
              weekNumber: range.weekNumber,
            },
          },
          create: {
            tenantId: user.tenantId,
            timesheetId: timesheet.id,
            weekNumber: range.weekNumber,
            startDate: range.startDate,
            endDate: range.endDate,
            status: weekStatus,
            submissionDeadline,
            createdById: user.userId,
            updatedById: user.userId,
          },
          update: {
            startDate: range.startDate,
            endDate: range.endDate,
            submissionDeadline,
            updatedById: user.userId,
          },
        });

        for (const date of datesBetween(range.startDate, range.endDate)) {
          const classification = classifyDay({
            date,
            employee: timesheet.employee,
            holiday: holidayByDate.get(dateKey(date)),
            leave: leaveByDate.get(dateKey(date)),
            schedule: workSchedule,
            attendance: attendanceByDate.get(dateKey(date)),
            settings,
            timesheetStatus: timesheet.status,
          });
          const day = await tx.timesheetDay.upsert({
            where: {
              timesheetWeekId_date: {
                timesheetWeekId: week.id,
                date,
              },
            },
            create: {
              tenantId: user.tenantId,
              timesheetWeekId: week.id,
              employeeId: timesheet.employeeId,
              date,
              ...classification,
              createdById: user.userId,
              updatedById: user.userId,
            },
            update: classification.isLocked
              ? { updatedById: user.userId }
              : { ...classification, updatedById: user.userId },
          });
          await tx.timesheetEntry.updateMany({
            where: {
              tenantId: user.tenantId,
              timesheetId: timesheet.id,
              date: { gte: startOfDay(date), lte: endOfDay(date) },
            },
            data: { timesheetDayId: day.id },
          });
          await this.prefillAttendanceIfRequired(
            tx,
            user,
            timesheet,
            day.id,
            date,
            classification,
            settings,
          );
        }
      }
    });

    const calculation = await this.calculationService.recalculate(
      user.tenantId,
      timesheet.id,
    );
    await this.auditService.log({
      tenantId: user.tenantId,
      businessUnitId: timesheet.businessUnitId,
      actorUserId: user.userId,
      action: `TIMESHEET_${reason}`,
      entityType: 'Timesheet',
      entityId: timesheet.id,
      sourceModule: 'timesheets',
      scope: { year: timesheet.year, month: timesheet.month },
      afterSnapshot: {
        weeks: weekRanges.length,
        days: datesBetween(timesheet.periodStart, timesheet.periodEnd).length,
        policyId: policy.effectivePolicy?.id ?? null,
        payrollStatus: calculation.payrollStatus,
      },
    });
    return calculation;
  }

  private async resolveWorkSchedule(input: {
    tenantId: string;
    employeeId: string;
    organizationId: string | null;
    businessUnitId: string | null;
    departmentId: string | null;
    locationId: string | null;
    effectiveDate: Date;
  }) {
    const id = await this.enterpriseConfiguration.resolveWorkScheduleId(input);
    if (!id) return null;
    return this.prisma.workSchedule.findFirst({
      where: { id, tenantId: input.tenantId, isActive: true, status: 'ACTIVE' },
      include: { days: true },
    });
  }

  private async prefillAttendanceIfRequired(
    tx: Prisma.TransactionClient,
    user: Pick<AuthenticatedUser, 'tenantId' | 'userId'>,
    timesheet: { id: string; employeeId: string },
    timesheetDayId: string,
    date: Date,
    classification: ReturnType<typeof classifyDay>,
    settings: Record<string, unknown>,
  ) {
    const mode = stringSetting(
      settings,
      'attendanceIntegrationMode',
      'ATTENDANCE_PREFILL',
    );
    if (
      !['ATTENDANCE_AS_TIMESHEET', 'ATTENDANCE_PREFILL'].includes(mode) ||
      booleanSetting(settings, 'requireProject', true) ||
      Number(classification.attendanceHours) <= 0 ||
      classification.isLocked
    ) {
      return;
    }
    const existing = await tx.timesheetEntry.findMany({
      where: { tenantId: user.tenantId, timesheetDayId },
      orderBy: { createdAt: 'asc' },
    });
    if (
      existing.some(
        (entry) =>
          !(
            [
              TimesheetEntrySource.SYSTEM,
              TimesheetEntrySource.ATTENDANCE,
            ] as TimesheetEntrySource[]
          ).includes(entry.source),
      )
    ) {
      return;
    }
    if (existing.length) {
      await tx.timesheetEntry.update({
        where: { id: existing[0].id },
        data: {
          hours: new Prisma.Decimal(classification.attendanceHours),
          source: TimesheetEntrySource.ATTENDANCE,
          integrationReference: classification.sourceReference,
          updatedById: user.userId,
        },
      });
      return;
    }
    await tx.timesheetEntry.create({
      data: {
        tenantId: user.tenantId,
        timesheetId: timesheet.id,
        timesheetDayId,
        employeeId: timesheet.employeeId,
        date,
        dayOfWeek: weekday(date),
        entryType: 'ON_WORK',
        hours: new Prisma.Decimal(classification.attendanceHours),
        source: TimesheetEntrySource.ATTENDANCE,
        integrationReference: classification.sourceReference,
        isWeekend: classification.isWeekend,
        isHoliday: classification.isHoliday,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
  }
}

function classifyDay(input: {
  date: Date;
  employee: {
    hireDate: Date;
    terminationDate: Date | null;
    status: string;
    isDeleted: boolean;
  };
  holiday?: { id: string; name: string; date: Date };
  leave?: {
    id: string;
    startDate: Date;
    endDate: Date;
    totalDays: Prisma.Decimal;
    leaveType: { id: string; name: string };
  };
  schedule: {
    id: string;
    days: Array<{
      dayOfWeek: WorkWeekday;
      isWorkingDay: boolean;
      expectedHours: Prisma.Decimal | null;
      shiftTemplateId: string | null;
    }>;
  } | null;
  attendance?: {
    attendanceEntryId: string;
    hours: number;
    checkIn: Date | null;
    checkOut: Date | null;
    mode: AttendanceMode;
    status: AttendanceEntryStatus;
    workScheduleId: string | null;
    shiftId: string | null;
  };
  settings: Record<string, unknown>;
  timesheetStatus: TimesheetStatus;
}) {
  const dayOfWeek = weekday(input.date);
  const scheduleDay = input.schedule?.days.find(
    (day) => day.dayOfWeek === dayOfWeek,
  );
  const fallbackWeekend = csvSetting(input.settings, 'weekendDays').includes(
    dayOfWeek,
  );
  const isWeekend = scheduleDay ? !scheduleDay.isWorkingDay : fallbackWeekend;
  const baseExpectedHours = scheduleDay?.isWorkingDay
    ? Number(scheduleDay.expectedHours)
    : isWeekend
      ? 0
      : numberSetting(input.settings, 'defaultWorkHours', 8);
  const outsideEmployment =
    input.date < startOfDay(input.employee.hireDate) ||
    Boolean(
      input.employee.terminationDate &&
      input.date > endOfDay(input.employee.terminationDate),
    );
  const status = input.employee.status.toUpperCase();
  const leaveFraction = input.leave ? leaveFractionForDay(input.leave) : 0;
  const approvedLeaveHours = round(baseExpectedHours * leaveFraction);
  const attendanceHours = round(input.attendance?.hours ?? 0);
  let dayType: TimesheetDayType = TimesheetDayType.WORKING_DAY;
  let dayTypeSource: TimesheetDayTypeSource =
    TimesheetDayTypeSource.WORK_SCHEDULE;
  let isLocked = false;
  let lockReason: string | null = null;
  let expectedHours = baseExpectedHours;

  if (outsideEmployment) {
    dayType = TimesheetDayType.NOT_EMPLOYED;
    dayTypeSource = TimesheetDayTypeSource.EMPLOYMENT;
    expectedHours = 0;
    isLocked = true;
    lockReason = 'Outside employment dates';
  } else if (
    input.employee.isDeleted ||
    ['INACTIVE', 'TERMINATED'].includes(status)
  ) {
    dayType = TimesheetDayType.INACTIVE;
    dayTypeSource = TimesheetDayTypeSource.EMPLOYMENT;
    expectedHours = 0;
    isLocked = true;
    lockReason = 'Employee is inactive';
  } else if (status === 'SUSPENDED') {
    dayType = TimesheetDayType.SUSPENDED;
    dayTypeSource = TimesheetDayTypeSource.EMPLOYMENT;
    expectedHours = 0;
    isLocked = true;
    lockReason = 'Employment is suspended';
  } else if (input.leave && leaveFraction >= 1) {
    dayType = TimesheetDayType.APPROVED_LEAVE;
    dayTypeSource = TimesheetDayTypeSource.LEAVE_REQUEST;
    isLocked = booleanSetting(input.settings, 'lockApprovedLeave', true);
    lockReason = isLocked
      ? `Approved leave: ${input.leave.leaveType.name}`
      : null;
  } else if (input.leave && leaveFraction > 0) {
    dayType = TimesheetDayType.PARTIAL_LEAVE;
    dayTypeSource = TimesheetDayTypeSource.LEAVE_REQUEST;
  } else if (input.holiday) {
    dayType = TimesheetDayType.HOLIDAY;
    dayTypeSource = TimesheetDayTypeSource.HOLIDAY_CALENDAR;
    expectedHours = 0;
    isLocked = !booleanSetting(input.settings, 'allowHolidayWork', false);
    lockReason = isLocked ? `Holiday: ${input.holiday.name}` : null;
  } else if (isWeekend) {
    dayType = TimesheetDayType.WEEKEND;
    dayTypeSource = TimesheetDayTypeSource.WORK_SCHEDULE;
    expectedHours = 0;
    isLocked = !booleanSetting(input.settings, 'allowWeekendWork', false);
    lockReason = isLocked ? 'Weekend work is not permitted' : null;
  } else if (
    !input.schedule &&
    booleanSetting(input.settings, 'requireWorkSchedule', false)
  ) {
    dayType = TimesheetDayType.MISSING_SCHEDULE;
    dayTypeSource = TimesheetDayTypeSource.SYSTEM;
    isLocked =
      stringSetting(input.settings, 'missingScheduleBehavior', 'BLOCK') ===
      'BLOCK';
    lockReason = 'No applicable work schedule';
  }

  if (
    (
      [
        TimesheetStatus.SUBMITTED,
        TimesheetStatus.PENDING_APPROVAL,
        TimesheetStatus.PARTIALLY_APPROVED,
        TimesheetStatus.APPROVED,
        TimesheetStatus.PAYROLL_READY,
        TimesheetStatus.PAYROLL_PROCESSED,
        TimesheetStatus.LOCKED,
      ] as TimesheetStatus[]
    ).includes(input.timesheetStatus)
  ) {
    isLocked = true;
    lockReason = `${input.timesheetStatus.toLowerCase()} timesheet`;
  }
  const availableHours = round(Math.max(0, expectedHours - approvedLeaveHours));
  return {
    dayOfWeek,
    dayType,
    dayTypeSource,
    expectedHours: new Prisma.Decimal(expectedHours),
    availableHours: new Prisma.Decimal(availableHours),
    attendanceHours: new Prisma.Decimal(attendanceHours),
    attendanceEntryId: input.attendance?.attendanceEntryId ?? null,
    attendanceCheckIn: input.attendance?.checkIn ?? null,
    attendanceCheckOut: input.attendance?.checkOut ?? null,
    attendanceMode: input.attendance?.mode ?? null,
    attendanceStatus: input.attendance?.status ?? null,
    approvedLeaveHours: new Prisma.Decimal(approvedLeaveHours),
    holidayId: input.holiday?.id ?? null,
    holidayName: input.holiday?.name ?? null,
    leaveRequestId: input.leave?.id ?? null,
    leaveTypeId: input.leave?.leaveType.id ?? null,
    leaveTypeName: input.leave?.leaveType.name ?? null,
    workScheduleId:
      input.schedule?.id ?? input.attendance?.workScheduleId ?? null,
    shiftId: scheduleDay?.shiftTemplateId ?? input.attendance?.shiftId ?? null,
    isWeekend,
    isHoliday: Boolean(input.holiday),
    isApprovedLeave: Boolean(input.leave),
    isLocked,
    lockReason,
    completionStatus: systemComplete(dayType)
      ? TimesheetCompletionStatus.NOT_REQUIRED
      : TimesheetCompletionStatus.MISSING,
    varianceMinutes: Math.round((0 - attendanceHours) * 60),
    varianceStatus: attendanceHours > 0 ? 'UNALLOCATED' : 'MATCHED',
    sourceReference:
      input.attendance?.attendanceEntryId ??
      input.leave?.id ??
      input.holiday?.id ??
      input.schedule?.id ??
      null,
  };
}

function initialWeekStatus(
  start: Date,
  end: Date,
  now: Date,
  settings: Record<string, unknown>,
) {
  if (end < startOfDay(now)) return TimesheetWeekStatus.INCOMPLETE;
  if (
    start > endOfDay(now) &&
    booleanSetting(settings, 'enableCurrentWeekOnly', true)
  )
    return TimesheetWeekStatus.NOT_AVAILABLE;
  return TimesheetWeekStatus.OPEN;
}

function calculateDeadline(endDate: Date, settings: Record<string, unknown>) {
  const deadlineDay = weekdaySetting(
    settings,
    'weeklySubmissionDeadlineDay',
    WorkWeekday.MONDAY,
  );
  const deadline = endOfDay(endDate);
  for (
    let index = 0;
    index < 7 && weekday(deadline) !== deadlineDay;
    index += 1
  ) {
    deadline.setUTCDate(deadline.getUTCDate() + 1);
  }
  const [hours, minutes] = stringSetting(
    settings,
    'weeklySubmissionDeadlineTime',
    '12:00',
  )
    .split(':')
    .map(Number);
  deadline.setUTCHours(
    Number.isFinite(hours) ? hours : 12,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  deadline.setUTCHours(
    deadline.getUTCHours() +
      numberSetting(settings, 'submissionGracePeriodHours', 0),
  );
  return deadline;
}

function buildWeekRanges(
  periodStart: Date,
  periodEnd: Date,
  startDay: WorkWeekday,
) {
  const ranges: Array<{ weekNumber: number; startDate: Date; endDate: Date }> =
    [];
  let cursor = startOfDay(periodStart);
  let weekNumber = 1;
  while (cursor <= periodEnd) {
    let end = endOfDay(cursor);
    while (weekday(end) !== previousWeekday(startDay) && end < periodEnd) {
      end.setUTCDate(end.getUTCDate() + 1);
    }
    if (end > periodEnd) end = endOfDay(periodEnd);
    ranges.push({ weekNumber, startDate: startOfDay(cursor), endDate: end });
    cursor = startOfDay(end);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    weekNumber += 1;
  }
  return ranges;
}

function previousWeekday(day: WorkWeekday) {
  const values = Object.values(WorkWeekday);
  return values[(values.indexOf(day) + 6) % 7];
}

function buildLeaveMap(
  leaves: Array<{
    id: string;
    startDate: Date;
    endDate: Date;
    totalDays: Prisma.Decimal;
    leaveType: { id: string; name: string };
  }>,
) {
  const map = new Map<string, (typeof leaves)[number]>();
  for (const leave of leaves) {
    for (const date of datesBetween(leave.startDate, leave.endDate)) {
      map.set(dateKey(date), leave);
    }
  }
  return map;
}

function leaveFractionForDay(leave: {
  startDate: Date;
  endDate: Date;
  totalDays: Prisma.Decimal;
}) {
  const calendarDays = datesBetween(leave.startDate, leave.endDate).length;
  return Math.min(1, Number(leave.totalDays) / Math.max(1, calendarDays));
}

function datesBetween(start: Date, end: Date) {
  const dates: Date[] = [];
  const cursor = startOfDay(start);
  const last = endOfDay(end);
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function weekday(date: Date): WorkWeekday {
  return [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
  ][date.getUTCDay()];
}

function systemComplete(dayType: TimesheetDayType) {
  return (
    [
      TimesheetDayType.WEEKEND,
      TimesheetDayType.HOLIDAY,
      TimesheetDayType.APPROVED_LEAVE,
      TimesheetDayType.NOT_EMPLOYED,
      TimesheetDayType.NOT_APPLICABLE,
      TimesheetDayType.EXEMPT,
      TimesheetDayType.SUSPENDED,
      TimesheetDayType.INACTIVE,
    ] as TimesheetDayType[]
  ).includes(dayType);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
function startOfDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
function endOfDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function booleanSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  return typeof settings[key] === 'boolean' ? settings[key] : fallback;
}
function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}
function stringSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  return typeof settings[key] === 'string' ? settings[key] : fallback;
}
function csvSetting(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : [];
}
function weekdaySetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: WorkWeekday,
) {
  const value = stringSetting(settings, key, fallback);
  return Object.values(WorkWeekday).includes(value as WorkWeekday)
    ? (value as WorkWeekday)
    : fallback;
}
