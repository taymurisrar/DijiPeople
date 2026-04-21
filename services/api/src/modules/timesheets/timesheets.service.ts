import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TimesheetEntryType,
  TimesheetStatus,
  WorkWeekday,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { GetMonthlyTimesheetDto } from './dto/get-monthly-timesheet.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { SubmitTimesheetDto } from './dto/submit-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { UpsertTimesheetEntriesDto } from './dto/upsert-timesheet-entries.dto';
import { TimesheetWithRelations, TimesheetsRepository } from './timesheets.repository';

type TimesheetSettings = {
  weekendDays: WorkWeekday[];
  defaultWorkHours: number;
  allowWeekendWork: boolean;
  allowHolidayWork: boolean;
  requireMonthlySubmission: boolean;
  autoFillWorkingDays: boolean;
  requireSubmissionNote: boolean;
};

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly timesheetsRepository: TimesheetsRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
  ) {}

  async getMyMonthlyTimesheet(
    currentUser: AuthenticatedUser,
    query: GetMonthlyTimesheetDto,
  ) {
    const employee = await this.getCurrentEmployee(currentUser);
    const { year, month } = resolveTargetMonth(query.year, query.month);
    const timesheet = await this.getOrCreateMonthlyTimesheet(
      currentUser,
      employee.id,
      year,
      month,
    );

    return this.mapTimesheet(timesheet, currentUser);
  }

  async listMine(currentUser: AuthenticatedUser, query: TimesheetQueryDto) {
    const employee = await this.getCurrentEmployee(currentUser);
    const result = await this.timesheetsRepository.findTimesheetsByEmployee(
      currentUser.tenantId,
      employee.id,
      query,
    );

    return this.mapTimesheetList(result.items, result.total, query, 'mine');
  }

  async listTeam(currentUser: AuthenticatedUser, query: TimesheetQueryDto) {
    const canApproveAll =
      currentUser.permissionKeys.includes('timesheets.approve') &&
      currentUser.permissionKeys.includes('timesheets.read') &&
      currentUser.permissionKeys.includes('attendance.manage');

    const employeeIds = canApproveAll
      ? await this.resolveAllTenantEmployeeIds(currentUser.tenantId)
      : await this.resolveDirectReportIds(currentUser);

    const result = await this.timesheetsRepository.findTeamTimesheets(
      currentUser.tenantId,
      employeeIds,
      query,
    );

    return this.mapTimesheetList(
      result.items,
      result.total,
      query,
      canApproveAll ? 'tenant' : 'team',
    );
  }

  async getTeamTimesheetById(currentUser: AuthenticatedUser, timesheetId: string) {
    const timesheet = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!timesheet) {
      throw new NotFoundException('Timesheet was not found for this tenant.');
    }

    await this.assertCanReadTeamTimesheet(currentUser, timesheet);
    return this.mapTimesheet(timesheet, currentUser);
  }

  async updateEntries(
    currentUser: AuthenticatedUser,
    timesheetId: string,
    dto: UpsertTimesheetEntriesDto,
  ) {
    const timesheet = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!timesheet) {
      throw new NotFoundException('Timesheet was not found for this tenant.');
    }

    if (timesheet.employee.userId !== currentUser.userId) {
      throw new ForbiddenException('You can only edit your own timesheets.');
    }

    this.assertTimesheetEditable(timesheet);

    const settings = await this.getTimesheetSettings(currentUser.tenantId);
    const periodStart = toStartOfDay(timesheet.periodStart);
    const periodEnd = toStartOfDay(timesheet.periodEnd);
    const approvedLeaves = await this.timesheetsRepository.findApprovedLeaveRequestsForMonth(
      currentUser.tenantId,
      timesheet.employeeId,
      periodStart,
      periodEnd,
    );
    const holidayMap = new Map(
      (
        await this.timesheetsRepository.findHolidaysForMonth(
          currentUser.tenantId,
          periodStart,
          periodEnd,
        )
      ).map((holiday) => [toDateKey(holiday.date), holiday]),
    );
    const leaveMap = buildLeaveMap(approvedLeaves);
    const entryMap = new Map(timesheet.entries.map((entry) => [toDateKey(entry.date), entry]));

    for (const incoming of dto.entries) {
      const date = toStartOfDay(new Date(incoming.date));
      if (date < periodStart || date > periodEnd) {
        throw new BadRequestException('Entries must stay within the selected month.');
      }

      const dateKey = toDateKey(date);
      const currentEntry = entryMap.get(dateKey);

      if (!currentEntry) {
        throw new NotFoundException(`Timesheet day ${dateKey} was not generated.`);
      }

      const dayOfWeek = getWorkWeekday(date);
      const isWeekend = settings.weekendDays.includes(dayOfWeek);
      const holiday = holidayMap.get(dateKey) ?? null;
      const isHoliday = Boolean(holiday);
      const approvedLeave = leaveMap.get(dateKey) ?? null;

      const nextEntryType = this.resolveEntryTypeForUpdate(
        incoming.entryType,
        currentEntry.entryType,
        isWeekend,
        isHoliday,
        settings,
      );
      const resolvedLeaveRequestId =
        nextEntryType === TimesheetEntryType.ON_LEAVE
          ? incoming.leaveRequestId ?? approvedLeave?.id ?? null
          : null;

      if (
        nextEntryType === TimesheetEntryType.ON_LEAVE &&
        incoming.leaveRequestId &&
        incoming.leaveRequestId !== approvedLeave?.id
      ) {
        throw new BadRequestException(
          `Selected leave record is not valid for ${dateKey}.`,
        );
      }

      const hours = resolveHoursWorked(
        nextEntryType,
        incoming.hoursWorked,
        settings.defaultWorkHours,
      );

      await this.timesheetsRepository.updateTimesheetEntry(currentUser.tenantId, currentEntry.id, {
        dayOfWeek,
        entryType: nextEntryType,
        isWeekend,
        isHoliday,
        leaveRequestId: resolvedLeaveRequestId,
        hours: new Prisma.Decimal(hours),
        note: incoming.note?.trim() ?? null,
        description: null,
        projectId: null,
        updatedById: currentUser.userId,
      });
    }

    const updated = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!updated) {
      throw new NotFoundException('Timesheet could not be reloaded.');
    }

    return this.mapTimesheet(updated, currentUser);
  }

  async submitTimesheet(
    currentUser: AuthenticatedUser,
    timesheetId: string,
    dto: SubmitTimesheetDto,
  ) {
    const timesheet = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!timesheet) {
      throw new NotFoundException('Timesheet was not found for this tenant.');
    }

    if (timesheet.employee.userId !== currentUser.userId) {
      throw new ForbiddenException('You can only submit your own timesheets.');
    }

    this.assertTimesheetEditable(timesheet);

    const settings = await this.getTimesheetSettings(currentUser.tenantId);

    if (!settings.requireMonthlySubmission) {
      throw new BadRequestException(
        'Monthly timesheet submission is currently disabled by tenant settings.',
      );
    }

    if (settings.requireSubmissionNote && !dto.submittedNote?.trim()) {
      throw new BadRequestException(
        'A submission note is required by tenant timesheet settings.',
      );
    }

    const validation = validateTimesheetForSubmission(timesheet.entries);
    if (!validation.isValid) {
      throw new BadRequestException({
        message:
          'Complete all required weekday entries before submitting this timesheet.',
        missingDates: validation.missingDates,
      });
    }

    const approverUserId = timesheet.employee.manager?.userId ?? null;
    if (!approverUserId) {
      throw new BadRequestException(
        'A reporting manager must be assigned before the timesheet can be submitted.',
      );
    }

    const updated = await this.timesheetsRepository.updateTimesheet(
      currentUser.tenantId,
      timesheet.id,
      {
        status: TimesheetStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedNote: dto.submittedNote?.trim() ?? null,
        approverUserId,
        reviewNote: null,
        comments: null,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,
        updatedById: currentUser.userId,
      },
    );

    return this.mapTimesheet(updated, currentUser);
  }

  async approveTimesheet(
    currentUser: AuthenticatedUser,
    timesheetId: string,
    dto: ReviewTimesheetDto,
  ) {
    return this.reviewTimesheet(
      currentUser,
      timesheetId,
      TimesheetStatus.APPROVED,
      dto,
    );
  }

  async rejectTimesheet(
    currentUser: AuthenticatedUser,
    timesheetId: string,
    dto: ReviewTimesheetDto,
  ) {
    return this.reviewTimesheet(
      currentUser,
      timesheetId,
      TimesheetStatus.REJECTED,
      dto,
    );
  }

  async exportTimesheet(currentUser: AuthenticatedUser, timesheetId: string) {
    const timesheet = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!timesheet) {
      throw new NotFoundException('Timesheet was not found for this tenant.');
    }

    await this.assertCanReadTeamTimesheet(currentUser, timesheet, true);

    const summary = summarizeEntries(timesheet.entries);
    const rows = [
      ['Employee', timesheet.employee.firstName + ' ' + timesheet.employee.lastName],
      ['Employee Code', timesheet.employee.employeeCode],
      ['Month', `${monthName(timesheet.month)} ${timesheet.year}`],
      ['Status', timesheet.status],
      ['Submitted Note', timesheet.submittedNote ?? ''],
      ['Review Note', timesheet.reviewNote ?? ''],
      [],
      ['Date', 'Day', 'Entry Type', 'Hours Worked', 'Weekend', 'Holiday', 'Leave', 'Note'],
      ...timesheet.entries.map((entry) => [
        toDateKey(entry.date),
        entry.dayOfWeek,
        entry.entryType ?? '',
        Number(entry.hours).toString(),
        entry.isWeekend ? 'Yes' : 'No',
        entry.isHoliday ? 'Yes' : 'No',
        entry.leaveRequest?.leaveType?.name ?? '',
        entry.note ?? '',
      ]),
      [],
      ['Total Working Days', summary.totalWorkDays.toString()],
      ['Total Leave Days', summary.totalLeaveDays.toString()],
      ['Total Weekends', summary.totalWeekendDays.toString()],
      ['Total Holidays', summary.totalHolidayDays.toString()],
      ['Total Hours', summary.totalHours.toFixed(2)],
    ];

    return {
      fileName: `timesheet-${timesheet.employee.employeeCode}-${timesheet.year}-${String(timesheet.month).padStart(2, '0')}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: rows.map(toCsvLine).join('\n'),
    };
  }

  private async reviewTimesheet(
    currentUser: AuthenticatedUser,
    timesheetId: string,
    nextStatus: 'APPROVED' | 'REJECTED',
    dto: ReviewTimesheetDto,
  ) {
    const timesheet = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheetId,
    );

    if (!timesheet) {
      throw new NotFoundException('Timesheet was not found for this tenant.');
    }

    if (timesheet.status !== TimesheetStatus.SUBMITTED) {
      throw new ConflictException('Only submitted timesheets can be reviewed.');
    }

    await this.assertCanApprove(currentUser, timesheet);

    const updated = await this.timesheetsRepository.updateTimesheet(
      currentUser.tenantId,
      timesheet.id,
      {
        status: nextStatus,
        approverUserId: currentUser.userId,
        reviewedAt: new Date(),
        approvedAt: nextStatus === TimesheetStatus.APPROVED ? new Date() : null,
        rejectedAt: nextStatus === TimesheetStatus.REJECTED ? new Date() : null,
        reviewNote: dto.reviewNote?.trim() ?? null,
        comments: dto.reviewNote?.trim() ?? null,
        updatedById: currentUser.userId,
      },
    );

    return this.mapTimesheet(updated, currentUser);
  }

  private async getOrCreateMonthlyTimesheet(
    currentUser: AuthenticatedUser,
    employeeId: string,
    year: number,
    month: number,
  ) {
    const existing = await this.timesheetsRepository.findMonthlyTimesheet(
      currentUser.tenantId,
      employeeId,
      year,
      month,
    );

    if (existing) {
      return this.ensureMonthlyEntries(currentUser, existing);
    }

    const { periodStart, periodEnd } = getMonthRange(year, month);
    const created = await this.timesheetsRepository.createTimesheet({
      tenantId: currentUser.tenantId,
      employeeId,
      year,
      month,
      periodStart,
      periodEnd,
      status: TimesheetStatus.DRAFT,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    return this.ensureMonthlyEntries(currentUser, created);
  }

  private async ensureMonthlyEntries(
    currentUser: AuthenticatedUser,
    timesheet: TimesheetWithRelations,
  ) {
    const settings = await this.getTimesheetSettings(currentUser.tenantId);
    const holidayMap = new Map(
      (
        await this.timesheetsRepository.findHolidaysForMonth(
          currentUser.tenantId,
          timesheet.periodStart,
          timesheet.periodEnd,
        )
      ).map((holiday) => [toDateKey(holiday.date), holiday]),
    );
    const leaveMap = buildLeaveMap(
      await this.timesheetsRepository.findApprovedLeaveRequestsForMonth(
        currentUser.tenantId,
        timesheet.employeeId,
        timesheet.periodStart,
        timesheet.periodEnd,
      ),
    );

    const existingKeys = new Set(timesheet.entries.map((entry) => toDateKey(entry.date)));
    const dates = getDatesInRange(timesheet.periodStart, timesheet.periodEnd);
    for (const date of dates) {
      const dateKey = toDateKey(date);
      if (existingKeys.has(dateKey)) {
        continue;
      }

      const dayOfWeek = getWorkWeekday(date);
      const isWeekend = settings.weekendDays.includes(dayOfWeek);
      const holiday = holidayMap.get(dateKey);
      const leave = leaveMap.get(dateKey);
      const entryType = leave
        ? TimesheetEntryType.ON_LEAVE
        : holiday
          ? TimesheetEntryType.HOLIDAY
          : isWeekend
            ? TimesheetEntryType.WEEKEND
            : settings.autoFillWorkingDays
              ? TimesheetEntryType.ON_WORK
              : null;
      const hours = resolveDefaultHours(entryType, settings.defaultWorkHours);

      await this.timesheetsRepository.createTimesheetEntry({
        tenantId: currentUser.tenantId,
        timesheetId: timesheet.id,
        employeeId: timesheet.employeeId,
        date,
        dayOfWeek,
        entryType,
        isWeekend,
        isHoliday: Boolean(holiday),
        leaveRequestId: leave?.id ?? null,
        hours: new Prisma.Decimal(hours),
        note: null,
        description: null,
        projectId: null,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    }

    const reloaded = await this.timesheetsRepository.findTimesheetById(
      currentUser.tenantId,
      timesheet.id,
    );

    if (!reloaded) {
      throw new NotFoundException('Timesheet could not be reloaded.');
    }

    return reloaded;
  }

  private async getCurrentEmployee(currentUser: AuthenticatedUser) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    return employee;
  }

  private async assertCanReadTeamTimesheet(
    currentUser: AuthenticatedUser,
    timesheet: TimesheetWithRelations,
    allowOwn = false,
  ) {
    if (allowOwn && timesheet.employee.userId === currentUser.userId) {
      return;
    }

    if (!currentUser.permissionKeys.includes('timesheets.read')) {
      throw new ForbiddenException('You are not allowed to read timesheets.');
    }

    if (currentUser.permissionKeys.includes('attendance.manage')) {
      return;
    }

    const managerUserId = timesheet.employee.manager?.userId;
    if (!managerUserId || managerUserId !== currentUser.userId) {
      throw new ForbiddenException(
        'You can only view timesheets for your direct reports.',
      );
    }
  }

  private assertTimesheetEditable(timesheet: TimesheetWithRelations) {
    if (
      timesheet.status === TimesheetStatus.SUBMITTED ||
      timesheet.status === TimesheetStatus.APPROVED
    ) {
      throw new ConflictException('Submitted or approved timesheets cannot be edited.');
    }
  }

  private async assertCanApprove(
    currentUser: AuthenticatedUser,
    timesheet: TimesheetWithRelations,
  ) {
    if (!currentUser.permissionKeys.includes('timesheets.approve')) {
      throw new ForbiddenException('You are not allowed to approve timesheets.');
    }

    if (currentUser.permissionKeys.includes('attendance.manage')) {
      return;
    }

    const managerUserId = timesheet.employee.manager?.userId;
    if (!managerUserId || managerUserId !== currentUser.userId) {
      throw new ForbiddenException(
        'You can only approve timesheets for your direct reports.',
      );
    }
  }

  private async resolveAllTenantEmployeeIds(tenantId: string) {
    const employees = await this.employeesRepository.findByTenant(tenantId, {
      page: 1,
      pageSize: 1000,
      search: undefined,
      employmentStatus: undefined,
      reportingManagerEmployeeId: undefined,
    });

    return employees.items.map((employee) => employee.id);
  }

  private async resolveDirectReportIds(currentUser: AuthenticatedUser) {
    const currentEmployee = await this.getCurrentEmployee(currentUser);
    const directReports = await this.employeesRepository.findDirectReports(
      currentUser.tenantId,
      currentEmployee.id,
    );

    return directReports.map((employee) => employee.id);
  }

  private async getTimesheetSettings(tenantId: string): Promise<TimesheetSettings> {
    const settings = await this.tenantSettingsResolverService.getTimesheetSettings(
      tenantId,
    );

    return {
      weekendDays: settings.weekendDays,
      defaultWorkHours: settings.defaultWorkHours,
      allowWeekendWork: settings.allowWeekendWork,
      allowHolidayWork: settings.allowHolidayWork,
      requireMonthlySubmission: settings.requireMonthlySubmission,
      autoFillWorkingDays: settings.autoFillWorkingDays,
      requireSubmissionNote: settings.requireSubmissionNote,
    };
  }

  private resolveEntryTypeForUpdate(
    requestedEntryType: TimesheetEntryType | undefined,
    currentEntryType: TimesheetEntryType | null,
    isWeekend: boolean,
    isHoliday: boolean,
    settings: TimesheetSettings,
  ) {
    if (requestedEntryType === undefined) {
      return currentEntryType;
    }

    if (requestedEntryType === TimesheetEntryType.WEEKEND) {
      return isWeekend ? TimesheetEntryType.WEEKEND : currentEntryType;
    }

    if (requestedEntryType === TimesheetEntryType.HOLIDAY) {
      return isHoliday ? TimesheetEntryType.HOLIDAY : currentEntryType;
    }

    if (requestedEntryType === TimesheetEntryType.ON_WORK) {
      if (isWeekend && !settings.allowWeekendWork) {
        throw new BadRequestException(
          'Weekend work is not enabled for this tenant.',
        );
      }

      if (isHoliday && !settings.allowHolidayWork) {
        throw new BadRequestException(
          'Holiday work is not enabled for this tenant.',
        );
      }

      return TimesheetEntryType.ON_WORK;
    }

    if (requestedEntryType === TimesheetEntryType.ON_LEAVE) {
      if (isWeekend || isHoliday) {
        throw new BadRequestException(
          'Weekend or holiday rows can only stay system-driven or be overridden to On Work.',
        );
      }

      return TimesheetEntryType.ON_LEAVE;
    }

    return requestedEntryType;
  }

  private mapTimesheetList(
    items: TimesheetWithRelations[],
    total: number,
    query: TimesheetQueryDto,
    scope: 'mine' | 'team' | 'tenant',
  ) {
    return {
      items: items.map((item) => this.mapTimesheet(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        year: query.year ?? null,
        month: query.month ?? null,
        employeeId: query.employeeId ?? null,
        status: query.status ?? null,
        scope,
      },
    };
  }

  private mapTimesheet(timesheet: TimesheetWithRelations, currentUser?: AuthenticatedUser) {
    const summary = summarizeEntries(timesheet.entries);

    const canCurrentUserSubmit =
      currentUser !== undefined &&
      timesheet.employee.userId === currentUser.userId &&
      currentUser.permissionKeys.includes('timesheets.submit') &&
      timesheet.status !== TimesheetStatus.SUBMITTED &&
      timesheet.status !== TimesheetStatus.APPROVED &&
      summary.incompleteDays.length === 0;

    const canCurrentUserApprove =
      currentUser !== undefined &&
      currentUser.permissionKeys.includes('timesheets.approve') &&
      timesheet.status === TimesheetStatus.SUBMITTED &&
      (currentUser.permissionKeys.includes('attendance.manage') ||
        timesheet.employee.manager?.userId === currentUser.userId);

    return {
      id: timesheet.id,
      tenantId: timesheet.tenantId,
      employeeId: timesheet.employeeId,
      year: timesheet.year,
      month: timesheet.month,
      periodStart: timesheet.periodStart,
      periodEnd: timesheet.periodEnd,
      status: timesheet.status,
      submittedAt: timesheet.submittedAt,
      approvedAt: timesheet.approvedAt,
      rejectedAt: timesheet.rejectedAt,
      reviewedAt: timesheet.reviewedAt,
      submittedNote: timesheet.submittedNote,
      reviewNote: timesheet.reviewNote ?? timesheet.comments,
      comments: timesheet.comments,
      createdAt: timesheet.createdAt,
      updatedAt: timesheet.updatedAt,
      totalHours: summary.totalHours,
      summary,
      employee: {
        id: timesheet.employee.id,
        employeeCode: timesheet.employee.employeeCode,
        firstName: timesheet.employee.firstName,
        lastName: timesheet.employee.lastName,
        preferredName: timesheet.employee.preferredName,
        fullName: `${timesheet.employee.firstName} ${timesheet.employee.lastName}`,
        reportingManager: timesheet.employee.manager
          ? {
              id: timesheet.employee.manager.id,
              employeeCode: timesheet.employee.manager.employeeCode,
              firstName: timesheet.employee.manager.firstName,
              lastName: timesheet.employee.manager.lastName,
            }
          : null,
      },
      approverUser: timesheet.approverUser,
      entries: timesheet.entries.map((entry) => ({
        id: entry.id,
        employeeId: entry.employeeId,
        date: entry.date,
        dayOfWeek: entry.dayOfWeek,
        entryType: entry.entryType,
        isWeekend: entry.isWeekend,
        isHoliday: entry.isHoliday,
        hoursWorked: Number(entry.hours),
        note: entry.note ?? entry.description,
        leaveRequestId: entry.leaveRequestId,
        leaveRequest: entry.leaveRequest
          ? {
              id: entry.leaveRequest.id,
              status: entry.leaveRequest.status,
              leaveType: entry.leaveRequest.leaveType,
            }
          : null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
      canCurrentUserSubmit,
      canCurrentUserApprove,
      canCurrentUserEdit:
        currentUser !== undefined &&
        timesheet.employee.userId === currentUser.userId &&
        timesheet.status !== TimesheetStatus.SUBMITTED &&
        timesheet.status !== TimesheetStatus.APPROVED,
    };
  }
}

function resolveTargetMonth(year?: number, month?: number) {
  const now = new Date();
  return {
    year: year ?? now.getFullYear(),
    month: month ?? now.getMonth() + 1,
  };
}

function getMonthRange(year: number, month: number) {
  const periodStart = new Date(year, month - 1, 1);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(year, month, 0);
  periodEnd.setHours(0, 0, 0, 0);
  return { periodStart, periodEnd };
}

function toStartOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function toDateKey(date: Date) {
  return toStartOfDay(date).toISOString().slice(0, 10);
}

function getDatesInRange(start: Date, end: Date) {
  const dates: Date[] = [];
  const cursor = toStartOfDay(start);
  const endDate = toStartOfDay(end);
  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getWorkWeekday(date: Date): WorkWeekday {
  const day = date.getDay();
  return [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
  ][day];
}

function buildLeaveMap(
  leaveRequests: Array<{
    id: string;
    startDate: Date;
    endDate: Date;
    leaveType: { id: string; name: string };
  }>,
) {
  const map = new Map<string, (typeof leaveRequests)[number]>();

  for (const leave of leaveRequests) {
    const dates = getDatesInRange(leave.startDate, leave.endDate);
    for (const date of dates) {
      map.set(toDateKey(date), leave);
    }
  }

  return map;
}

function resolveDefaultHours(
  entryType: TimesheetEntryType | null,
  defaultWorkHours: number,
) {
  return entryType === TimesheetEntryType.ON_WORK ? defaultWorkHours : 0;
}

function resolveHoursWorked(
  entryType: TimesheetEntryType | null,
  rawHours: string | undefined,
  defaultWorkHours: number,
) {
  if (entryType === TimesheetEntryType.ON_WORK) {
    const numericHours =
      rawHours !== undefined ? Number.parseFloat(rawHours) : defaultWorkHours;
    if (!Number.isFinite(numericHours) || numericHours < 0) {
      throw new BadRequestException('Hours worked must be a valid non-negative number.');
    }
    return numericHours;
  }

  return 0;
}

function validateTimesheetForSubmission(
  entries: TimesheetWithRelations['entries'],
) {
  const missingDates = entries
    .filter(
      (entry) =>
        !entry.isWeekend &&
        !entry.isHoliday &&
        entry.entryType !== TimesheetEntryType.ON_WORK &&
        entry.entryType !== TimesheetEntryType.ON_LEAVE,
    )
    .map((entry) => toDateKey(entry.date));

  return {
    isValid: missingDates.length === 0,
    missingDates,
  };
}

function summarizeEntries(entries: TimesheetWithRelations['entries']) {
  const summary = {
    totalWorkDays: 0,
    totalLeaveDays: 0,
    totalWeekendDays: 0,
    totalHolidayDays: 0,
    totalHours: 0,
    incompleteDays: [] as string[],
  };

  for (const entry of entries) {
    if (
      !entry.isWeekend &&
      !entry.isHoliday &&
      entry.entryType !== TimesheetEntryType.ON_WORK &&
      entry.entryType !== TimesheetEntryType.ON_LEAVE
    ) {
      summary.incompleteDays.push(toDateKey(entry.date));
    }

    if (entry.entryType === TimesheetEntryType.ON_WORK) {
      summary.totalWorkDays += 1;
      summary.totalHours += Number(entry.hours);
    } else if (entry.entryType === TimesheetEntryType.ON_LEAVE) {
      summary.totalLeaveDays += 1;
    } else if (entry.entryType === TimesheetEntryType.WEEKEND) {
      summary.totalWeekendDays += 1;
    } else if (entry.entryType === TimesheetEntryType.HOLIDAY) {
      summary.totalHolidayDays += 1;
    }

    if (entry.isWeekend && entry.entryType !== TimesheetEntryType.ON_WORK) {
      summary.totalWeekendDays += 0;
    }
  }

  const weekendDates = new Set(
    entries.filter((entry) => entry.isWeekend).map((entry) => toDateKey(entry.date)),
  );
  const holidayDates = new Set(
    entries.filter((entry) => entry.isHoliday).map((entry) => toDateKey(entry.date)),
  );
  summary.totalWeekendDays = weekendDates.size;
  summary.totalHolidayDays = holidayDates.size;

  return summary;
}

function monthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
  });
}

function toCsvLine(values: Array<string>) {
  return values
    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
    .join(',');
}
