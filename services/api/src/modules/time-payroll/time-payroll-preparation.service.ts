import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceEntryStatus,
  LeaveRequestStatus,
  OvertimePolicy,
  PayrollExceptionSeverity,
  Prisma,
  TimePayrollInputSourceType,
  TimePayrollInputStatus,
  TimePayrollMode,
  TimesheetStatus,
  WorkWeekday,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OvertimePolicyResolverService } from './overtime-policy-resolver.service';
import { TimePayrollPolicyResolverService } from './time-payroll-policy-resolver.service';

@Injectable()
export class TimePayrollPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly timePolicyResolver: TimePayrollPolicyResolverService,
    private readonly overtimePolicyResolver: OvertimePolicyResolverService,
  ) {}

  async prepareTimeInputsForPayroll(input: {
    tenantId: string;
    employeeId: string;
    payrollPeriodId: string;
    payrollRunEmployeeId?: string | null;
    actorUserId?: string | null;
  }): Promise<PreparedTimePayrollInputs> {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId: input.tenantId, id: input.payrollPeriodId },
      include: { payrollCalendar: true },
    });
    if (!period) throw new NotFoundException('Payroll period was not found.');

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: input.tenantId, id: input.employeeId },
      select: {
        id: true,
        employeeLevelId: true,
        businessUnitId: true,
        countryId: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee was not found.');

    const policy = await this.timePolicyResolver.resolvePolicy({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      employeeLevelId: employee.employeeLevelId,
      businessUnitId: employee.businessUnitId,
      effectiveDate: period.periodEnd,
    });

    if (!policy) {
      return {
        inputs: [],
        policy: null,
        overtimePolicy: null,
        warnings: [
          {
            severity: PayrollExceptionSeverity.WARNING,
            errorType: 'MISSING_TIME_PAYROLL_POLICY',
            message: 'No active time payroll policy matched this employee.',
          },
        ],
      };
    }

    const overtimePolicy = policy.overtimeEnabled
      ? await this.overtimePolicyResolver.resolvePolicy({
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          employeeLevelId: employee.employeeLevelId,
          businessUnitId: employee.businessUnitId,
          effectiveDate: period.periodEnd,
        })
      : null;

    await this.prisma.timePayrollInput.deleteMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        workDate: { gte: period.periodStart, lte: period.periodEnd },
        status: TimePayrollInputStatus.PREPARED,
        payrollRunEmployeeId: null,
      },
    });

    const warnings: PreparedTimePayrollWarning[] = [];
    const useAttendance = shouldUseAttendance(policy.mode);
    const useTimesheet = shouldUseTimesheet(policy.mode);
    const attendanceEntries = useAttendance
      ? await this.loadAttendanceEntries(input.tenantId, input.employeeId, period.periodStart, period.periodEnd)
      : [];
    const timesheetEntries = useTimesheet
      ? await this.loadTimesheetEntries(input.tenantId, input.employeeId, period.periodStart, period.periodEnd, policy.requireTimesheetApproval)
      : [];

    if (policy.requireAttendanceApproval && useAttendance) {
      warnings.push({
        severity: PayrollExceptionSeverity.WARNING,
        errorType: 'ATTENDANCE_APPROVAL_UNAVAILABLE',
        message: 'Attendance approval is required by policy, but attendance approval state is not available on attendance entries.',
      });
    }

    const sourceRows =
      policy.mode === TimePayrollMode.TIMESHEET_ONLY ||
      (policy.mode === TimePayrollMode.ATTENDANCE_TO_TIMESHEET && timesheetEntries.length)
        ? buildTimesheetRows(timesheetEntries)
        : buildAttendanceRows(attendanceEntries);

    const data: Prisma.TimePayrollInputCreateManyInput[] = [];
    for (const row of sourceRows) {
      data.push({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        payrollRunEmployeeId: input.payrollRunEmployeeId ?? null,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        workDate: row.workDate,
        regularHours: row.regularHours,
        overtimeHours: new Prisma.Decimal(0),
        absenceDays: new Prisma.Decimal(0),
        status: input.payrollRunEmployeeId
          ? TimePayrollInputStatus.INCLUDED_IN_PAYROLL
          : TimePayrollInputStatus.PREPARED,
        metadata: row.metadata,
      });

      if (policy.overtimeEnabled) {
        const overtime = calculateOvertime(row.regularHours, policy.standardHoursPerDay, overtimePolicy);
        if (overtime.gt(0)) {
          data.push({
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            payrollRunEmployeeId: input.payrollRunEmployeeId ?? null,
            sourceType: TimePayrollInputSourceType.OVERTIME,
            sourceId: row.sourceId,
            workDate: row.workDate,
            regularHours: new Prisma.Decimal(0),
            overtimeHours: overtime,
            absenceDays: new Prisma.Decimal(0),
            status: input.payrollRunEmployeeId
              ? TimePayrollInputStatus.INCLUDED_IN_PAYROLL
              : TimePayrollInputStatus.PREPARED,
            metadata: {
              sourceType: row.sourceType,
              overtimePolicyId: overtimePolicy?.id ?? null,
              rateMultiplier: overtimePolicy?.rateMultiplier.toString() ?? '1',
            },
          });
        }
      }
    }

    if (policy.detectNoShow) {
      const noShowRows = await this.buildNoShowRows({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        coveredDates: new Set(sourceRows.map((row) => dateKey(row.workDate))),
      });
      if (noShowRows.warning) warnings.push(noShowRows.warning);
      data.push(...noShowRows.rows.map((workDate) => ({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        payrollRunEmployeeId: input.payrollRunEmployeeId ?? null,
        sourceType: TimePayrollInputSourceType.NO_SHOW,
        sourceId: null,
        workDate,
        regularHours: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        absenceDays: new Prisma.Decimal(1),
        status: input.payrollRunEmployeeId
          ? TimePayrollInputStatus.INCLUDED_IN_PAYROLL
          : TimePayrollInputStatus.PREPARED,
        metadata: { deductNoShow: policy.deductNoShow },
      })));
    }

    if (data.length) {
      await this.prisma.timePayrollInput.createMany({ data });
    }

    const inputs = await this.prisma.timePayrollInput.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        workDate: { gte: period.periodStart, lte: period.periodEnd },
        ...(input.payrollRunEmployeeId
          ? { payrollRunEmployeeId: input.payrollRunEmployeeId }
          : { payrollRunEmployeeId: null, status: TimePayrollInputStatus.PREPARED }),
      },
      orderBy: [{ workDate: 'asc' }, { sourceType: 'asc' }],
    });

    if (input.actorUserId) {
      await this.auditService.log({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'TIME_PAYROLL_INPUTS_PREPARED',
        entityType: 'TimePayrollInput',
        entityId: input.employeeId,
        beforeSnapshot: null,
        afterSnapshot: { payrollPeriodId: input.payrollPeriodId, count: inputs.length },
      });
    }

    return { inputs, policy, overtimePolicy, warnings };
  }

  async prepareRun(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId: user.tenantId, id: runId },
      include: {
        payrollPeriod: { include: { payrollCalendar: true } },
        employees: { select: { id: true, employeeId: true } },
      },
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');

    const employees = run.employees.length
      ? run.employees.map((employee) => ({
          employeeId: employee.employeeId,
          payrollRunEmployeeId: employee.id,
        }))
      : await this.prisma.employee.findMany({
          where: {
            tenantId: user.tenantId,
            isDraftProfile: false,
            ...(run.payrollPeriod.payrollCalendar.businessUnitId
              ? { businessUnitId: run.payrollPeriod.payrollCalendar.businessUnitId }
              : {}),
          },
          select: { id: true },
        }).then((items) => items.map((item) => ({ employeeId: item.id, payrollRunEmployeeId: null })));

    let preparedCount = 0;
    for (const employee of employees) {
      const result = await this.prepareTimeInputsForPayroll({
        tenantId: user.tenantId,
        employeeId: employee.employeeId,
        payrollPeriodId: run.payrollPeriodId,
        payrollRunEmployeeId: employee.payrollRunEmployeeId,
        actorUserId: user.userId,
      });
      preparedCount += result.inputs.length;
    }

    return { payrollRunId: runId, preparedCount };
  }

  async listRunInputs(user: AuthenticatedUser, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId: user.tenantId, id: runId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    return this.prisma.timePayrollInput.findMany({
      where: {
        tenantId: user.tenantId,
        payrollRunEmployee: { payrollRunId: runId },
      },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ workDate: 'asc' }, { sourceType: 'asc' }],
    });
  }

  private loadAttendanceEntries(
    tenantId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.prisma.attendanceEntry.findMany({
      where: {
        tenantId,
        employeeId,
        date: { gte: periodStart, lte: periodEnd },
        status: {
          in: [
            AttendanceEntryStatus.PRESENT,
            AttendanceEntryStatus.LATE,
            AttendanceEntryStatus.HALF_DAY,
            AttendanceEntryStatus.MISSED_CHECK_OUT,
          ],
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async loadTimesheetEntries(
    tenantId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    requireApproval: boolean,
  ) {
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId,
        employeeId,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
        ...(requireApproval ? { status: TimesheetStatus.APPROVED } : {}),
      },
      select: { id: true },
    });
    if (!timesheets.length) return [];
    return this.prisma.timesheetEntry.findMany({
      where: {
        tenantId,
        employeeId,
        timesheetId: { in: timesheets.map((timesheet) => timesheet.id) },
        date: { gte: periodStart, lte: periodEnd },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async buildNoShowRows(input: {
    tenantId: string;
    employeeId: string;
    periodStart: Date;
    periodEnd: Date;
    coveredDates: Set<string>;
  }) {
    const schedules = await this.prisma.workSchedule.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      take: 1,
    });
    const schedule = schedules[0];
    if (!schedule?.weeklyWorkDays.length) {
      return {
        rows: [] as Date[],
        warning: {
          severity: PayrollExceptionSeverity.WARNING,
          errorType: 'WORK_SCHEDULE_UNAVAILABLE',
          message: 'No active work schedule was found; no-show detection was skipped.',
        },
      };
    }

    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: input.periodEnd },
        endDate: { gte: input.periodStart },
      },
      select: { startDate: true, endDate: true },
    });
    const leaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      for (const date of eachDate(leave.startDate, leave.endDate)) {
        leaveDates.add(dateKey(date));
      }
    }

    const rows: Date[] = [];
    for (const date of eachDate(input.periodStart, input.periodEnd)) {
      const key = dateKey(date);
      if (!schedule.weeklyWorkDays.includes(toWeekday(date))) continue;
      if (input.coveredDates.has(key) || leaveDates.has(key)) continue;
      rows.push(date);
    }

    return { rows, warning: null };
  }
}

