import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TimesheetCompletionStatus,
  TimesheetDayType,
  TimesheetPayrollStatus,
  TimesheetWeekStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';

@Injectable()
export class TimesheetCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: TimesheetPolicyResolverService,
  ) {}

  async recalculate(tenantId: string, timesheetId: string) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, tenantId },
      include: {
        weeks: {
          include: {
            days: {
              include: { entries: true },
              orderBy: { date: 'asc' },
            },
          },
          orderBy: { weekNumber: 'asc' },
        },
      },
    });
    if (!timesheet) throw new NotFoundException('Timesheet was not found.');
    const policy = await this.policyResolver.resolveForEmployee(
      tenantId,
      timesheet.employeeId,
      timesheet.periodStart,
    );
    const settings = policy.values;
    const now = new Date();

    const weeks = timesheet.weeks.map((week) => {
      const days = week.days.map((day) => {
        const enteredHours = roundHours(
          day.entries.reduce((sum, entry) => sum + Number(entry.hours), 0),
        );
        const billableHours = roundHours(
          day.entries.reduce(
            (sum, entry) =>
              sum + (entry.billableFlag ? Number(entry.hours) : 0),
            0,
          ),
        );
        const required = Number(day.availableHours);
        const completionStatus = resolveDayCompletion(
          day.dayType,
          enteredHours,
          required,
        );
        const varianceMinutes = Math.round(
          (enteredHours - Number(day.attendanceHours)) * 60,
        );
        const varianceStatus = resolveVarianceStatus(
          varianceMinutes,
          enteredHours,
          Number(day.attendanceHours),
          numberSetting(settings, 'varianceToleranceMinutes', 15),
          numberSetting(settings, 'varianceTolerancePercent', 5),
        );
        return {
          ...day,
          billableHours,
          completionStatus,
          enteredHours,
          varianceMinutes,
          varianceStatus,
        };
      });
      const requiredHours = sum(days.map((day) => Number(day.expectedHours)));
      const enteredHours = sum(days.map((day) => day.enteredHours));
      const leaveHours = sum(days.map((day) => Number(day.approvedLeaveHours)));
      const holidayHours = sum(
        days.map((day) =>
          day.dayType === TimesheetDayType.HOLIDAY ? day.enteredHours : 0,
        ),
      );
      const weekendHours = sum(
        days.map((day) =>
          day.dayType === TimesheetDayType.WEEKEND ? day.enteredHours : 0,
        ),
      );
      const billableHours = sum(days.map((day) => day.billableHours));
      const nonBillableHours = roundHours(enteredHours - billableHours);
      const overtimeHours = roundHours(
        Math.max(0, enteredHours - requiredHours),
      );
      const blockingDays = days.filter((day) =>
        (
          [
            TimesheetCompletionStatus.MISSING,
            TimesheetCompletionStatus.PARTIAL,
            TimesheetCompletionStatus.EXCEPTION,
          ] as TimesheetCompletionStatus[]
        ).includes(day.completionStatus),
      );
      const status = resolveWeekStatus({
        currentStatus: week.status,
        startDate: week.startDate,
        endDate: week.endDate,
        now,
        blockingDays: blockingDays.length,
      });
      return {
        ...week,
        days,
        status,
        requiredHours,
        enteredHours,
        leaveHours,
        holidayHours,
        weekendHours,
        billableHours,
        nonBillableHours,
        overtimeHours,
      };
    });

    const totals = {
      requiredHours: sum(weeks.map((week) => week.requiredHours)),
      enteredHours: sum(weeks.map((week) => week.enteredHours)),
      approvedLeaveHours: sum(weeks.map((week) => week.leaveHours)),
      holidayHours: sum(weeks.map((week) => week.holidayHours)),
      weekendHours: sum(weeks.map((week) => week.weekendHours)),
      billableHours: sum(weeks.map((week) => week.billableHours)),
      nonBillableHours: sum(weeks.map((week) => week.nonBillableHours)),
      overtimeHours: sum(weeks.map((week) => week.overtimeHours)),
    };
    const completionPercentage =
      totals.requiredHours <= 0
        ? totals.enteredHours > 0 ||
          weeks.some((week) =>
            week.days.some((day) =>
              (
                [
                TimesheetCompletionStatus.MISSING,
                TimesheetCompletionStatus.PARTIAL,
                TimesheetCompletionStatus.EXCEPTION,
                ] as TimesheetCompletionStatus[]
              ).includes(day.completionStatus),
            ),
          )
          ? 0
          : 100
        : Math.min(
            100,
            roundHours(
              ((totals.enteredHours + totals.approvedLeaveHours) /
                totals.requiredHours) *
                100,
            ),
          );
    const payrollStatus = resolvePayrollStatus(settings, weeks);

    await this.prisma.$transaction(async (tx) => {
      for (const week of weeks) {
        for (const day of week.days) {
          await tx.timesheetDay.update({
            where: { id: day.id },
            data: {
              enteredHours: decimal(day.enteredHours),
              completionStatus: day.completionStatus,
              varianceMinutes: day.varianceMinutes,
              varianceStatus: day.varianceStatus,
              version: { increment: 1 },
            },
          });
        }
        await tx.timesheetWeek.update({
          where: { id: week.id },
          data: {
            status: week.status,
            requiredHours: decimal(week.requiredHours),
            enteredHours: decimal(week.enteredHours),
            leaveHours: decimal(week.leaveHours),
            holidayHours: decimal(week.holidayHours),
            weekendHours: decimal(week.weekendHours),
            billableHours: decimal(week.billableHours),
            nonBillableHours: decimal(week.nonBillableHours),
            overtimeHours: decimal(week.overtimeHours),
            payrollEligibility:
              week.status === TimesheetWeekStatus.APPROVED ||
              week.status === TimesheetWeekStatus.PAYROLL_READY,
            version: { increment: 1 },
          },
        });
      }
      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          completionPercentage: decimal(completionPercentage),
          ...Object.fromEntries(
            Object.entries(totals).map(([key, value]) => [key, decimal(value)]),
          ),
          payrollStatus,
          policyId: policy.effectivePolicy?.id ?? null,
          policyVersion: policy.effectivePolicy?.version ?? null,
          policySnapshot: {
            resolvedAt: new Date().toISOString(),
            effectiveAt: policy.effectiveAt,
            effectivePolicy: policy.effectivePolicy,
            appliedPolicyIds: policy.appliedPolicies.map((item) => item.id),
          },
          version: { increment: 1 },
        },
      });
    });

    return {
      completionPercentage,
      payrollStatus,
      totals,
      weeks: weeks.map((week) => ({
        id: week.id,
        status: week.status,
        blockingDays: week.days.filter((day) =>
          (
            [
              TimesheetCompletionStatus.MISSING,
              TimesheetCompletionStatus.PARTIAL,
              TimesheetCompletionStatus.EXCEPTION,
            ] as TimesheetCompletionStatus[]
          ).includes(day.completionStatus),
        ).length,
      })),
    };
  }
}

