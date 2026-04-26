import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollCycleStatus,
  PayrollRecordStatus,
  PayFrequency,
  Prisma,
  TimesheetEntryType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { CreateEmployeeCompensationDto } from './dto/create-employee-compensation.dto';
import { CreatePayrollCycleDto } from './dto/create-payroll-cycle.dto';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';
import { UpdateEmployeeCompensationDto } from './dto/update-employee-compensation.dto';
import {
  EmployeeCompensationWithRelations,
  PayrollCycleWithRelations,
  PayrollRepository,
} from './payroll.repository';

type PayrollLineItem = {
  code: string;
  label: string;
  type: string;
  amount: string;
  payFrequency?: PayFrequency;
  quantity?: number;
  sourceTimesheetIds?: string[];
};

type PayrollPreviewEmployeeItem = {
  employee: ReturnType<typeof mapPreviewEmployee>;
  compensation: {
    id: string;
    basicSalary: string;
    payFrequency: PayFrequency;
    currency: string;
    effectiveDate: Date;
  } | null;
  timesheetSummary: PayrollTimesheetSummary | null;
  reason?: string;
  calculatedPayroll?: {
    gross: string;
    deductions: string;
    net: string;
    currency: string;
  };
  lineItems?: PayrollLineItem[];
  flags?: string[];
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly payrollRepository: PayrollRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly prisma: PrismaService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
  ) {}

  async listCycles(tenantId: string, query: PayrollCycleQueryDto) {
    const { items, total } = await this.payrollRepository.findCycles(
      tenantId,
      query,
    );

    return {
      items: items.map((cycle) => this.mapCycle(cycle)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        status: query.status ?? null,
      },
    };
  }

  async getCycleById(tenantId: string, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(tenantId, cycleId);

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    return this.mapCycle(cycle);
  }

  async createCycle(currentUser: AuthenticatedUser, dto: CreatePayrollCycleDto) {
    validatePeriodRange(dto.periodStart, dto.periodEnd);

    try {
      const cycle = await this.payrollRepository.createCycle({
        tenantId: currentUser.tenantId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        runDate: dto.runDate ? new Date(dto.runDate) : undefined,
        businessUnitId: dto.businessUnitId,
        processingCycleId: dto.processingCycleId,
        status: 'DRAFT',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapCycle(cycle);
    } catch (error) {
      handlePayrollWriteError(error, 'Payroll cycle already exists for this period.');
    }
  }

  async listCompensations(tenantId: string) {
    const items = await this.payrollRepository.listCompensations(tenantId);
    return items.map((compensation) => this.mapCompensation(compensation));
  }

  async createCompensation(
    currentUser: AuthenticatedUser,
    dto: CreateEmployeeCompensationDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, dto.employeeId);
    validateCompensationRange(dto.effectiveDate, dto.endDate);
    const payrollSettings = await this.tenantSettingsResolverService.getPayrollSettings(
      currentUser.tenantId,
    );

    try {
      const compensation = await this.payrollRepository.createCompensation({
        tenantId: currentUser.tenantId,
        employeeId: dto.employeeId,
        basicSalary: new Prisma.Decimal(dto.basicSalary),
        payFrequency:
          dto.payFrequency ?? resolvePayFrequency(payrollSettings.payFrequency),
        effectiveDate: new Date(dto.effectiveDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        currency:
          dto.currency?.trim().toUpperCase() ??
          payrollSettings.defaultCurrency,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapCompensation(compensation);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Compensation already exists for this employee on the selected effective date.',
      );
    }
  }

  async updateCompensation(
    currentUser: AuthenticatedUser,
    compensationId: string,
    dto: UpdateEmployeeCompensationDto,
  ) {
    const existing = await this.payrollRepository.findCompensationById(
      currentUser.tenantId,
      compensationId,
    );

    if (!existing) {
      throw new NotFoundException(
        'Employee compensation was not found for this tenant.',
      );
    }

    if (dto.employeeId) {
      await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, dto.employeeId);
    }

    validateCompensationRange(
      dto.effectiveDate ?? existing.effectiveDate.toISOString(),
      dto.endDate ?? existing.endDate?.toISOString(),
    );

    try {
      const result = await this.payrollRepository.updateCompensation(
        currentUser.tenantId,
        compensationId,
        {
          ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
          ...(dto.basicSalary
            ? { basicSalary: new Prisma.Decimal(dto.basicSalary) }
            : {}),
          ...(dto.payFrequency ? { payFrequency: dto.payFrequency } : {}),
          ...(dto.effectiveDate
            ? { effectiveDate: new Date(dto.effectiveDate) }
            : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
            : {}),
          ...(dto.currency !== undefined
            ? { currency: dto.currency.trim().toUpperCase() }
            : {}),
          updatedById: currentUser.userId,
        },
      );

      if (result.count === 0) {
        throw new NotFoundException(
          'Employee compensation was not found for this tenant.',
        );
      }

      return this.listCompensations(currentUser.tenantId);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Compensation already exists for this employee on the selected effective date.',
      );
    }
  }

  async generateDraftRecords(currentUser: AuthenticatedUser, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      throw new BadRequestException(
        'Finalized payroll cycles cannot generate draft records again.',
      );
    }

    const preview = await this.buildPayrollPreview(currentUser.tenantId, cycle);

    if (preview.summary.eligibleEmployees === 0) {
      throw new BadRequestException(
        'No eligible employees are ready for payroll generation.',
      );
    }

    if (preview.summary.blockedEmployees > 0) {
      throw new BadRequestException(
        'Payroll generation is blocked. Review missing compensation or approved timesheets in the preview.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payrollRepository.deletePayrollRecordsForCycle(
        currentUser.tenantId,
        cycle.id,
        tx,
      );
      await this.payrollRepository.createPayrollRecordsMany(
        preview.eligibleEmployees.map((employee) => {
          if (!employee.calculatedPayroll) {
            throw new BadRequestException(
              'Payroll preview is missing calculated inputs for an eligible employee.',
            );
          }

          return {
            tenantId: currentUser.tenantId,
            employeeId: employee.employee.id,
            payrollCycleId: cycle.id,
            gross: new Prisma.Decimal(employee.calculatedPayroll.gross),
            deductions: new Prisma.Decimal(employee.calculatedPayroll.deductions),
            net: new Prisma.Decimal(employee.calculatedPayroll.net),
            status: PayrollRecordStatus.DRAFT,
            lineItems: employee.lineItems as Prisma.InputJsonValue,
            sourceTimesheetIds: employee.timesheetSummary
              ?.sourceTimesheetIds as Prisma.InputJsonValue,
            timesheetSummary:
              (employee.timesheetSummary as Prisma.InputJsonValue | null) ??
              undefined,
            adjustments: [] as Prisma.InputJsonValue,
            createdById: currentUser.userId,
            updatedById: currentUser.userId,
          };
        }),
        tx,
      );
      await this.payrollRepository.updateCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status:
            cycle.status === PayrollCycleStatus.DRAFT
              ? PayrollCycleStatus.PROCESSING
              : cycle.status,
          runDate: new Date(),
          updatedById: currentUser.userId,
        },
        tx,
      );
    });

    return this.getCycleById(currentUser.tenantId, cycleId);
  }

  async previewPayrollGeneration(tenantId: string, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(tenantId, cycleId);

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    return this.buildPayrollPreview(tenantId, cycle);
  }

  async reviewDraftRecords(currentUser: AuthenticatedUser, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      throw new BadRequestException('Finalized payroll cycles cannot be reviewed.');
    }

    if (cycle.records.length === 0) {
      throw new BadRequestException('Generate draft payroll records before review.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payrollRepository.updatePayrollRecordsForCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status: PayrollRecordStatus.REVIEWED,
          updatedById: currentUser.userId,
        },
        tx,
      );
      await this.payrollRepository.updateCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status: PayrollCycleStatus.REVIEW,
          updatedById: currentUser.userId,
        },
        tx,
      );
    });

    return this.getCycleById(currentUser.tenantId, cycleId);
  }

  async finalizeCycle(currentUser: AuthenticatedUser, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      return this.mapCycle(cycle);
    }

    if (cycle.records.length === 0) {
      throw new BadRequestException('Generate draft payroll before finalizing.');
    }

    const preview = await this.buildPayrollPreview(currentUser.tenantId, cycle);
    if (preview.summary.blockedEmployees > 0) {
      throw new BadRequestException(
        'Payroll cannot be finalized while required timesheets or compensation are missing.',
      );
    }

    const unreviewedRecords = cycle.records.filter(
      (record) => record.status !== PayrollRecordStatus.REVIEWED,
    );
    if (unreviewedRecords.length > 0) {
      throw new BadRequestException(
        'Review all draft payroll records before finalizing payroll.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payrollRepository.updatePayrollRecordsForCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status: PayrollRecordStatus.FINALIZED,
          updatedById: currentUser.userId,
        },
        tx,
      );
      await this.payrollRepository.updateCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status: PayrollCycleStatus.FINALIZED,
          updatedById: currentUser.userId,
        },
        tx,
      );
    });

    return this.getCycleById(currentUser.tenantId, cycleId);
  }

  async exportPayrollData(tenantId: string, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(tenantId, cycleId);

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    const rows = [
      [
        'employeeCode',
        'employeeName',
        'department',
        'businessUnit',
        'gross',
        'deductions',
        'net',
        'status',
        'sourceTimesheetIds',
        'totalWorkDays',
        'totalLeaveDays',
        'totalHolidays',
        'totalWeekendWorkDays',
        'totalHours',
        'flags',
      ],
      ...cycle.records.map((record) => {
        const summary = normalizeRecordTimesheetSummary(record.timesheetSummary);
        return [
          record.employee.employeeCode,
          `${record.employee.firstName} ${record.employee.lastName}`,
          record.employee.department?.name ?? '',
          record.employee.businessUnit?.name ??
            record.employee.user?.businessUnit?.name ??
            '',
          record.gross.toString(),
          record.deductions.toString(),
          record.net.toString(),
          record.status,
          normalizeStringArray(record.sourceTimesheetIds).join('|'),
          String(summary?.totalWorkDays ?? 0),
          String(summary?.totalLeaveDays ?? 0),
          String(summary?.totalHolidayDays ?? 0),
          String(summary?.totalWeekendWorkDays ?? 0),
          String(summary?.totalHours ?? 0),
          (summary?.flags ?? []).join('|'),
        ];
      }),
    ];

    return {
      fileName: `payroll-${cycle.periodStart.toISOString().slice(0, 10)}-${cycle.periodEnd.toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: rows.map(toCsvLine).join('\n'),
    };
  }

  private async buildPayrollPreview(
    tenantId: string,
    cycle: PayrollCycleWithRelations,
  ) {
    const payrollSettings =
      await this.tenantSettingsResolverService.getPayrollSettingsForBusinessUnit(
        tenantId,
        cycle.businessUnitId,
      );
    const employees = await this.payrollRepository.findEmployeesInPayrollScope(
      tenantId,
      cycle.periodStart,
      cycle.periodEnd,
      cycle.businessUnitId,
    );
    const employeeIds = employees.map((employee) => employee.id);
    const approvedTimesheets =
      await this.payrollRepository.findApprovedTimesheetsForPayroll(
        tenantId,
        cycle.periodStart,
        cycle.periodEnd,
        employeeIds,
      );
    const timesheetSummaryByEmployee =
      summarizePayrollTimesheets(approvedTimesheets);
    const timesheetsAreRequired =
      payrollSettings.payrollGenerationSource === 'approved_timesheets' ||
      payrollSettings.requireApprovedTimesheetsForPayroll;

    const eligibleEmployees: PayrollPreviewEmployeeItem[] = [];
    const missingTimesheets: PayrollPreviewEmployeeItem[] = [];
    const blockedEmployees: PayrollPreviewEmployeeItem[] = [];

    for (const employee of employees) {
      const compensation = employee.compensations[0] ?? null;
      const timesheetSummary = timesheetSummaryByEmployee.get(employee.id) ?? null;
      const employeeSummary = {
        employee: mapPreviewEmployee(employee),
        compensation: compensation
          ? {
              id: compensation.id,
              basicSalary: compensation.basicSalary.toString(),
              payFrequency: compensation.payFrequency,
              currency: compensation.currency,
              effectiveDate: compensation.effectiveDate,
            }
          : null,
        timesheetSummary,
      };

      if (!compensation) {
        blockedEmployees.push({
          ...employeeSummary,
          reason: 'Missing active compensation for the payroll period.',
        });
        continue;
      }

      if (timesheetsAreRequired && !timesheetSummary) {
        const missing = {
          ...employeeSummary,
          reason: 'Missing approved timesheet for the payroll period.',
        };
        missingTimesheets.push(missing);
        blockedEmployees.push(missing);
        continue;
      }

      const lineItems = [
        {
          code: 'BASIC',
          label: 'Basic Salary',
          type: 'EARNING',
          amount: compensation.basicSalary.toString(),
          payFrequency: compensation.payFrequency,
        },
        ...(timesheetSummary
          ? buildTimesheetPayrollLineItems(timesheetSummary, payrollSettings)
          : []),
      ];

      eligibleEmployees.push({
        ...employeeSummary,
        calculatedPayroll: {
          gross: compensation.basicSalary.toString(),
          deductions: '0',
          net: compensation.basicSalary.toString(),
          currency: compensation.currency,
        },
        lineItems,
        flags: timesheetSummary?.flags ?? [],
      });
    }

    return {
      cycle: {
        id: cycle.id,
        businessUnitId: cycle.businessUnitId,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        status: cycle.status,
      },
      settings: {
        payrollGenerationSource: payrollSettings.payrollGenerationSource,
        requireApprovedTimesheetsForPayroll:
          payrollSettings.requireApprovedTimesheetsForPayroll,
        includeLeavesInPayrollSummary:
          payrollSettings.includeLeavesInPayrollSummary,
        includeHolidaysInPayrollSummary:
          payrollSettings.includeHolidaysInPayrollSummary,
        includeWeekendWorkInPayrollSummary:
          payrollSettings.includeWeekendWorkInPayrollSummary,
      },
      summary: {
        employeesInScope: employees.length,
        eligibleEmployees: eligibleEmployees.length,
        missingTimesheets: missingTimesheets.length,
        blockedEmployees: blockedEmployees.length,
        approvedTimesheets: approvedTimesheets.length,
        existingRecords: cycle.records.length,
      },
      eligibleEmployees,
      missingTimesheets,
      blockedEmployees,
    };
  }

  private async ensureEmployeeBelongsToTenant(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findHierarchyNodeByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }
  }

  private mapCycle(cycle: PayrollCycleWithRelations) {
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      businessUnitId: cycle.businessUnitId,
      processingCycleId: cycle.processingCycleId,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      runDate: cycle.runDate,
      status: cycle.status,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
      counts: {
        records: cycle._count.records,
      },
      businessUnit: cycle.businessUnit,
      processingCycle: cycle.processingCycle,
      records: cycle.records.map((record) => ({
        id: record.id,
        employeeId: record.employeeId,
        payrollCycleId: record.payrollCycleId,
        gross: record.gross.toString(),
        deductions: record.deductions.toString(),
        net: record.net.toString(),
        status: record.status,
        lineItems: record.lineItems,
        sourceTimesheetIds: record.sourceTimesheetIds,
        timesheetSummary: record.timesheetSummary,
        adjustments: record.adjustments,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        employee: {
          id: record.employee.id,
          employeeCode: record.employee.employeeCode,
          firstName: record.employee.firstName,
          lastName: record.employee.lastName,
          preferredName: record.employee.preferredName,
          fullName: `${record.employee.firstName} ${record.employee.lastName}`,
          employmentStatus: record.employee.employmentStatus,
          department: record.employee.department,
          designation: record.employee.designation,
          businessUnit:
            record.employee.businessUnit ?? record.employee.user?.businessUnit ?? null,
        },
      })),
    };
  }

  private mapCompensation(compensation: EmployeeCompensationWithRelations) {
    return {
      id: compensation.id,
      tenantId: compensation.tenantId,
      employeeId: compensation.employeeId,
      basicSalary: compensation.basicSalary.toString(),
      payFrequency: compensation.payFrequency,
      effectiveDate: compensation.effectiveDate,
      endDate: compensation.endDate,
      currency: compensation.currency,
      createdAt: compensation.createdAt,
      updatedAt: compensation.updatedAt,
      employee: {
        id: compensation.employee.id,
        employeeCode: compensation.employee.employeeCode,
        firstName: compensation.employee.firstName,
        lastName: compensation.employee.lastName,
        preferredName: compensation.employee.preferredName,
        fullName: `${compensation.employee.firstName} ${compensation.employee.lastName}`,
        employmentStatus: compensation.employee.employmentStatus,
        department: compensation.employee.department,
        designation: compensation.employee.designation,
      },
    };
  }
}

function validatePeriodRange(periodStart: string, periodEnd: string) {
  if (new Date(periodEnd) < new Date(periodStart)) {
    throw new BadRequestException(
      'Payroll cycle end date cannot be earlier than start date.',
    );
  }
}

function validateCompensationRange(effectiveDate: string, endDate?: string | null) {
  if (endDate && new Date(endDate) < new Date(effectiveDate)) {
    throw new BadRequestException(
      'Compensation end date cannot be earlier than effective date.',
    );
  }
}

function resolvePayFrequency(value: string): PayFrequency {
  return Object.values(PayFrequency).includes(value as PayFrequency)
    ? (value as PayFrequency)
    : Object.values(PayFrequency)[0];
}

function handlePayrollWriteError(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }

  throw error;
}

type PayrollTimesheetSummary = {
  timesheetIds: string[];
  sourceTimesheetIds: string[];
  totalWorkDays: number;
  totalLeaveDays: number;
  totalHolidayDays: number;
  totalWeekendDays: number;
  totalWeekendWorkDays: number;
  totalWeekendWorkHours: number;
  totalHours: number;
  notes: string[];
  flags: string[];
  projects: Array<{ id: string; code: string | null; name: string }>;
};

type PayrollSummarySettings = {
  includeLeavesInPayrollSummary: boolean;
  includeHolidaysInPayrollSummary: boolean;
  includeWeekendWorkInPayrollSummary: boolean;
};

function summarizePayrollTimesheets(
  timesheets: Awaited<
    ReturnType<PayrollRepository['findApprovedTimesheetsForPayroll']>
  >,
) {
  const summaryByEmployee = new Map<string, PayrollTimesheetSummary>();

  for (const timesheet of timesheets) {
    const summary =
      summaryByEmployee.get(timesheet.employeeId) ??
      {
        timesheetIds: [],
        sourceTimesheetIds: [],
        totalWorkDays: 0,
        totalLeaveDays: 0,
        totalHolidayDays: 0,
        totalWeekendDays: 0,
        totalWeekendWorkDays: 0,
        totalWeekendWorkHours: 0,
        totalHours: 0,
        notes: [],
        flags: [],
        projects: [],
      };

    summary.timesheetIds.push(timesheet.id);
    summary.sourceTimesheetIds.push(timesheet.id);

    for (const entry of timesheet.entries) {
      const hours = Number(entry.hours);
      if (entry.entryType === TimesheetEntryType.ON_WORK) {
        summary.totalWorkDays += 1;
        summary.totalHours += hours;
        if (entry.isWeekend) {
          summary.totalWeekendWorkDays += 1;
          summary.totalWeekendWorkHours += hours;
        }
      }

      if (entry.entryType === TimesheetEntryType.ON_LEAVE) {
        summary.totalLeaveDays += 1;
      }

      if (entry.isHoliday) {
        summary.totalHolidayDays += 1;
      }

      if (entry.isWeekend) {
        summary.totalWeekendDays += 1;
      }

      if (entry.note?.trim()) {
        summary.notes.push(entry.note.trim());
      }

      if (entry.project && !summary.projects.some((project) => project.id === entry.project?.id)) {
        summary.projects.push(entry.project);
      }
    }

    if (summary.totalWeekendWorkDays > 0) {
      summary.flags.push('WEEKEND_WORK');
    }

    summaryByEmployee.set(timesheet.employeeId, summary);
  }

  return summaryByEmployee;
}

function buildTimesheetPayrollLineItems(
  summary: PayrollTimesheetSummary,
  settings: PayrollSummarySettings,
): PayrollLineItem[] {
  const lineItems: PayrollLineItem[] = [
    {
      code: 'TIMESHEET_REGULAR_HOURS',
      label: 'Approved Timesheet Regular Hours',
      type: 'INFO',
      amount: '0',
      quantity: summary.totalHours,
      sourceTimesheetIds: summary.timesheetIds,
    },
  ];

  if (settings.includeLeavesInPayrollSummary) {
    lineItems.push({
      code: 'TIMESHEET_LEAVE_DAYS',
      label: 'Approved Timesheet Leave Days',
      type: 'INFO',
      amount: '0',
      quantity: summary.totalLeaveDays,
      sourceTimesheetIds: summary.timesheetIds,
    });
  }

  if (settings.includeHolidaysInPayrollSummary) {
    lineItems.push({
      code: 'TIMESHEET_HOLIDAY_DAYS',
      label: 'Approved Timesheet Holiday Days',
      type: 'INFO',
      amount: '0',
      quantity: summary.totalHolidayDays,
      sourceTimesheetIds: summary.timesheetIds,
    });
  }

  if (settings.includeWeekendWorkInPayrollSummary) {
    lineItems.push({
      code: 'TIMESHEET_WEEKEND_WORK_HOURS',
      label: 'Approved Timesheet Weekend Work Hours',
      type: 'INFO',
      amount: '0',
      quantity: summary.totalWeekendWorkHours,
      sourceTimesheetIds: summary.timesheetIds,
    });
  }

  return lineItems;
}

function mapPreviewEmployee(
  employee: Awaited<ReturnType<PayrollRepository['findEmployeesInPayrollScope']>>[number],
) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    employmentStatus: employee.employmentStatus,
    email: employee.email,
    department: employee.department,
    designation: employee.designation,
    businessUnit: employee.businessUnit ?? employee.user?.businessUnit ?? null,
    operatingUnit: employee.businessUnit ?? employee.user?.businessUnit ?? null,
    recordType: employee.recordType,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeRecordTimesheetSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as {
    totalWorkDays?: number;
    totalLeaveDays?: number;
    totalHolidayDays?: number;
    totalWeekendWorkDays?: number;
    totalHours?: number;
    flags?: string[];
  };
}

function toCsvLine(values: Array<string>) {
  return values
    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
    .join(',');
}
