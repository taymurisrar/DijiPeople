import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TimesheetImportBatchStatus,
  TimesheetEntryType,
  TimesheetStatus,
  WorkWeekday,
} from '@prisma/client';
import {
  ExcelExportService,
  ExcelParsedRow,
} from '../../common/excel/excel-export.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { ExportTimesheetTemplateDto } from './dto/export-timesheet-template.dto';
import { GetMONTHLYTimesheetDto } from './dto/get-monthly-timesheet.dto';
import {
  CommitTimesheetImportDto,
  ImportTimesheetTemplateDto,
} from './dto/import-timesheet-template.dto';
import { ReviewTimesheetDto } from './dto/review-timesheet.dto';
import { SubmitTimesheetDto } from './dto/submit-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { UpsertTimesheetEntriesDto } from './dto/upsert-timesheet-entries.dto';
import {
  TimesheetTemplateEmployee,
  TimesheetWithRelations,
  TimesheetsRepository,
} from './timesheets.repository';

type UploadedExcelFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type TimesheetImportSeverity = 'valid' | 'warning' | 'error';

type TimesheetImportPayload = {
  employeeId: string;
  employeeCode: string;
  businessUnitId: string | null;
  year: number;
  month: number;
  date: string;
  dayOfWeek: WorkWeekday;
  entryType: TimesheetEntryType;
  hoursWorked: number;
  isWeekend: boolean;
  isHoliday: boolean;
  note: string | null;
};

type TimesheetImportPreviewRow = {
  rowNumber: number;
  employeeCode: string;
  employeeName: string;
  workEmail: string;
  date: string;
  entryType: string;
  hoursWorked: string;
  severity: TimesheetImportSeverity;
  errors: string[];
  warnings: string[];
  payload: TimesheetImportPayload | null;
};

type TimesheetImportPreview = {
  fileName: string;
  year: number;
  month: number;
  settings: TimesheetSettings;
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
    affectedEmployees: number;
  };
  rows: TimesheetImportPreviewRow[];
};