function resolveDayCompletion(
  dayType: TimesheetDayType,
  enteredHours: number,
  requiredHours: number,
) {
  if (
    (
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
    ).includes(dayType)
  ) {
    return TimesheetCompletionStatus.NOT_REQUIRED;
  }
  if (
    dayType === TimesheetDayType.MISSING_SCHEDULE ||
    dayType === TimesheetDayType.EXCEPTION
  )
    return TimesheetCompletionStatus.EXCEPTION;
  if (requiredHours <= 0)
    return TimesheetCompletionStatus.EXCEPTION;
  if (enteredHours >= requiredHours)
    return TimesheetCompletionStatus.COMPLETE;
  return enteredHours > 0
    ? TimesheetCompletionStatus.PARTIAL
    : TimesheetCompletionStatus.MISSING;
}

function resolveWeekStatus(input: {
  currentStatus: TimesheetWeekStatus;
  startDate: Date;
  endDate: Date;
  now: Date;
  blockingDays: number;
}) {
  if (
    input.currentStatus === TimesheetWeekStatus.NOT_AVAILABLE &&
    input.startDate > startOfToday(input.now)
  ) {
    return TimesheetWeekStatus.NOT_AVAILABLE;
  }
  if (
    (
      [
        TimesheetWeekStatus.SUBMITTED,
        TimesheetWeekStatus.PENDING_APPROVAL,
        TimesheetWeekStatus.PARTIALLY_APPROVED,
        TimesheetWeekStatus.APPROVED,
        TimesheetWeekStatus.REJECTED,
        TimesheetWeekStatus.PAYROLL_READY,
        TimesheetWeekStatus.PAYROLL_PROCESSED,
        TimesheetWeekStatus.LOCKED,
        TimesheetWeekStatus.CANCELLED,
      ] as TimesheetWeekStatus[]
    ).includes(input.currentStatus)
  ) {
    return input.currentStatus;
  }
  if (input.endDate < startOfToday(input.now) && input.blockingDays > 0)
    return TimesheetWeekStatus.OVERDUE;
  if (input.blockingDays > 0) return TimesheetWeekStatus.INCOMPLETE;
  return TimesheetWeekStatus.READY_TO_SUBMIT;
}