export type PreparedTimePayrollInputs = {
  inputs: TimePayrollInputPayload[];
  policy: TimePayrollPolicyPayload | null;
  overtimePolicy: OvertimePolicy | null;
  warnings: PreparedTimePayrollWarning[];
};

type TimePayrollInputPayload = Prisma.TimePayrollInputGetPayload<Record<string, never>>;
type TimePayrollPolicyPayload = Prisma.TimePayrollPolicyGetPayload<Record<string, never>>;

export type PreparedTimePayrollWarning = {
  severity: PayrollExceptionSeverity;
  errorType: string;
  message: string;
};

function shouldUseAttendance(mode: TimePayrollMode) {
  return mode !== TimePayrollMode.TIMESHEET_ONLY;
}

function shouldUseTimesheet(mode: TimePayrollMode) {
  return mode !== TimePayrollMode.ATTENDANCE_ONLY;
}

type AttendanceEntryPayload = Prisma.AttendanceEntryGetPayload<Record<string, never>>;
type TimesheetEntryPayload = Prisma.TimesheetEntryGetPayload<Record<string, never>>;

function buildAttendanceRows(entries: AttendanceEntryPayload[]) {
  return entries.map((entry) => {
    const regularHours = entry.checkIn && entry.checkOut
      ? new Prisma.Decimal(Math.max(0, entry.checkOut.getTime() - entry.checkIn.getTime())).div(3_600_000)
      : entry.status === AttendanceEntryStatus.HALF_DAY
        ? new Prisma.Decimal(4)
        : new Prisma.Decimal(0);
    return {
      sourceType: TimePayrollInputSourceType.ATTENDANCE,
      sourceId: entry.id,
      workDate: entry.date,
      regularHours,
      metadata: { attendanceStatus: entry.status },
    };
  });
}

function buildTimesheetRows(entries: TimesheetEntryPayload[]) {
  return entries.map((entry) => ({
    sourceType: TimePayrollInputSourceType.TIMESHEET,
    sourceId: entry.id,
    workDate: entry.date,
    regularHours: entry.hours,
    metadata: { entryType: entry.entryType, projectId: entry.projectId },
  }));
}

function calculateOvertime(
  regularHours: Prisma.Decimal,
  standardHoursPerDay: Prisma.Decimal,
  overtimePolicy: OvertimePolicy | null,
) {
  const threshold = overtimePolicy?.thresholdHours ?? standardHoursPerDay;
  return regularHours.gt(threshold) ? regularHours.minus(threshold) : new Prisma.Decimal(0);
}

function eachDate(startDate: Date, endDate: Date) {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toWeekday(date: Date): WorkWeekday {
  const days: WorkWeekday[] = [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
  ];
  return days[date.getUTCDay()];
}