type TimesheetSettings = {
  timesheetPeriodType: 'monthly' | 'weekly' | 'biweekly';
  weekendDays: WorkWeekday[];
  defaultWorkHours: number;
  defaultHoursForOnWork: number;
  allowWeekendWork: boolean;
  allowHolidayWork: boolean;
  requireMonthlySubmission: boolean;
  autoFillWorkingDays: boolean;
  allowBulkImport: boolean;
  allowEmployeeSelfImport: boolean;
  allowManagerImportForTeam: boolean;
  requireAllDaysCompletedBeforeSubmit: boolean;
  requireSubmissionNote: boolean;
  lockTimesheetAfterApproval: boolean;
  allowRejectedTimesheetResubmission: boolean;
};

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly timesheetsRepository: TimesheetsRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly excelExportService: ExcelExportService,
    private readonly prisma: PrismaService,
  ) {}

  async getMyMONTHLYTimesheet(
    currentUser: AuthenticatedUser,
    query: GetMONTHLYTimesheetDto,
  ) {
    const employee = await this.getCurrentEmployee(currentUser);
    const { year, month } = resolveTargetMonth(query.year, query.month);
    const timesheet = await this.getOrCreateMONTHLYTimesheet(
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
    const canReadAll =
      currentUser.permissionKeys.includes('timesheets.read.all') ||
      currentUser.permissionKeys.includes('attendance.manage');

    const employeeIds = canReadAll
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
      canReadAll ? 'tenant' : 'team',
    );
  }

  async getTeamTimesheetById(
    currentUser: AuthenticatedUser,
    timesheetId: string,
  ) {
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

    const settings = await this.getTimesheetSettings(
      currentUser.tenantId,
      timesheet.businessUnitId,
    );
    this.assertMonthlyTimesheetsEnabled(settings);
    this.assertTimesheetEditable(timesheet, settings);
    const periodStart = toStartOfDay(timesheet.periodStart);
    const periodEnd = toStartOfDay(timesheet.periodEnd);
    const approvedLeaves =
      await this.timesheetsRepository.findApprovedLeaveRequestsForMonth(
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
    const entryMap = new Map(
      timesheet.entries.map((entry) => [toDateKey(entry.date), entry]),
    );

    for (const incoming of dto.entries) {
      const date = toStartOfDay(new Date(incoming.date));
      if (date < periodStart || date > periodEnd) {
        throw new BadRequestException(
          'Entries must stay within the selected month.',
        );
      }

      const dateKey = toDateKey(date);
      const currentEntry = entryMap.get(dateKey);

      if (!currentEntry) {
        throw new NotFoundException(
          `Timesheet day ${dateKey} was not generated.`,
        );
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
          ? (incoming.leaveRequestId ?? approvedLeave?.id ?? null)
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
        settings.defaultHoursForOnWork,
      );

      await this.timesheetsRepository.updateTimesheetEntry(
        currentUser.tenantId,
        currentEntry.id,
        {
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
        },
      );
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

    const settings = await this.getTimesheetSettings(
      currentUser.tenantId,
      timesheet.businessUnitId,
    );
    this.assertMonthlyTimesheetsEnabled(settings);
    this.assertTimesheetEditable(timesheet, settings);

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
    if (settings.requireAllDaysCompletedBeforeSubmit && !validation.isValid) {
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

    if (!updated) {
      throw new NotFoundException('Timesheet could not be updated.');
    }

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
      [
        'Employee',
        timesheet.employee.firstName + ' ' + timesheet.employee.lastName,
      ],
      ['Employee Code', timesheet.employee.employeeCode],
      ['Month', `${monthName(timesheet.month)} ${timesheet.year}`],
      ['Status', timesheet.status],
      ['Submitted Note', timesheet.submittedNote ?? ''],
      ['Review Note', timesheet.reviewNote ?? ''],
      [],
      [
        'Date',
        'Day',
        'Entry Type',
        'Hours Worked',
        'Weekend',
        'Holiday',
        'Leave',
        'Note',
      ],
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

  async exportTimesheetTemplate(
    currentUser: AuthenticatedUser,
    query: ExportTimesheetTemplateDto,
  ) {
    const { year, month } = resolveTargetMonth(query.year, query.month);
    const { periodStart, periodEnd } = getMonthRange(year, month);
    const settings = await this.getTimesheetSettings(
      currentUser.tenantId,
      query.businessUnitId,
    );
    this.assertMonthlyTimesheetsEnabled(settings);

    const templateScope = await this.resolveTemplateScope(currentUser, query);
    const employees = await this.timesheetsRepository.findEmployeesForTemplate(
      currentUser.tenantId,
      {
        employeeIds: templateScope.employeeIds,
        employeeId: query.employeeId,
        businessUnitId: query.businessUnitId,
        departmentId: query.departmentId,
        locationId: query.locationId,
      },
    );
    const employeeIds = employees.map((employee) => employee.id);
    const [existingTimesheets, holidays, approvedLeaves] = await Promise.all([
      this.timesheetsRepository.findTimesheetsForTemplate(
        currentUser.tenantId,
        employeeIds,
        year,
        month,
      ),
      this.timesheetsRepository.findHolidaysForMonth(
        currentUser.tenantId,
        periodStart,
        periodEnd,
      ),
      this.timesheetsRepository.findApprovedLeaveRequestsForEmployeesForMonth(
        currentUser.tenantId,
        employeeIds,
        periodStart,
        periodEnd,
      ),
    ]);

    const rows = buildTimesheetTemplateRows({
      dates: getDatesInRange(periodStart, periodEnd),
      employees,
      holidayMap: new Map(
        holidays.map((holiday) => [toDateKey(holiday.date), holiday]),
      ),
      leaveMap: buildEmployeeLeaveMap(approvedLeaves),
      month,
      settings,
      timesheetByEmployeeId: new Map(
        existingTimesheets.map(
          (timesheet) => [timesheet.employeeId, timesheet] as const,
        ),
      ),
      year,
    });
    const buffer = this.excelExportService.buildWorkbookBuffer({
      sheets: [
        {
          name: 'Timesheet',
          columns: TIMESHEET_TEMPLATE_COLUMNS,
          rows,
        },
        {
          name: 'Instructions',
          columns: [
            { key: 'topic', header: 'Topic', width: 28 },
            { key: 'details', header: 'Details', width: 96 },
          ],
          rows: buildTimesheetTemplateInstructions(year, month),
        },
        {
          name: 'Valid Values',
          columns: [
            { key: 'field', header: 'Field', width: 24 },
            { key: 'value', header: 'Valid Value', width: 24 },
            { key: 'description', header: 'Description', width: 72 },
          ],
          rows: TIMESHEET_TEMPLATE_VALID_VALUES,
        },
      ],
    });

    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `timesheet-template-${year}-${String(month).padStart(2, '0')}.xlsx`,
      employeeCount: employees.length,
      rowCount: rows.length,
    };
  }

  async previewTimesheetImport(
    currentUser: AuthenticatedUser,
    dto: ImportTimesheetTemplateDto,
    file: UploadedExcelFile | undefined,
  ) {
    const validatedFile = validateTimesheetImportFile(file);
    const preview = await this.buildTimesheetImportPreview(
      currentUser,
      dto,
      validatedFile,
    );
    const batch = await this.timesheetsRepository.createImportBatch({
      tenantId: currentUser.tenantId,
      fileName: validatedFile.originalname,
      status: TimesheetImportBatchStatus.PREVIEWED,
      importedByUserId: currentUser.userId,
      importedAt: new Date(),
      totalRows: preview.summary.totalRows,
      successCount: preview.summary.validRows,
      warningCount: preview.summary.warningRows,
      errorCount: preview.summary.errorRows,
      errorSummary: summarizeImportErrors(preview.rows),
      previewJson: JSON.stringify(preview),
    });

    return {
      ...preview,
      batch: {
        id: batch.id,
        fileName: batch.fileName,
        importedAt: batch.importedAt,
        status: batch.status,
        successCount: batch.successCount,
        errorCount: batch.errorCount,
      },
    };
  }

  async commitTimesheetImport(
    currentUser: AuthenticatedUser,
    dto: CommitTimesheetImportDto,
  ) {
    const batch = await this.timesheetsRepository.findImportBatchById(
      currentUser.tenantId,
      dto.batchId,
    );

    if (!batch) {
      throw new NotFoundException('Timesheet import batch was not found.');
    }

    if (batch.importedByUserId !== currentUser.userId) {
      throw new ForbiddenException(
        'You can only commit your own import preview.',
      );
    }

    if (batch.status !== TimesheetImportBatchStatus.PREVIEWED) {
      throw new ConflictException(
        'This timesheet import batch has already been processed.',
      );
    }

    if (!batch.previewJson) {
      throw new BadRequestException('Import preview data is missing.');
    }

    const preview = JSON.parse(batch.previewJson) as TimesheetImportPreview;
    if (preview.summary.errorRows > 0) {
      throw new BadRequestException(
        'Resolve blocking row errors before confirming import.',
      );
    }

    await this.timesheetsRepository.markImportBatchProcessing(
      currentUser.tenantId,
      batch.id,
    );

    const committedTimesheetIds = new Set<string>();
    let successCount = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const row of preview.rows) {
          if (!row.payload || row.severity === 'error') {
            continue;
          }

          const payload = row.payload;
          let timesheet = await this.timesheetsRepository.findMONTHLYTimesheet(
            currentUser.tenantId,
            payload.employeeId,
            payload.year,
            payload.month,
            tx,
          );

          if (!timesheet) {
            const { periodStart, periodEnd } = getMonthRange(
              payload.year,
              payload.month,
            );
            timesheet = await this.timesheetsRepository.createTimesheet(
              {
                tenantId: currentUser.tenantId,
                businessUnitId: payload.businessUnitId,
                employeeId: payload.employeeId,
                year: payload.year,
                month: payload.month,
                periodStart,
                periodEnd,
                status: TimesheetStatus.DRAFT,
                createdById: currentUser.userId,
                updatedById: currentUser.userId,
              },
              tx,
            );
          } else {
            this.assertTimesheetEditable(timesheet, preview.settings);
            await this.timesheetsRepository.updateTimesheet(
              currentUser.tenantId,
              timesheet.id,
              {
                status: TimesheetStatus.DRAFT,
                updatedById: currentUser.userId,
              },
              tx,
            );
          }

          const existingEntry = await this.timesheetsRepository.findEntryByDate(
            currentUser.tenantId,
            timesheet.id,
            new Date(payload.date),
            tx,
          );
          const entryData = {
            tenantId: currentUser.tenantId,
            timesheetId: timesheet.id,
            employeeId: payload.employeeId,
            date: new Date(payload.date),
            dayOfWeek: payload.dayOfWeek,
            entryType: payload.entryType,
            isWeekend: payload.isWeekend,
            isHoliday: payload.isHoliday,
            hours: new Prisma.Decimal(payload.hoursWorked),
            note: payload.note,
            description: payload.note,
            updatedById: currentUser.userId,
          };

          if (existingEntry) {
            await this.timesheetsRepository.updateTimesheetEntry(
              currentUser.tenantId,
              existingEntry.id,
              entryData,
              tx,
            );
          } else {
            await this.timesheetsRepository.createTimesheetEntry(
              {
                ...entryData,
                createdById: currentUser.userId,
              },
              tx,
            );
          }

          committedTimesheetIds.add(timesheet.id);
          successCount += 1;
        }

        await this.timesheetsRepository.updateImportBatch(
          currentUser.tenantId,
          batch.id,
          {
            status: TimesheetImportBatchStatus.COMPLETED,
            committedAt: new Date(),
            successCount,
            warningCount: preview.summary.warningRows,
            errorCount: 0,
            timesheets: {
              connect: Array.from(committedTimesheetIds).map((id) => ({ id })),
            },
          },
          tx,
        );
      });
    } catch (error) {
      await this.timesheetsRepository.updateImportBatch(
        currentUser.tenantId,
        batch.id,
        {
          status: TimesheetImportBatchStatus.FAILED,
          errorCount: preview.summary.totalRows - successCount,
          errorSummary:
            error instanceof Error ? error.message : 'Timesheet import failed.',
        },
      );
      throw error;
    }

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: TimesheetImportBatchStatus.COMPLETED,
      successCount,
      warningCount: preview.summary.warningRows,
      errorCount: 0,
      affectedEmployees: preview.summary.affectedEmployees,
      affectedTimesheets: committedTimesheetIds.size,
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

    if (nextStatus === TimesheetStatus.REJECTED && !dto.reviewNote?.trim()) {
      throw new BadRequestException('Rejecting a timesheet requires a reason.');
    }

    await this.assertCanReview(currentUser, timesheet, nextStatus);

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

    if (!updated) {
      throw new NotFoundException('Timesheet could not be reviewed.');
    }

    return this.mapTimesheet(updated, currentUser);
  }

  private async getOrCreateMONTHLYTimesheet(
    currentUser: AuthenticatedUser,
    employeeId: string,
    year: number,
    month: number,
  ) {
    const existing = await this.timesheetsRepository.findMONTHLYTimesheet(
      currentUser.tenantId,
      employeeId,
      year,
      month,
    );

    if (existing) {
      return this.ensureMONTHLYEntries(currentUser, existing);
    }

    const { periodStart, periodEnd } = getMonthRange(year, month);
    const employee =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        currentUser.tenantId,
        employeeId,
      );
    const created = await this.timesheetsRepository.createTimesheet({
      tenantId: currentUser.tenantId,
      businessUnitId:
        employee?.businessUnitId ?? employee?.user?.businessUnitId,
      employeeId,
      year,
      month,
      periodStart,
      periodEnd,
      status: TimesheetStatus.DRAFT,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    return this.ensureMONTHLYEntries(currentUser, created);
  }

  private async ensureMONTHLYEntries(
    currentUser: AuthenticatedUser,
    timesheet: TimesheetWithRelations,
  ) {
    const settings = await this.getTimesheetSettings(
      currentUser.tenantId,
      timesheet.businessUnitId,
    );
    this.assertMonthlyTimesheetsEnabled(settings);
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

    const existingKeys = new Set(
      timesheet.entries.map((entry) => toDateKey(entry.date)),
    );
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
      const hours = resolveDefaultHours(
        entryType,
        settings.defaultHoursForOnWork,
      );

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

    const canReadScoped =
      currentUser.permissionKeys.includes('timesheets.read.team') ||
      currentUser.permissionKeys.includes('timesheets.read.all');

    if (!canReadScoped) {
      throw new ForbiddenException('You are not allowed to read timesheets.');
    }

    if (currentUser.permissionKeys.includes('timesheets.read.all')) {
      return;
    }

    const managerUserId = timesheet.employee.manager?.userId;
    if (!managerUserId || managerUserId !== currentUser.userId) {
      throw new ForbiddenException(
        'You can only view timesheets for your direct reports.',
      );
    }
  }

  private async buildTimesheetImportPreview(
    currentUser: AuthenticatedUser,
    dto: ImportTimesheetTemplateDto,
    file: UploadedExcelFile,
  ): Promise<TimesheetImportPreview> {
    const { year, month } = resolveTargetMonth(dto.year, dto.month);
    const { periodStart, periodEnd } = getMonthRange(year, month);
    const settings = await this.getTimesheetSettings(currentUser.tenantId);
    this.assertMonthlyTimesheetsEnabled(settings);

    if (!settings.allowBulkImport) {
      throw new BadRequestException(
        'Bulk timesheet import is disabled by tenant settings.',
      );
    }

    if ((dto.scope ?? 'mine') === 'mine' && !settings.allowEmployeeSelfImport) {
      throw new BadRequestException(
        'Employee self import is disabled by tenant settings.',
      );
    }

    if (dto.scope === 'team' && !settings.allowManagerImportForTeam) {
      throw new BadRequestException(
        'Manager team import is disabled by tenant settings.',
      );
    }

    const templateScope = await this.resolveTemplateScope(currentUser, dto);
    const employees = await this.timesheetsRepository.findEmployeesForTemplate(
      currentUser.tenantId,
      {
        employeeIds: templateScope.employeeIds,
        businessUnitId: dto.businessUnitId,
      },
    );
    const employeeByCode = new Map(
      employees.map((employee) => [
        employee.employeeCode.toLowerCase(),
        employee,
      ]),
    );
    const employeeByEmail = new Map(
      employees
        .filter((employee) => employee.email)
        .map((employee) => [employee.email!.toLowerCase(), employee]),
    );
    const holidays = await this.timesheetsRepository.findHolidaysForMonth(
      currentUser.tenantId,
      periodStart,
      periodEnd,
    );
    const holidayMap = new Map(
      holidays.map((holiday) => [toDateKey(holiday.date), holiday]),
    );
    const parsedRows = this.excelExportService.parseFirstWorksheet(file.buffer);
    assertRequiredImportColumns(parsedRows);

    const rows = parsedRows.map((row) =>
      validateTimesheetImportRow({
        employeeByCode,
        employeeByEmail,
        holidayMap,
        month,
        row,
        settings,
        year,
      }),
    );
    const affectedEmployees = new Set(
      rows
        .map((row) => row.payload?.employeeCode)
        .filter((value): value is string => Boolean(value)),
    );

    return {
      fileName: file.originalname,
      month,
      rows,
      settings,
      summary: {
        affectedEmployees: affectedEmployees.size,
        errorRows: rows.filter((row) => row.severity === 'error').length,
        totalRows: rows.length,
        validRows: rows.filter((row) => row.severity === 'valid').length,
        warningRows: rows.filter((row) => row.severity === 'warning').length,
      },
      year,
    };
  }

  private async resolveTemplateScope(
    currentUser: AuthenticatedUser,
    query: ExportTimesheetTemplateDto,
  ) {
    const requestedScope = query.scope ?? 'mine';
    const canReadAll = currentUser.permissionKeys.includes(
      'timesheets.read.all',
    );
    const canReadTeam = currentUser.permissionKeys.includes(
      'timesheets.read.team',
    );

    if (requestedScope === 'tenant') {
      if (!canReadAll) {
        throw new ForbiddenException(
          'You are not allowed to export tenant timesheet templates.',
        );
      }

      return { employeeIds: undefined as string[] | undefined };
    }

    if (requestedScope === 'team') {
      if (!canReadTeam && !canReadAll) {
        throw new ForbiddenException(
          'You are not allowed to export team timesheet templates.',
        );
      }

      return {
        employeeIds: canReadAll
          ? undefined
          : await this.resolveDirectReportIds(currentUser),
      };
    }

    const employee = await this.getCurrentEmployee(currentUser);
    if (query.employeeId && query.employeeId !== employee.id && !canReadAll) {
      throw new ForbiddenException(
        'You are not allowed to export this employee timesheet template.',
      );
    }

    return {
      employeeIds: query.employeeId && canReadAll ? undefined : [employee.id],
    };
  }

  private assertTimesheetEditable(
    timesheet: TimesheetWithRelations,
    settings: TimesheetSettings,
  ) {
    if (timesheet.status === TimesheetStatus.SUBMITTED) {
      throw new ConflictException('Submitted timesheets cannot be edited.');
    }

    if (
      timesheet.status === TimesheetStatus.APPROVED &&
      settings.lockTimesheetAfterApproval
    ) {
      throw new ConflictException(
        'Approved timesheets are locked by tenant settings.',
      );
    }

    if (
      timesheet.status === TimesheetStatus.REJECTED &&
      !settings.allowRejectedTimesheetResubmission
    ) {
      throw new ConflictException(
        'Rejected timesheet resubmission is disabled by tenant settings.',
      );
    }
  }

  private async assertCanReview(
    currentUser: AuthenticatedUser,
    timesheet: TimesheetWithRelations,
    nextStatus: 'APPROVED' | 'REJECTED',
  ) {
    const requiredPermission =
      nextStatus === TimesheetStatus.APPROVED
        ? 'timesheets.approve'
        : 'timesheets.reject';

    if (!currentUser.permissionKeys.includes(requiredPermission)) {
      throw new ForbiddenException('You are not allowed to review timesheets.');
    }

    if (currentUser.permissionKeys.includes('timesheets.read.all')) {
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

  private async getTimesheetSettings(
    tenantId: string,
    businessUnitId?: string | null,
  ): Promise<TimesheetSettings> {
    const settings =
      await this.tenantSettingsResolverService.getTimesheetSettingsForBusinessUnit(
        tenantId,
        businessUnitId,
      );

    return {
      timesheetPeriodType: settings.timesheetPeriodType,
      weekendDays: settings.weekendDays,
      defaultWorkHours: settings.defaultWorkHours,
      defaultHoursForOnWork: settings.defaultHoursForOnWork,
      allowWeekendWork: settings.allowWeekendWork,
      allowHolidayWork: settings.allowHolidayWork,
      requireMonthlySubmission: settings.requireMonthlySubmission,
      autoFillWorkingDays: settings.autoFillWorkingDays,
      allowBulkImport: settings.allowBulkImport,
      allowEmployeeSelfImport: settings.allowEmployeeSelfImport,
      allowManagerImportForTeam: settings.allowManagerImportForTeam,
      requireAllDaysCompletedBeforeSubmit:
        settings.requireAllDaysCompletedBeforeSubmit,
      requireSubmissionNote: settings.requireSubmissionNote,
      lockTimesheetAfterApproval: settings.lockTimesheetAfterApproval,
      allowRejectedTimesheetResubmission:
        settings.allowRejectedTimesheetResubmission,
    };
  }

  private assertMonthlyTimesheetsEnabled(settings: TimesheetSettings) {
    if (settings.timesheetPeriodType !== 'monthly') {
      throw new BadRequestException(
        'This tenant is configured for a non-monthly timesheet period. The current timesheet workflow only supports monthly periods.',
      );
    }
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

  private mapTimesheet(
    timesheet: TimesheetWithRelations,
    currentUser?: AuthenticatedUser,
  ) {
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
      (currentUser.permissionKeys.includes('timesheets.read.all') ||
        timesheet.employee.manager?.userId === currentUser.userId);

    const canCurrentUserReject =
      currentUser !== undefined &&
      currentUser.permissionKeys.includes('timesheets.reject') &&
      timesheet.status === TimesheetStatus.SUBMITTED &&
      (currentUser.permissionKeys.includes('timesheets.read.all') ||
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
        department: timesheet.employee.department
          ? {
              id: timesheet.employee.department.id,
              code: timesheet.employee.department.code,
              name: timesheet.employee.department.name,
            }
          : null,
        location: timesheet.employee.location
          ? {
              id: timesheet.employee.location.id,
              name: timesheet.employee.location.name,
            }
          : null,
        businessUnit:
          (timesheet.employee.businessUnit ??
          timesheet.employee.user?.businessUnit)
            ? {
                id: (timesheet.employee.businessUnit ??
                  timesheet.employee.user?.businessUnit)!.id,
                name: (timesheet.employee.businessUnit ??
                  timesheet.employee.user?.businessUnit)!.name,
              }
            : null,
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
      canCurrentUserReject,
      canCurrentUserEdit:
        currentUser !== undefined &&
        timesheet.employee.userId === currentUser.userId &&
        currentUser.permissionKeys.includes('timesheets.write') &&
        timesheet.status !== TimesheetStatus.SUBMITTED &&
        timesheet.status !== TimesheetStatus.APPROVED,
    };
  }
}

const TIMESHEET_TEMPLATE_COLUMNS = [
  { key: 'employeeCode', header: 'employeeCode', width: 18 },
  { key: 'employeeName', header: 'employeeName', width: 28 },
  { key: 'workEmail', header: 'workEmail', width: 32 },
  { key: 'date', header: 'date', width: 14 },
  { key: 'dayOfWeek', header: 'dayOfWeek', width: 16 },
  { key: 'status', header: 'status/entryType', width: 18 },
  { key: 'hoursWorked', header: 'hoursWorked', width: 14 },
  { key: 'isWeekend', header: 'isWeekend', width: 12 },
  { key: 'isHoliday', header: 'isHoliday', width: 12 },
  { key: 'leaveType', header: 'leaveType', width: 22 },
  { key: 'note', header: 'note', width: 36 },
  { key: 'businessUnit', header: 'client/account/businessUnit', width: 28 },
  { key: 'department', header: 'department', width: 24 },
  { key: 'location', header: 'location', width: 24 },
] as const;

const REQUIRED_TIMESHEET_IMPORT_COLUMNS = [
  'employeeCode',
  'employeeName',
  'workEmail',
  'date',
  'dayOfWeek',
  'status/entryType',
  'hoursWorked',
  'isWeekend',
  'isHoliday',
  'leaveType',
  'note',
] as const;

const TIMESHEET_IMPORT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

const TIMESHEET_TEMPLATE_VALID_VALUES = [
  {
    field: 'status/entryType',
    value: 'ON_WORK',
    description: 'Employee worked this day. Enter hoursWorked.',
  },
  {
    field: 'status/entryType',
    value: 'ON_LEAVE',
    description:
      'Employee was on approved or recorded leave. Keep hoursWorked as 0.',
  },
  {
    field: 'status/entryType',
    value: 'WEEKEND',
    description:
      'System or client-marked weekend row. Keep hoursWorked as 0 unless weekend work is allowed.',
  },
  {
    field: 'status/entryType',
    value: 'HOLIDAY',
    description:
      'System or client-marked holiday row. Keep hoursWorked as 0 unless holiday work is allowed.',
  },
  {
    field: 'isWeekend/isHoliday',
    value: 'Yes',
    description: 'Use Yes for true values.',
  },
  {
    field: 'isWeekend/isHoliday',
    value: 'No',
    description: 'Use No for false values.',
  },
];

function buildTimesheetTemplateInstructions(year: number, month: number) {
  return [
    {
      topic: 'Purpose',
      details:
        'Use the Timesheet sheet to fill or update monthly employee attendance rows for import.',
    },
    {
      topic: 'Period',
      details: `${monthName(month)} ${year}. Keep one row per employee per date.`,
    },
    {
      topic: 'Stable mapping',
      details:
        'Do not rename columns. Import will map employeeCode and date, then read status/entryType, hoursWorked, leaveType, and note.',
    },
    {
      topic: 'Valid statuses',
      details:
        'Allowed status/entryType values are ON_WORK, ON_LEAVE, WEEKEND, and HOLIDAY.',
    },
    {
      topic: 'Client/account context',
      details:
        'The client/account/businessUnit, department, and location columns are exported for review context and should remain unchanged.',
    },
  ];
}

function buildTimesheetTemplateRows({
  dates,
  employees,
  holidayMap,
  leaveMap,
  month,
  settings,
  timesheetByEmployeeId,
  year,
}: {
  dates: Date[];
  employees: TimesheetTemplateEmployee[];
  holidayMap: Map<string, unknown>;
  leaveMap: Map<string, { leaveType: { name: string } }>;
  month: number;
  settings: TimesheetSettings;
  timesheetByEmployeeId: Map<string, TimesheetWithRelations>;
  year: number;
}) {
  const rows: Array<
    Record<(typeof TIMESHEET_TEMPLATE_COLUMNS)[number]['key'], string | number>
  > = [];

  for (const employee of employees) {
    const timesheet = timesheetByEmployeeId.get(employee.id);
    const entryByDate = new Map(
      timesheet?.entries.map((entry) => [toDateKey(entry.date), entry]) ?? [],
    );

    for (const date of dates) {
      const dateKey = toDateKey(date);
      const entry = entryByDate.get(dateKey);
      const dayOfWeek = getWorkWeekday(date);
      const isHoliday = entry?.isHoliday ?? holidayMap.has(dateKey);
      const isWeekend =
        entry?.isWeekend ?? settings.weekendDays.includes(dayOfWeek);
      const leave =
        entry?.leaveRequest ?? leaveMap.get(`${employee.id}:${dateKey}`);
      const entryType =
        entry?.entryType ??
        (isHoliday
          ? TimesheetEntryType.HOLIDAY
          : isWeekend
            ? TimesheetEntryType.WEEKEND
            : leave
              ? TimesheetEntryType.ON_LEAVE
              : settings.autoFillWorkingDays
                ? TimesheetEntryType.ON_WORK
                : null);

      rows.push({
        employeeCode: employee.employeeCode,
        employeeName: getEmployeeDisplayName(employee),
        workEmail: employee.email ?? '',
        date: `${year}-${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        dayOfWeek,
        status: entryType ?? '',
        hoursWorked:
          entry?.hours !== undefined
            ? Number(entry.hours)
            : entryType === TimesheetEntryType.ON_WORK
              ? settings.defaultHoursForOnWork
              : 0,
        isWeekend: isWeekend ? 'Yes' : 'No',
        isHoliday: isHoliday ? 'Yes' : 'No',
        leaveType: leave?.leaveType?.name ?? '',
        note: entry?.note ?? entry?.description ?? '',
        businessUnit: formatCodeAndName(
          null,
          employee.businessUnit?.name ?? employee.user?.businessUnit?.name,
        ),
        department: formatCodeAndName(
          employee.department?.code,
          employee.department?.name,
        ),
        location: employee.location
          ? [
              employee.location.name,
              employee.location.city,
              employee.location.country,
            ]
              .filter(Boolean)
              .join(', ')
          : '',
      });
    }
  }

  return rows;
}

function buildEmployeeLeaveMap(
  leaves: Array<{
    employeeId: string;
    startDate: Date;
    endDate: Date;
    leaveType: { name: string };
  }>,
) {
  const map = new Map<string, { leaveType: { name: string } }>();

  for (const leave of leaves) {
    for (const date of getDatesInRange(leave.startDate, leave.endDate)) {
      map.set(`${leave.employeeId}:${toDateKey(date)}`, leave);
    }
  }

  return map;
}

function getEmployeeDisplayName(
  employee: Pick<
    TimesheetTemplateEmployee,
    'firstName' | 'lastName' | 'preferredName'
  >,
) {
  return `${employee.preferredName || employee.firstName} ${employee.lastName}`.trim();
}

function formatCodeAndName(code?: string | null, name?: string | null) {
  if (code && name) {
    return `${code} - ${name}`;
  }

  return name ?? code ?? '';
}

function validateTimesheetImportFile(file: UploadedExcelFile | undefined) {
  if (!file) {
    throw new BadRequestException(
      'Excel file is required for timesheet import.',
    );
  }

  if (
    !TIMESHEET_IMPORT_MIME_TYPES.includes(file.mimetype) &&
    !file.originalname.toLowerCase().endsWith('.xlsx')
  ) {
    throw new BadRequestException(
      'Timesheet import supports Excel .xlsx files only.',
    );
  }

  return file;
}

function assertRequiredImportColumns(rows: ExcelParsedRow[]) {
  if (rows.length === 0) {
    throw new BadRequestException(
      'Timesheet Excel file must include at least one data row.',
    );
  }

  const firstRow = rows[0];
  const columns = new Set(Object.keys(firstRow.values));
  const missingColumns = REQUIRED_TIMESHEET_IMPORT_COLUMNS.filter(
    (column) => !columns.has(column),
  );

  if (missingColumns.length > 0) {
    throw new BadRequestException(
      `Timesheet Excel file is missing required column(s): ${missingColumns.join(', ')}.`,
    );
  }
}

function validateTimesheetImportRow({
  employeeByCode,
  employeeByEmail,
  holidayMap,
  month,
  row,
  settings,
  year,
}: {
  employeeByCode: Map<string, TimesheetTemplateEmployee>;
  employeeByEmail: Map<string, TimesheetTemplateEmployee>;
  holidayMap: Map<string, unknown>;
  month: number;
  row: ExcelParsedRow;
  settings: TimesheetSettings;
  year: number;
}): TimesheetImportPreviewRow {
  const employeeCode = getImportValue(row, 'employeeCode');
  const workEmail = getImportValue(row, 'workEmail');
  const employeeName = getImportValue(row, 'employeeName');
  const dateValue = getImportValue(row, 'date');
  const entryTypeValue = getImportValue(row, 'status/entryType').toUpperCase();
  const hoursValue = getImportValue(row, 'hoursWorked');
  const note = getImportValue(row, 'note');
  const errors: string[] = [];
  const warnings: string[] = [];

  const employeeFromCode = employeeCode
    ? employeeByCode.get(employeeCode.toLowerCase())
    : undefined;
  const employeeFromEmail = workEmail
    ? employeeByEmail.get(workEmail.toLowerCase())
    : undefined;
  const employee = employeeFromCode ?? employeeFromEmail ?? null;

  if (!employeeCode && !workEmail) {
    errors.push('employeeCode or workEmail is required.');
  } else if (!employee) {
    errors.push(
      'No accessible tenant employee matches employeeCode/workEmail.',
    );
  } else if (
    employeeFromCode &&
    employeeFromEmail &&
    employeeFromCode.id !== employeeFromEmail.id
  ) {
    errors.push('employeeCode and workEmail refer to different employees.');
  }

  const date = parseImportDate(dateValue);
  if (!date) {
    errors.push('date must be a valid date.');
  } else if (date.getFullYear() !== year || date.getMonth() + 1 !== month) {
    errors.push('date does not belong to the selected import month.');
  }

  const entryType = parseTimesheetEntryType(entryTypeValue);
  if (!entryType) {
    errors.push(
      'status/entryType must be ON_WORK, ON_LEAVE, WEEKEND, or HOLIDAY.',
    );
  }

  const hoursWorked = parseHoursWorked(hoursValue);
  if (hoursWorked === null) {
    errors.push('hoursWorked must be a valid number.');
  } else if (hoursWorked > 24) {
    errors.push('hoursWorked cannot exceed 24.');
  }

  let dayOfWeek: WorkWeekday | null = null;
  let isWeekend = false;
  let isHoliday = false;
  if (date) {
    dayOfWeek = getWorkWeekday(date);
    isWeekend = settings.weekendDays.includes(dayOfWeek);
    isHoliday = holidayMap.has(toDateKey(date));
    const providedWeekend = parseYesNo(getImportValue(row, 'isWeekend'));
    const providedHoliday = parseYesNo(getImportValue(row, 'isHoliday'));

    if (providedWeekend !== null && providedWeekend !== isWeekend) {
      warnings.push(
        'isWeekend differs from tenant settings and will be recalculated.',
      );
    }

    if (providedHoliday !== null && providedHoliday !== isHoliday) {
      warnings.push(
        'isHoliday differs from tenant holiday calendar and will be recalculated.',
      );
    }
  }

  if (entryType && hoursWorked !== null) {
    if (entryType === TimesheetEntryType.ON_WORK) {
      if (isWeekend && !settings.allowWeekendWork) {
        errors.push('Weekend work is disabled by tenant settings.');
      }

      if (isHoliday && !settings.allowHolidayWork) {
        errors.push('Holiday work is disabled by tenant settings.');
      }
    } else if (hoursWorked !== 0) {
      errors.push('hoursWorked must be 0 unless status/entryType is ON_WORK.');
    }

    if ((isWeekend || isHoliday) && entryType === TimesheetEntryType.ON_LEAVE) {
      errors.push('Weekend or holiday rows cannot be imported as ON_LEAVE.');
    }

    if (!isWeekend && entryType === TimesheetEntryType.WEEKEND) {
      errors.push('WEEKEND can only be used for tenant weekend dates.');
    }

    if (!isHoliday && entryType === TimesheetEntryType.HOLIDAY) {
      errors.push('HOLIDAY can only be used for tenant holiday dates.');
    }
  }

  const severity: TimesheetImportSeverity =
    errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

  return {
    rowNumber: row.rowNumber,
    employeeCode,
    employeeName,
    workEmail,
    date: dateValue,
    entryType: entryTypeValue,
    errors,
    hoursWorked: hoursValue,
    payload:
      severity === 'error' ||
      !employee ||
      !date ||
      !entryType ||
      !dayOfWeek ||
      hoursWorked === null
        ? null
        : {
            date: toDateKey(date),
            dayOfWeek,
            employeeCode: employee.employeeCode,
            employeeId: employee.id,
            businessUnitId:
              employee.businessUnitId ??
              employee.user?.businessUnit?.id ??
              null,
            entryType,
            hoursWorked:
              entryType === TimesheetEntryType.ON_WORK ? hoursWorked : 0,
            isHoliday,
            isWeekend,
            month,
            note: note || null,
            year,
          },
    severity,
    warnings,
  };
}

function getImportValue(row: ExcelParsedRow, column: string) {
  return row.values[column]?.trim() ?? '';
}

function parseTimesheetEntryType(value: string) {
  if (value in TimesheetEntryType) {
    return value as TimesheetEntryType;
  }

  return null;
}

function parseHoursWorked(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseImportDate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const isoMatch = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }

  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }

  return null;
}

function summarizeImportErrors(rows: TimesheetImportPreviewRow[]) {
  const rowErrors = rows.filter((row) => row.errors.length > 0);
  if (rowErrors.length === 0) {
    return null;
  }

  return rowErrors
    .slice(0, 10)
    .map((row) => `Row ${row.rowNumber}: ${row.errors.join('; ')}`)
    .join('\n');
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
      throw new BadRequestException(
        'Hours worked must be a valid non-negative number.',
      );
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
    entries
      .filter((entry) => entry.isWeekend)
      .map((entry) => toDateKey(entry.date)),
  );
  const holidayDates = new Set(
    entries
      .filter((entry) => entry.isHoliday)
      .map((entry) => toDateKey(entry.date)),
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