function resolvePayrollStatus(
  settings: Record<string, unknown>,
  weeks: Array<{
    status: TimesheetWeekStatus;
    days: Array<{
      varianceStatus: string;
      completionStatus: TimesheetCompletionStatus;
    }>;
  }>,
) {
  const usage = stringSetting(settings, 'payrollUsage', 'NOT_USED');
  if (usage === 'NOT_USED') return TimesheetPayrollStatus.NOT_APPLICABLE;
  const hasBlockingWeek = weeks.some((week) =>
    (
      [
        TimesheetWeekStatus.REJECTED,
        TimesheetWeekStatus.INCOMPLETE,
        TimesheetWeekStatus.OVERDUE,
      ] as TimesheetWeekStatus[]
    ).includes(week.status),
  );
  const approvalRequired = booleanSetting(
    settings,
    'approvedTimesheetsOnly',
    true,
  );
  const hasUnapproved =
    approvalRequired &&
    weeks.some(
      (week) =>
        !(
          [
            TimesheetWeekStatus.APPROVED,
            TimesheetWeekStatus.PAYROLL_READY,
            TimesheetWeekStatus.PAYROLL_PROCESSED,
          ] as TimesheetWeekStatus[]
        ).includes(week.status),
    );
  const hasVariance = weeks.some((week) =>
    week.days.some((day) => day.varianceStatus === 'OUTSIDE_TOLERANCE'),
  );
  const hasException = weeks.some((week) =>
    week.days.some(
      (day) => day.completionStatus === TimesheetCompletionStatus.EXCEPTION,
    ),
  );
  return hasBlockingWeek || hasUnapproved || hasVariance || hasException
    ? TimesheetPayrollStatus.BLOCKED
    : TimesheetPayrollStatus.READY;
}

function resolveVarianceStatus(
  varianceMinutes: number,
  timesheetHours: number,
  attendanceHours: number,
  toleranceMinutes: number,
  tolerancePercent: number,
) {
  if (attendanceHours <= 0)
    return timesheetHours <= 0 ? 'MATCHED' : 'NO_ATTENDANCE';
  const percent =
    Math.abs((timesheetHours - attendanceHours) / attendanceHours) * 100;
  return Math.abs(varianceMinutes) <= toleranceMinutes ||
    percent <= tolerancePercent
    ? 'WITHIN_TOLERANCE'
    : 'OUTSIDE_TOLERANCE';
}

function decimal(value: number) {
  return new Prisma.Decimal(roundHours(value));
}
function roundHours(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
function sum(values: number[]) {
  return roundHours(values.reduce((total, value) => total + value, 0));
}
function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}
function booleanSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  return typeof settings[key] === 'boolean' ? settings[key] : fallback;
}
function stringSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  return typeof settings[key] === 'string' ? settings[key] : fallback;
}
function startOfToday(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
