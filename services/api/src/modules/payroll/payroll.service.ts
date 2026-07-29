import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompensationPayFrequency,
  EmployeeCompensationHistoryStatus,
  PayComponentCalculationMethod,
  PayrollCalendarFrequency,
  PayrollCycleStatus,
  PayrollRecordStatus,
  PayFrequency,
  Prisma,
  TimesheetEntryType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigurationResolverService } from '../tenant-settings/configuration-resolver.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { CreateEmployeeCompensationDto } from './dto/create-employee-compensation.dto';
import {
  CreatePayrollCycleDto,
  GeneratePayrollPeriodsDto,
} from './dto/create-payroll-cycle.dto';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';
import { UpdateEmployeeCompensationDto } from './dto/update-employee-compensation.dto';
import {
  CompensationFormulaService,
  type FormulaComponentInput,
} from '../compensation/compensation-formula.service';
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

const payrollCompensationHistoryInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      employmentStatus: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      designation: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
  },
  salaryPackageRule: true,
  approvedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  components: {
    include: { payComponent: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.EmployeeCompensationHistoryInclude;

type PayrollCompensationHistoryWithRelations =
  Prisma.EmployeeCompensationHistoryGetPayload<{
    include: typeof payrollCompensationHistoryInclude;
  }>;

type PayrollPayComponentWithRules = Prisma.PayComponentGetPayload<{
  include: { eligibilityRules: true };
}>;

type PayrollPayComponentRule =
  PayrollPayComponentWithRules['eligibilityRules'][number];

type PayrollEmployeeContext = {
  id: string;
  organizationId: string | null;
  businessUnitId: string | null;
  departmentId: string | null;
  teamId: string | null;
  designationId: string | null;
  employeeLevelId: string | null;
  employmentStatus: string;
};

type PayrollCompensationComponentInput = {
  payComponentId: string;
  amount?: string | null;
  percentage?: string | null;
  overrideAmount?: string | null;
  overrideReason?: string | null;
  isRecurring?: boolean;
  displayOrder?: number;
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly payrollRepository: PayrollRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly prisma: PrismaService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly configurationResolverService: ConfigurationResolverService,
    private readonly compensationFormulaService: CompensationFormulaService,
    private readonly auditService: AuditService,
  ) {}

  async listCycles(tenantId: string, query: PayrollCycleQueryDto) {
    const { items, total } = await this.payrollRepository.findCycles(
      tenantId,
      query,
    );
    const ownerNames = await this.loadCycleOwnerNames(
      tenantId,
      items.map((cycle) => cycle.createdById),
    );

    return {
      items: items.map((cycle) =>
        this.mapCycle(
          cycle,
          cycle.createdById ? ownerNames.get(cycle.createdById) : undefined,
        ),
      ),
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
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }

    const ownerNames = await this.loadCycleOwnerNames(tenantId, [
      cycle.createdById,
    ]);
    return this.mapCycle(
      cycle,
      cycle.createdById ? ownerNames.get(cycle.createdById) : undefined,
    );
  }

  async createCycle(
    currentUser: AuthenticatedUser,
    dto: CreatePayrollCycleDto,
  ) {
    const fallbackRange = defaultPayrollCycleDateRange();
    const periodStart = dto.periodStart ?? fallbackRange.periodStart;
    const periodEnd = dto.periodEnd ?? fallbackRange.periodEnd;
    validatePeriodRange(periodStart, periodEnd);
    await this.validateCycleReferences(currentUser.tenantId, dto);
    await this.assertDefaultCycleScope(currentUser.tenantId, dto);

    try {
      const cycle = await this.payrollRepository.createCycle({
        tenantId: currentUser.tenantId,
        code: normalizeCycleCode(dto.code, dto.name ?? dto.cycleName),
        name: dto.name ?? dto.cycleName,
        description: dto.description,
        payFrequency: dto.payFrequency,
        payrollRegionId: dto.payrollRegionId,
        currencyCode: cleanOptionalString(dto.currencyCode)?.toUpperCase(),
        periodStartRule: dto.periodStartRule,
        periodEndRule: dto.periodEndRule,
        cutoffDay: dto.cutoffDay,
        paymentDay: dto.paymentDay,
        adjustDatesForWeekend: dto.adjustDatesForWeekend ?? false,
        adjustDatesForHoliday: dto.adjustDatesForHoliday ?? false,
        dateAdjustmentDirection: dto.dateAdjustmentDirection,
        defaultEmployerBankAccountId: dto.defaultEmployerBankAccountId,
        defaultGenerationSource: dto.defaultGenerationSource,
        payrollCalendarId: dto.payrollCalendarId,
        periodStart: parsePayrollDateOnly(periodStart),
        periodEnd: parsePayrollDateOnly(periodEnd),
        runDate: dto.runDate ? parsePayrollDateOnly(dto.runDate) : undefined,
        businessUnitId: dto.businessUnitId,
        processingCycleId: dto.processingCycleId,
        status: 'DRAFT',
        isDefault: dto.isDefault ?? false,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapCycle(cycle);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Payroll cycle already exists for this period.',
      );
    }
  }

  async updateCycle(
    currentUser: AuthenticatedUser,
    cycleId: string,
    dto: CreatePayrollCycleDto,
  ) {
    const existing = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );
    if (!existing) {
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }
    if (existing.status === PayrollCycleStatus.FINALIZED) {
      throw new ConflictException('Finalized payroll cycles cannot be edited.');
    }

    const periodStart = dto.periodStart ?? existing.periodStart.toISOString();
    const periodEnd = dto.periodEnd ?? existing.periodEnd.toISOString();
    validatePeriodRange(periodStart, periodEnd);
    await this.validateCycleReferences(currentUser.tenantId, dto);
    await this.assertDefaultCycleScope(
      currentUser.tenantId,
      {
        ...dto,
        businessUnitId:
          dto.businessUnitId !== undefined
            ? dto.businessUnitId
            : (existing.businessUnitId ?? undefined),
      },
      cycleId,
    );

    try {
      await this.payrollRepository.updateCycle(currentUser.tenantId, cycleId, {
        ...(dto.code !== undefined
          ? { code: normalizeCycleCode(dto.code) }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.cycleName !== undefined && dto.name === undefined
          ? { name: dto.cycleName }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.payFrequency !== undefined
          ? { payFrequency: dto.payFrequency }
          : {}),
        ...(dto.payrollRegionId !== undefined
          ? { payrollRegionId: dto.payrollRegionId }
          : {}),
        ...(dto.currencyCode !== undefined
          ? {
              currencyCode:
                cleanOptionalString(dto.currencyCode)?.toUpperCase() ?? null,
            }
          : {}),
        ...(dto.periodStartRule !== undefined
          ? { periodStartRule: dto.periodStartRule }
          : {}),
        ...(dto.periodEndRule !== undefined
          ? { periodEndRule: dto.periodEndRule }
          : {}),
        ...(dto.cutoffDay !== undefined ? { cutoffDay: dto.cutoffDay } : {}),
        ...(dto.paymentDay !== undefined ? { paymentDay: dto.paymentDay } : {}),
        ...(dto.adjustDatesForWeekend !== undefined
          ? { adjustDatesForWeekend: dto.adjustDatesForWeekend }
          : {}),
        ...(dto.adjustDatesForHoliday !== undefined
          ? { adjustDatesForHoliday: dto.adjustDatesForHoliday }
          : {}),
        ...(dto.dateAdjustmentDirection !== undefined
          ? { dateAdjustmentDirection: dto.dateAdjustmentDirection }
          : {}),
        ...(dto.defaultEmployerBankAccountId !== undefined
          ? { defaultEmployerBankAccountId: dto.defaultEmployerBankAccountId }
          : {}),
        ...(dto.defaultGenerationSource !== undefined
          ? { defaultGenerationSource: dto.defaultGenerationSource }
          : {}),
        ...(dto.payrollCalendarId !== undefined
          ? { payrollCalendarId: dto.payrollCalendarId }
          : {}),
        ...(dto.periodStart !== undefined
          ? { periodStart: parsePayrollDateOnly(periodStart) }
          : {}),
        ...(dto.periodEnd !== undefined
          ? { periodEnd: parsePayrollDateOnly(periodEnd) }
          : {}),
        ...(dto.runDate !== undefined
          ? {
              runDate: dto.runDate ? parsePayrollDateOnly(dto.runDate) : null,
            }
          : {}),
        ...(dto.businessUnitId !== undefined
          ? { businessUnitId: dto.businessUnitId }
          : {}),
        ...(dto.processingCycleId !== undefined
          ? { processingCycleId: dto.processingCycleId }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        updatedById: currentUser.userId,
      });

      return this.getCycleById(currentUser.tenantId, cycleId);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Payroll cycle already exists for this period.',
      );
    }
  }

  async generatePeriods(
    currentUser: AuthenticatedUser,
    cycleId: string,
    dto: GeneratePayrollPeriodsDto,
  ) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );
    if (!cycle) {
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }
    if (!cycle.payrollCalendarId || !cycle.payrollCalendar) {
      throw new BadRequestException(
        'Select an active payroll calendar before generating periods.',
      );
    }
    if (!cycle.payrollCalendar.isActive) {
      throw new BadRequestException(
        'The selected payroll calendar is inactive.',
      );
    }
    const payrollCalendarId = cycle.payrollCalendarId;
    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      throw new ConflictException(
        'Finalized payroll cycles cannot generate new periods.',
      );
    }

    const requestedStart = dto.startDate
      ? startOfUtcDay(new Date(dto.startDate))
      : startOfUtcDay(cycle.periodStart);
    const cycleStart = startOfUtcDay(cycle.periodStart);
    const cycleEnd = startOfUtcDay(cycle.periodEnd);
    if (
      Number.isNaN(requestedStart.getTime()) ||
      requestedStart < cycleStart ||
      requestedStart > cycleEnd
    ) {
      throw new BadRequestException(
        'Generation start date must be inside the payroll cycle date range.',
      );
    }

    const frequency = cycle.payFrequency ?? cycle.payrollCalendar.frequency;
    if (frequency !== cycle.payrollCalendar.frequency) {
      throw new BadRequestException(
        'Payroll cycle and calendar frequencies must match.',
      );
    }
    const candidates = buildPayrollPeriodCandidates({
      startDate: requestedStart,
      cycleEnd,
      frequency,
      count: dto.periodCount ?? 12,
      cycleName: cycle.name ?? cycle.payrollCalendar.name,
    });
    if (!candidates.length) {
      throw new BadRequestException(
        'No payroll periods fit inside the payroll cycle date range.',
      );
    }

    const holidayRules = await this.loadCycleHolidayRules(
      currentUser.tenantId,
      cycle.payrollRegion?.holidayCalendarId,
      candidates[0].periodStart,
      candidates[candidates.length - 1].periodEnd,
    );
    const weekendDays = new Set<string>(
      cycle.payrollRegion?.weekendDays?.length
        ? cycle.payrollRegion.weekendDays
        : ['SATURDAY', 'SUNDAY'],
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${currentUser.tenantId}:${payrollCalendarId}`}))`,
        );
        const created: Array<{
          id: string;
          name: string;
          periodStart: Date;
          periodEnd: Date;
        }> = [];
        const skipped: string[] = [];

        for (const candidate of candidates) {
          const overlap = await tx.payrollPeriod.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              payrollCalendarId,
              periodStart: { lte: candidate.periodEnd },
              periodEnd: { gte: candidate.periodStart },
            },
          });
          if (overlap) {
            const isExact =
              overlap.periodStart.getTime() ===
                candidate.periodStart.getTime() &&
              overlap.periodEnd.getTime() === candidate.periodEnd.getTime();
            if (
              !isExact ||
              (overlap.payrollCycleId && overlap.payrollCycleId !== cycle.id)
            ) {
              throw new ConflictException(
                `Generated period ${candidate.name} overlaps existing period ${overlap.name}.`,
              );
            }
            if (!overlap.payrollCycleId) {
              await tx.payrollPeriod.update({
                where: { id: overlap.id },
                data: { payrollCycleId: cycle.id },
              });
            }
            skipped.push(overlap.id);
            continue;
          }

          const fiscalYear = await tx.fiscalYear.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              status: 'ACTIVE',
              startDate: { lte: candidate.periodStart },
              endDate: { gte: candidate.periodEnd },
            },
            select: { id: true },
            orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
          });
          const cutoffDate = cycle.cutoffDay
            ? adjustPayrollDate(
                configuredDayInMonth(
                  candidate.periodEnd,
                  cycle.cutoffDay,
                  false,
                ),
                cycle,
                weekendDays,
                holidayRules,
              )
            : null;
          const paymentDate = cycle.paymentDay
            ? adjustPayrollDate(
                configuredDayInMonth(
                  candidate.periodEnd,
                  cycle.paymentDay,
                  true,
                ),
                cycle,
                weekendDays,
                holidayRules,
              )
            : null;
          const period = await tx.payrollPeriod.create({
            data: {
              tenantId: currentUser.tenantId,
              payrollCalendarId,
              payrollCycleId: cycle.id,
              fiscalYearId: fiscalYear?.id,
              name: candidate.name,
              periodStart: candidate.periodStart,
              periodEnd: candidate.periodEnd,
              cutoffDate,
              paymentDate,
              status: 'OPEN',
            },
            select: {
              id: true,
              name: true,
              periodStart: true,
              periodEnd: true,
            },
          });
          created.push(period);
        }

        return { created, skipped };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      businessUnitId: cycle.businessUnitId,
      actorUserId: currentUser.userId,
      action: 'PAYROLL_PERIODS_GENERATED',
      entityType: 'PayrollCycle',
      entityId: cycle.id,
      sourceModule: 'payroll',
      afterSnapshot: {
        payrollCalendarId: cycle.payrollCalendarId,
        requestedCount: dto.periodCount ?? 12,
        createdIds: result.created.map((period) => period.id),
        skippedIds: result.skipped,
      },
    });

    return {
      payrollCycleId: cycle.id,
      payrollCalendarId: cycle.payrollCalendarId,
      frequency,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
      periods: result.created,
    };
  }

  async listCompensations(tenantId: string) {
    await this.ensureLegacyCompensationsAreComponentized(tenantId);
    const items = await this.prisma.employeeCompensationHistory.findMany({
      where: { tenantId },
      include: payrollCompensationHistoryInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return items.map((compensation) =>
      this.mapComponentizedCompensation(compensation),
    );
  }

  async getCompensation(tenantId: string, compensationId: string) {
    let compensation = await this.findComponentizedCompensation(
      tenantId,
      compensationId,
    );
    if (!compensation) {
      const legacy = await this.payrollRepository.findCompensationById(
        tenantId,
        compensationId,
      );
      compensation = legacy
        ? await this.createComponentizedCompensationFromLegacy(legacy)
        : null;
    }
    if (!compensation) {
      throw new NotFoundException(
        'Employee compensation was not found for this tenant.',
      );
    }
    compensation =
      await this.refreshConfiguredCompensationComponents(compensation);
    return this.mapComponentizedCompensation(compensation);
  }

  async createCompensation(
    currentUser: AuthenticatedUser,
    dto: CreateEmployeeCompensationDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      currentUser.tenantId,
      dto.employeeId,
    );
    validateCompensationRange(dto.effectiveDate, dto.endDate);
    const payrollSettings =
      await this.tenantSettingsResolverService.getPayrollSettings(
        currentUser.tenantId,
      );
    const currencyResolution =
      await this.configurationResolverService.resolvePayrollCurrency({
        tenantId: currentUser.tenantId,
        employeeId: dto.employeeId,
        effectiveDate: new Date(dto.effectiveDate),
      });

    const currency = (
      dto.currency?.trim().toUpperCase() ??
      currencyResolution.payrollCurrency ??
      payrollSettings.defaultCurrency
    )
      .trim()
      .toUpperCase();
    const baseAmount = this.resolveBaseAmount(dto.basicSalary, dto.components);
    const components = await this.preparePayrollCompensationComponents(
      currentUser.tenantId,
      dto.components,
      baseAmount,
      dto.employeeId,
      new Date(dto.effectiveDate),
    );
    const totals = summarizePayrollCompensationComponents(components);
    const status = toCompensationHistoryStatus(dto.payrollStatus);

    try {
      const compensation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.employeeCompensationHistory.create({
          data: {
            tenantId: currentUser.tenantId,
            employeeId: dto.employeeId,
            effectiveFrom: new Date(dto.effectiveDate),
            effectiveTo: dto.endDate ? new Date(dto.endDate) : null,
            payFrequency: toCompensationPayFrequency(
              dto.payFrequency ??
                resolvePayFrequency(payrollSettings.payFrequency),
            ),
            currencyCode: currency,
            baseAmount,
            ...totals,
            status,
            approvedById: status === 'ACTIVE' ? currentUser.userId : null,
            notes: trimOptional(dto.notes),
            createdBy: currentUser.userId,
          },
        });

        if (components.length) {
          await tx.employeeCompensationComponent.createMany({
            data: components.map((component) => ({
              tenantId: currentUser.tenantId,
              compensationHistoryId: created.id,
              ...employeeCompensationComponentCreateData(component),
            })),
          });
        }

        return tx.employeeCompensationHistory.findFirst({
          where: { tenantId: currentUser.tenantId, id: created.id },
          include: payrollCompensationHistoryInclude,
        });
      });

      if (!compensation) {
        throw new NotFoundException(
          'Employee compensation was not found for this tenant.',
        );
      }

      return this.mapComponentizedCompensation(compensation);
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
    let existing = await this.findComponentizedCompensation(
      currentUser.tenantId,
      compensationId,
    );

    if (!existing) {
      const legacy = await this.payrollRepository.findCompensationById(
        currentUser.tenantId,
        compensationId,
      );
      existing = legacy
        ? await this.createComponentizedCompensationFromLegacy(legacy)
        : null;
    }

    if (!existing) {
      throw new NotFoundException(
        'Employee compensation was not found for this tenant.',
      );
    }

    if (dto.employeeId) {
      await this.ensureEmployeeBelongsToTenant(
        currentUser.tenantId,
        dto.employeeId,
      );
    }

    validateCompensationRange(
      dto.effectiveDate ?? existing.effectiveFrom.toISOString(),
      dto.endDate ?? existing.effectiveTo?.toISOString(),
    );

    try {
      const baseAmount =
        dto.basicSalary !== undefined || dto.components !== undefined
          ? this.resolveBaseAmount(
              dto.basicSalary ?? existing.baseAmount.toString(),
              dto.components,
            )
          : existing.baseAmount;
      const components =
        dto.components !== undefined
          ? await this.preparePayrollCompensationComponents(
              currentUser.tenantId,
              dto.components,
              baseAmount,
              dto.employeeId ?? existing.employeeId,
              dto.effectiveDate
                ? new Date(dto.effectiveDate)
                : existing.effectiveFrom,
              existing.components,
            )
          : null;
      const totals = components
        ? summarizePayrollCompensationComponents(components)
        : undefined;
      const status = dto.payrollStatus
        ? toCompensationHistoryStatus(dto.payrollStatus)
        : undefined;
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.employeeCompensationHistory.update({
          where: { id: compensationId },
          data: {
            ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
            ...(dto.basicSalary !== undefined || dto.components !== undefined
              ? { baseAmount }
              : {}),
            ...(dto.payFrequency
              ? { payFrequency: toCompensationPayFrequency(dto.payFrequency) }
              : {}),
            ...(dto.effectiveDate
              ? { effectiveFrom: new Date(dto.effectiveDate) }
              : {}),
            ...(dto.endDate !== undefined
              ? { effectiveTo: dto.endDate ? new Date(dto.endDate) : null }
              : {}),
            ...(dto.currency !== undefined
              ? { currencyCode: dto.currency.trim().toUpperCase() }
              : {}),
            ...(status
              ? {
                  status,
                  approvedById:
                    status === 'ACTIVE'
                      ? currentUser.userId
                      : existing.approvedById,
                }
              : {}),
            ...(dto.notes !== undefined
              ? { notes: trimNullable(dto.notes) }
              : {}),
            ...(totals ? totals : {}),
          },
        });

        if (components) {
          await tx.employeeCompensationComponent.deleteMany({
            where: {
              tenantId: currentUser.tenantId,
              compensationHistoryId: compensationId,
            },
          });
          if (components.length) {
            await tx.employeeCompensationComponent.createMany({
              data: components.map((component) => ({
                tenantId: currentUser.tenantId,
                compensationHistoryId: compensationId,
                ...employeeCompensationComponentCreateData(component),
              })),
            });
          }
        }

        return tx.employeeCompensationHistory.findFirst({
          where: { tenantId: currentUser.tenantId, id: compensationId },
          include: payrollCompensationHistoryInclude,
        });
      });

      if (!result) {
        throw new NotFoundException(
          'Employee compensation was not found for this tenant.',
        );
      }
      return this.mapComponentizedCompensation(result);
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
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
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
            deductions: new Prisma.Decimal(
              employee.calculatedPayroll.deductions,
            ),
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
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }

    return this.buildPayrollPreview(tenantId, cycle);
  }

  async reviewDraftRecords(currentUser: AuthenticatedUser, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );

    if (!cycle) {
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      throw new BadRequestException(
        'Finalized payroll cycles cannot be reviewed.',
      );
    }

    if (cycle.records.length === 0) {
      throw new BadRequestException(
        'Generate draft payroll records before review.',
      );
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
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      return this.mapCycle(cycle);
    }

    if (cycle.records.length === 0) {
      throw new BadRequestException(
        'Generate draft payroll before finalizing.',
      );
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
      throw new NotFoundException(
        'Payroll cycle was not found for this tenant.',
      );
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
        const summary = normalizeRecordTimesheetSummary(
          record.timesheetSummary,
        );
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
      payrollSettings.payrollGenerationSource === 'TIMESHEETS' ||
      payrollSettings.payrollGenerationSource === 'HYBRID' ||
      payrollSettings.requireApprovedTimesheetsForPayroll;

    const eligibleEmployees: PayrollPreviewEmployeeItem[] = [];
    const missingTimesheets: PayrollPreviewEmployeeItem[] = [];
    const blockedEmployees: PayrollPreviewEmployeeItem[] = [];

    for (const employee of employees) {
      const compensation = employee.compensations[0] ?? null;
      const timesheetSummary =
        timesheetSummaryByEmployee.get(employee.id) ?? null;
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

  private async ensureEmployeeBelongsToTenant(
    tenantId: string,
    employeeId: string,
  ) {
    const employee =
      await this.employeesRepository.findHierarchyNodeByIdAndTenant(
        tenantId,
        employeeId,
      );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }
  }

  private async validateCycleReferences(
    tenantId: string,
    dto: CreatePayrollCycleDto,
  ) {
    if (dto.payrollCalendarId) {
      const calendar = await this.prisma.payrollCalendar.findFirst({
        where: {
          tenantId,
          id: dto.payrollCalendarId,
          isActive: true,
        },
        select: {
          id: true,
          frequency: true,
          currencyCode: true,
          businessUnitId: true,
        },
      });
      if (!calendar) {
        throw new BadRequestException('Select an active payroll calendar.');
      }
      if (dto.payFrequency && dto.payFrequency !== calendar.frequency) {
        throw new BadRequestException(
          'Payroll cycle and calendar frequencies must match.',
        );
      }
      if (
        dto.currencyCode &&
        dto.currencyCode.toUpperCase() !== calendar.currencyCode.toUpperCase()
      ) {
        throw new BadRequestException(
          'Payroll cycle and calendar currencies must match.',
        );
      }
      if (
        dto.businessUnitId &&
        calendar.businessUnitId &&
        dto.businessUnitId !== calendar.businessUnitId
      ) {
        throw new BadRequestException(
          'Payroll cycle and calendar business units must match.',
        );
      }
    }

    if (dto.currencyCode) {
      const currency = await this.prisma.currency.findFirst({
        where: {
          tenantId,
          code: dto.currencyCode.toUpperCase(),
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!currency) {
        throw new BadRequestException('Select an active currency.');
      }
    }

    if (dto.payrollRegionId) {
      const region = await this.prisma.payrollRegion.findFirst({
        where: { tenantId, id: dto.payrollRegionId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!region) {
        throw new BadRequestException('Select an active payroll region.');
      }
    }

    if (dto.defaultEmployerBankAccountId) {
      const account = await this.prisma.employerBankAccount.findFirst({
        where: {
          tenantId,
          id: dto.defaultEmployerBankAccountId,
          isActive: true,
          accountPurpose: 'PAYROLL',
        },
        select: { id: true },
      });

      if (!account) {
        throw new BadRequestException(
          'Select an active payroll employer bank account.',
        );
      }
    }
  }

  private async assertDefaultCycleScope(
    tenantId: string,
    dto: CreatePayrollCycleDto,
    excludeId?: string,
  ) {
    if (!dto.isDefault) return;
    const existing = await this.prisma.payrollCycle.findFirst({
      where: {
        tenantId,
        isDefault: true,
        businessUnitId: dto.businessUnitId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Only one default payroll cycle is allowed per employee scope.',
      );
    }
  }

  private async loadCycleOwnerNames(
    tenantId: string,
    values: Array<string | null | undefined>,
  ) {
    const ids = [...new Set(values.filter((value): value is string => !!value))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return new Map(
      users.map((user) => [
        user.id,
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      ]),
    );
  }

  private async loadCycleHolidayRules(
    tenantId: string,
    holidayCalendarId: string | null | undefined,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayrollHolidayRules> {
    if (!holidayCalendarId) {
      return { exactDates: new Set(), recurringDates: new Set() };
    }
    const lookupEnd = addUtcDays(periodEnd, 62);
    const holidays = await this.prisma.holiday.findMany({
      where: {
        tenantId,
        holidayCalendarId,
        isActive: true,
        status: 'ACTIVE',
        OR: [
          { isRecurring: true },
          {
            holidayDate: { gte: addUtcDays(periodStart, -62), lte: lookupEnd },
          },
        ],
      },
      select: { holidayDate: true, isRecurring: true },
    });
    return {
      exactDates: new Set(
        holidays
          .filter((holiday) => !holiday.isRecurring)
          .map((holiday) => dateKey(holiday.holidayDate)),
      ),
      recurringDates: new Set(
        holidays
          .filter((holiday) => holiday.isRecurring)
          .map((holiday) => dateKey(holiday.holidayDate).slice(5)),
      ),
    };
  }

  private mapCycle(cycle: PayrollCycleWithRelations, ownerName?: string) {
    const today = startOfUtcDay(new Date());
    const nextPeriod = cycle.periods.find(
      (period) => startOfUtcDay(period.periodEnd) >= today,
    );
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      code: cycle.code,
      name:
        cycle.name ??
        cycle.processingCycle?.name ??
        `${cycle.periodStart.toISOString().slice(0, 10)} - ${cycle.periodEnd
          .toISOString()
          .slice(0, 10)}`,
      description: cycle.description,
      payFrequency: cycle.payFrequency ?? cycle.processingCycle?.cycleType,
      payrollRegionId: cycle.payrollRegionId,
      currencyCode: cycle.currencyCode ?? cycle.payrollRegion?.currencyCode,
      periodStartRule: cycle.periodStartRule,
      periodEndRule: cycle.periodEndRule,
      cutoffDay: cycle.cutoffDay,
      paymentDay: cycle.paymentDay,
      adjustDatesForWeekend: cycle.adjustDatesForWeekend,
      adjustDatesForHoliday: cycle.adjustDatesForHoliday,
      dateAdjustmentDirection: cycle.dateAdjustmentDirection,
      defaultEmployerBankAccountId: cycle.defaultEmployerBankAccountId,
      defaultGenerationSource: cycle.defaultGenerationSource,
      payrollCalendarId: cycle.payrollCalendarId,
      payrollCalendarName: cycle.payrollCalendar?.name ?? null,
      businessUnitId: cycle.businessUnitId,
      processingCycleId: cycle.processingCycleId,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      runDate: cycle.runDate,
      status: cycle.status,
      isDefault: cycle.isDefault,
      createdById: cycle.createdById,
      ownerName: ownerName ?? null,
      updatedById: cycle.updatedById,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
      counts: {
        records: cycle._count.records,
        periods: cycle._count.periods,
      },
      assignedEmployees: cycle._count.records,
      employeeScope: cycle.businessUnit?.name ?? 'All employees',
      periodRule:
        [cycle.periodStartRule, cycle.periodEndRule]
          .filter((value): value is string => Boolean(value))
          .map(friendlyEnum)
          .join(' / ') ||
        'Explicit dates',
      paymentRule: cycle.paymentDay
        ? `Day ${cycle.paymentDay}${cycle.dateAdjustmentDirection ? ` · ${friendlyEnum(cycle.dateAdjustmentDirection)}` : ''}`
        : 'Not configured',
      nextPeriod: nextPeriod
        ? `${nextPeriod.name} · ${nextPeriod.periodStart.toISOString().slice(0, 10)}`
        : 'Not generated',
      businessUnit: cycle.businessUnit,
      processingCycle: cycle.processingCycle,
      payrollRegion: cycle.payrollRegion,
      defaultEmployerBankAccount: cycle.defaultEmployerBankAccount,
      payrollCalendar: cycle.payrollCalendar,
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
            record.employee.businessUnit ??
            record.employee.user?.businessUnit ??
            null,
        },
      })),
    };
  }

  private findComponentizedCompensation(
    tenantId: string,
    compensationId: string,
  ) {
    return this.prisma.employeeCompensationHistory.findFirst({
      where: { tenantId, id: compensationId },
      include: payrollCompensationHistoryInclude,
    });
  }

  private async ensureLegacyCompensationsAreComponentized(tenantId: string) {
    const legacyItems =
      await this.payrollRepository.listCompensations(tenantId);
    await Promise.all(
      legacyItems.map((item) =>
        this.createComponentizedCompensationFromLegacy(item),
      ),
    );
  }

  private async createComponentizedCompensationFromLegacy(
    legacy: EmployeeCompensationWithRelations,
  ) {
    const existing = await this.findComponentizedCompensation(
      legacy.tenantId,
      legacy.id,
    );
    if (existing) return existing;

    const basicComponent = await this.prisma.payComponent.findFirst({
      where: {
        tenantId: legacy.tenantId,
        isActive: true,
        OR: [
          { code: 'BASIC' },
          { componentCategory: 'BASIC' },
          { name: { contains: 'basic', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    });
    const baseAmount = legacy.basicSalary;
    const components = await this.preparePayrollCompensationComponents(
      legacy.tenantId,
      basicComponent
        ? [
            {
              payComponentId: basicComponent.id,
              amount: baseAmount.toString(),
            },
          ]
        : [],
      baseAmount,
      legacy.employeeId,
      legacy.effectiveDate,
    );
    const totals = summarizePayrollCompensationComponents(components);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeCompensationHistory.create({
        data: {
          id: legacy.id,
          tenantId: legacy.tenantId,
          employeeId: legacy.employeeId,
          effectiveFrom: legacy.effectiveDate,
          effectiveTo: legacy.endDate,
          payFrequency: toCompensationPayFrequency(legacy.payFrequency),
          currencyCode: legacy.currency,
          baseAmount,
          ...totals,
          status: toCompensationHistoryStatus(legacy.payrollStatus),
          notes: legacy.notes,
          createdBy: legacy.createdById,
          approvedById:
            toCompensationHistoryStatus(legacy.payrollStatus) === 'ACTIVE'
              ? legacy.updatedById
              : null,
        },
      });

      if (components.length) {
        await tx.employeeCompensationComponent.createMany({
          data: components.map((component) => ({
            tenantId: legacy.tenantId,
            compensationHistoryId: created.id,
            ...employeeCompensationComponentCreateData(component),
          })),
        });
      }

      return tx.employeeCompensationHistory.findFirst({
        where: { tenantId: legacy.tenantId, id: created.id },
        include: payrollCompensationHistoryInclude,
      });
    });
  }

  private resolveBaseAmount(
    basicSalary: string,
    components?: readonly PayrollCompensationComponentInput[],
  ) {
    const normalizedBase = basicSalary.trim();
    if (normalizedBase) return new Prisma.Decimal(normalizedBase);

    const firstEnteredAmount = components?.find((component) => {
      const value = component.amount?.trim();
      return value && new Prisma.Decimal(value).gt(0);
    });
    return new Prisma.Decimal(firstEnteredAmount?.amount ?? 0);
  }

  private async preparePayrollCompensationComponents(
    tenantId: string,
    components: readonly PayrollCompensationComponentInput[] | undefined,
    baseAmount: Prisma.Decimal,
    employeeId: string,
    effectiveDate: Date,
    existingComponents: readonly PayrollCompensationHistoryWithRelations['components'][number][] = [],
    options: { pruneInapplicableInputs?: boolean } = {},
  ) {
    const inputComponents = components ?? [];
    const inputComponentIds = [
      ...new Set(inputComponents.map((component) => component.payComponentId)),
    ];
    const payComponents = await this.prisma.payComponent.findMany({
      where: {
        tenantId,
        isActive: true,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: { lte: effectiveDate } },
            ],
          },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: effectiveDate } },
            ],
          },
        ],
        ...(inputComponentIds.length ? {} : { employeeVisible: true }),
      },
      include: {
        eligibilityRules: {
          where: {
            isActive: true,
            AND: [
              {
                OR: [
                  { effectiveFrom: null },
                  { effectiveFrom: { lte: effectiveDate } },
                ],
              },
              {
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gte: effectiveDate } },
                ],
              },
            ],
          },
          orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { componentType: 'asc' },
        { code: 'asc' },
      ],
    });
    const employeeContext = await this.resolveEmployeePayrollContext(
      tenantId,
      employeeId,
    );
    const applicableComponents = payComponents
      .map((payComponent) => ({
        payComponent,
        rule: selectPayComponentRule(payComponent, employeeContext),
      }))
      .filter(({ payComponent, rule }) =>
        isPayComponentApplicable(payComponent, rule),
      );
    const payComponentById = new Map(
      applicableComponents.map(({ payComponent }) => [
        payComponent.id,
        payComponent,
      ]),
    );
    const missingInputIds = inputComponentIds.filter(
      (id) => !payComponentById.has(id),
    );
    if (missingInputIds.length && !options.pruneInapplicableInputs) {
      throw new BadRequestException(
        'One or more compensation components reference an inactive or missing pay component.',
      );
    }
    const inputByComponentId = new Map(
      inputComponents
        .filter((component) => payComponentById.has(component.payComponentId))
        .map((component) => [component.payComponentId, component]),
    );
    const existingByComponentId = new Map(
      existingComponents.map((component) => [
        component.payComponentId,
        component,
      ]),
    );
    const formulaInputs = applicableComponents.map(
      ({ payComponent, rule }): FormulaComponentInput => {
        const component = inputByComponentId.get(payComponent.id);
        const amount = resolvePayrollComponentAmount(
          payComponent,
          rule,
          component,
          baseAmount,
        );
        const calculationMethod = resolvePayrollComponentCalculationMethod(
          payComponent,
          rule,
        );
        return {
          id: payComponent.id,
          payComponentId: payComponent.id,
          code: payComponent.code,
          name: payComponent.name,
          calculationMethod,
          fixedAmount: amount,
          percentage: resolvePayrollComponentPercentage(
            payComponent,
            rule,
            component,
          ),
          percentageBaseComponentId:
            rule?.percentageBaseComponentId ??
            payComponent.percentageBaseComponentId,
          formulaExpression:
            rule?.formulaExpression ?? payComponent.formulaExpression,
          minimumAmount: payComponent.minimumAmount,
          maximumAmount: payComponent.maximumAmount,
          roundingMethod: payComponent.roundingMethod,
        };
      },
    );
    const calculatedById = new Map(
      this.compensationFormulaService
        .resolveComponents(formulaInputs, {
          basic: baseAmount,
          gross: baseAmount,
        })
        .map((component) => [
          component.payComponentId,
          component.calculatedAmount,
        ]),
    );

    return applicableComponents.map(({ payComponent, rule }) => {
      const input = inputByComponentId.get(payComponent.id);
      const amount = resolvePayrollComponentAmount(
        payComponent,
        rule,
        input,
        baseAmount,
      );
      const calculationMethod = resolvePayrollComponentCalculationMethod(
        payComponent,
        rule,
      );
      const calculatedAmount =
        calculationMethod === 'FIXED'
          ? amount
          : (calculatedById.get(payComponent.id) ?? new Prisma.Decimal(0));
      const override = resolveEmployeeOverride(
        input,
        existingByComponentId.get(payComponent.id),
      );
      const effectiveAmount =
        override.isOverridden && override.overrideAmount
          ? override.overrideAmount
          : calculatedAmount;
      return {
        payComponentId: payComponent.id,
        amount:
          calculationMethod === 'FORMULA' || calculationMethod === 'PERCENTAGE'
            ? null
            : amount,
        percentage: resolvePayrollComponentPercentage(
          payComponent,
          rule,
          input,
        ),
        configuredAmount: amount,
        calculatedAmount,
        overrideAmount: override.overrideAmount,
        effectiveAmount,
        isOverridden: override.isOverridden,
        overrideReason: override.overrideReason,
        overriddenById: override.overriddenById,
        overriddenAt: override.overriddenAt,
        overrideExpiresAt: override.overrideExpiresAt,
        ruleAppliedId: rule?.id ?? null,
        calculationSource: rule ? 'ELIGIBILITY_RULE' : 'PAY_COMPONENT',
        calculationSnapshot: buildCalculationSnapshot(payComponent, rule),
        effectiveFrom: rule?.effectiveFrom ?? payComponent.effectiveFrom,
        effectiveTo: rule?.effectiveTo ?? payComponent.effectiveTo,
        formulaExpression:
          rule?.formulaExpression ?? payComponent.formulaExpression,
        calculationMethodSnapshot: calculationMethod,
        componentType: payComponent.componentType,
        affectsGrossPay: payComponent.affectsGrossPay,
        affectsNetPay: payComponent.affectsNetPay,
        isTaxable: payComponent.isTaxable,
        isRecurring: input?.isRecurring ?? payComponent.isRecurring,
        isEmployeeEditable: true,
        displayOrder: input?.displayOrder ?? payComponent.displayOrder,
      };
    });
  }

  private async refreshConfiguredCompensationComponents(
    compensation: PayrollCompensationHistoryWithRelations,
  ): Promise<PayrollCompensationHistoryWithRelations> {
    const inputs = compensation.components.map((component) => ({
      payComponentId: component.payComponentId,
      ...refreshCompensationComponentInput(component),
      overrideAmount: component.overrideAmount?.toString() ?? undefined,
      overrideReason: component.overrideReason ?? undefined,
      isRecurring: component.isRecurring,
      displayOrder: component.displayOrder,
    }));
    const components = await this.preparePayrollCompensationComponents(
      compensation.tenantId,
      inputs,
      compensation.baseAmount,
      compensation.employeeId,
      compensation.effectiveFrom,
      compensation.components,
      { pruneInapplicableInputs: true },
    );
    const totals = summarizePayrollCompensationComponents(components);
    const currentComponentIds = new Set(
      compensation.components.map((component) => component.payComponentId),
    );
    const hasMissingComponents = components.some(
      (component) => !currentComponentIds.has(component.payComponentId),
    );
    const hasStaleComponents =
      hasMissingComponents ||
      components.length !== compensation.components.length ||
      components.some((component) => {
        const current = compensation.components.find(
          (item) => item.payComponentId === component.payComponentId,
        );
        return (
          !current ||
          !current.calculatedAmount.equals(component.calculatedAmount) ||
          !current.effectiveAmount.equals(component.effectiveAmount) ||
          current.isOverridden !== component.isOverridden ||
          (current.overrideAmount ?? null)?.toString() !==
            (component.overrideAmount ?? null)?.toString() ||
          (current.ruleAppliedId ?? null) !== component.ruleAppliedId ||
          (current.calculationSource ?? null) !== component.calculationSource ||
          (current.amount ?? null)?.toString() !==
            (component.amount ?? null)?.toString() ||
          (current.percentage ?? null)?.toString() !==
            (component.percentage ?? null)?.toString()
        );
      }) ||
      !compensation.grossEarnings.equals(totals.grossEarnings) ||
      !compensation.totalDeductions.equals(totals.totalDeductions) ||
      !compensation.estimatedNetPay.equals(totals.estimatedNetPay);

    if (!hasStaleComponents) return compensation;

    return this.prisma.$transaction(async (tx) => {
      await tx.employeeCompensationHistory.update({
        where: { id: compensation.id },
        data: totals,
      });
      await tx.employeeCompensationComponent.deleteMany({
        where: {
          tenantId: compensation.tenantId,
          compensationHistoryId: compensation.id,
        },
      });
      if (components.length) {
        await tx.employeeCompensationComponent.createMany({
          data: components.map((component) => ({
            tenantId: compensation.tenantId,
            compensationHistoryId: compensation.id,
            ...employeeCompensationComponentCreateData(component),
          })),
        });
      }
      const refreshed = await tx.employeeCompensationHistory.findFirst({
        where: { tenantId: compensation.tenantId, id: compensation.id },
        include: payrollCompensationHistoryInclude,
      });
      if (!refreshed) {
        throw new NotFoundException(
          'Employee compensation was not found for this tenant.',
        );
      }
      return refreshed;
    });
  }

  private async resolveEmployeePayrollContext(
    tenantId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
      select: {
        id: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
        designationId: true,
        employeeLevelId: true,
        employmentStatus: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }
    return employee;
  }

  private mapComponentizedCompensation(
    compensation: PayrollCompensationHistoryWithRelations,
  ) {
    const employeeName = [
      compensation.employee.firstName,
      compensation.employee.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    const basicSalary = compensation.baseAmount.toString();
    const componentValues = Object.fromEntries(
      compensation.components.map((component) => [
        `component_${component.payComponentId}`,
        displayPayrollComponentValue(component),
      ]),
    );

    return {
      id: compensation.id,
      tenantId: compensation.tenantId,
      employeeId: compensation.employeeId,
      employeeName,
      employeeCode: compensation.employee.employeeCode,
      workEmail: compensation.employee.email,
      basicSalary,
      payFrequency: toLegacyPayFrequency(compensation.payFrequency),
      effectiveDate: compensation.effectiveFrom,
      endDate: compensation.effectiveTo,
      currency: compensation.currencyCode,
      payrollStatus: toLegacyPayrollStatus(compensation.status),
      notes: compensation.notes,
      grossEarnings: compensation.grossEarnings.toString(),
      totalDeductions: compensation.totalDeductions.toString(),
      employerContributions: compensation.employerContributions.toString(),
      estimatedNetPay: compensation.estimatedNetPay.toString(),
      salaryPackageRule: compensation.salaryPackageRule,
      components: compensation.components.map((component) => ({
        ...component,
        amount: component.amount?.toString() ?? null,
        percentage: component.percentage?.toString() ?? null,
        configuredAmount: component.configuredAmount?.toString() ?? null,
        calculatedAmount: component.calculatedAmount.toString(),
        overrideAmount: component.overrideAmount?.toString() ?? null,
        effectiveAmount: component.effectiveAmount.toString(),
      })),
      ...componentValues,
      createdAt: compensation.createdAt,
      updatedAt: compensation.updatedAt,
      employee: {
        id: compensation.employee.id,
        employeeCode: compensation.employee.employeeCode,
        firstName: compensation.employee.firstName,
        lastName: compensation.employee.lastName,
        preferredName: compensation.employee.preferredName,
        fullName: employeeName,
        workEmail: compensation.employee.email,
        employmentStatus: compensation.employee.employmentStatus,
        department: compensation.employee.department,
        designation: compensation.employee.designation,
      },
    };
  }

  private mapCompensation(compensation: EmployeeCompensationWithRelations) {
    const employeeName = [
      compensation.employee.firstName,
      compensation.employee.lastName,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: compensation.id,
      tenantId: compensation.tenantId,
      employeeId: compensation.employeeId,
      employeeName,
      employeeCode: compensation.employee.employeeCode,
      workEmail: compensation.employee.email,
      basicSalary: compensation.basicSalary.toString(),
      payFrequency: compensation.payFrequency,
      effectiveDate: compensation.effectiveDate,
      endDate: compensation.endDate,
      currency: compensation.currency,
      payrollStatus: compensation.payrollStatus,
      payrollGroup: compensation.payrollGroup,
      paymentMode: compensation.paymentMode,
      bankName: compensation.bankName,
      bankAccountTitle: compensation.bankAccountTitle,
      bankAccountNumber: compensation.bankAccountNumber,
      bankIban: compensation.bankIban,
      bankRoutingNumber: compensation.bankRoutingNumber,
      taxIdentifier: compensation.taxIdentifier,
      notes: compensation.notes,
      createdAt: compensation.createdAt,
      updatedAt: compensation.updatedAt,
      employee: {
        id: compensation.employee.id,
        employeeCode: compensation.employee.employeeCode,
        firstName: compensation.employee.firstName,
        lastName: compensation.employee.lastName,
        preferredName: compensation.employee.preferredName,
        fullName: employeeName,
        workEmail: compensation.employee.email,
        employmentStatus: compensation.employee.employmentStatus,
        department: compensation.employee.department,
        designation: compensation.employee.designation,
      },
    };
  }
}

function validatePeriodRange(periodStart: string, periodEnd: string) {
  if (parsePayrollDateOnly(periodEnd) < parsePayrollDateOnly(periodStart)) {
    throw new BadRequestException(
      'Payroll cycle end date cannot be earlier than start date.',
    );
  }
}

export function parsePayrollDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    throw new BadRequestException(
      'Payroll cycle dates must use the YYYY-MM-DD format.',
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('Payroll cycle date is not valid.');
  }

  return date;
}

function defaultPayrollCycleDateRange() {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

function cleanOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeCycleCode(value?: string | null, fallbackName?: string | null) {
  const source = value?.trim() || fallbackName?.trim() || `CYCLE_${Date.now()}`;
  return source
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function friendlyEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type PayrollHolidayRules = {
  exactDates: Set<string>;
  recurringDates: Set<string>;
};

type PayrollPeriodCandidate = {
  name: string;
  periodStart: Date;
  periodEnd: Date;
};

function buildPayrollPeriodCandidates(input: {
  startDate: Date;
  cycleEnd: Date;
  frequency: PayrollCalendarFrequency;
  count: number;
  cycleName: string;
}): PayrollPeriodCandidate[] {
  const periods: PayrollPeriodCandidate[] = [];
  let cursor = startOfUtcDay(input.startDate);

  while (periods.length < input.count && cursor <= input.cycleEnd) {
    let naturalEnd: Date;
    switch (input.frequency) {
      case PayrollCalendarFrequency.WEEKLY:
        naturalEnd = addUtcDays(cursor, 6);
        break;
      case PayrollCalendarFrequency.BIWEEKLY:
        naturalEnd = addUtcDays(cursor, 13);
        break;
      case PayrollCalendarFrequency.SEMI_MONTHLY:
        naturalEnd =
          cursor.getUTCDate() <= 15
            ? new Date(
                Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 15),
              )
            : endOfUtcMonth(cursor);
        break;
      case PayrollCalendarFrequency.MONTHLY:
        naturalEnd = endOfUtcMonth(cursor);
        break;
      default:
        throw new BadRequestException(
          'Unsupported payroll calendar frequency.',
        );
    }

    const periodEnd = naturalEnd > input.cycleEnd ? input.cycleEnd : naturalEnd;
    periods.push({
      name: `${input.cycleName} ${periodLabel(cursor, periodEnd)}`,
      periodStart: cursor,
      periodEnd,
    });
    cursor = addUtcDays(periodEnd, 1);
  }

  return periods;
}

function configuredDayInMonth(
  reference: Date,
  configuredDay: number,
  rollForward: boolean,
) {
  const makeDate = (year: number, month: number) =>
    new Date(
      Date.UTC(
        year,
        month,
        Math.min(configuredDay, daysInUtcMonth(year, month)),
      ),
    );
  let result = makeDate(reference.getUTCFullYear(), reference.getUTCMonth());
  if (rollForward && result < reference) {
    result = makeDate(reference.getUTCFullYear(), reference.getUTCMonth() + 1);
  } else if (!rollForward && result > reference) {
    result = makeDate(reference.getUTCFullYear(), reference.getUTCMonth() - 1);
  }
  return result;
}

function adjustPayrollDate(
  value: Date,
  cycle: PayrollCycleWithRelations,
  weekendDays: Set<string>,
  holidays: PayrollHolidayRules,
) {
  if (!cycle.adjustDatesForWeekend && !cycle.adjustDatesForHoliday) {
    return value;
  }
  const direction =
    cycle.dateAdjustmentDirection === 'PREVIOUS_BUSINESS_DAY' ? -1 : 1;
  let adjusted = value;
  for (let attempt = 0; attempt < 370; attempt += 1) {
    const weekday = UTC_WEEKDAYS[adjusted.getUTCDay()];
    const key = dateKey(adjusted);
    const isWeekend = cycle.adjustDatesForWeekend && weekendDays.has(weekday);
    const isHoliday =
      cycle.adjustDatesForHoliday &&
      (holidays.exactDates.has(key) ||
        holidays.recurringDates.has(key.slice(5)));
    if (!isWeekend && !isHoliday) {
      return adjusted;
    }
    adjusted = addUtcDays(adjusted, direction);
  }
  throw new BadRequestException(
    'Unable to resolve a business date for the payroll period.',
  );
}

const UTC_WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function endOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function periodLabel(periodStart: Date, periodEnd: Date) {
  const start = dateKey(periodStart);
  const end = dateKey(periodEnd);
  return start === end ? start : `${start} to ${end}`;
}

function validateCompensationRange(
  effectiveDate: string,
  endDate?: string | null,
) {
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

function toCompensationPayFrequency(value: PayFrequency) {
  return Object.values(CompensationPayFrequency).includes(
    value as unknown as CompensationPayFrequency,
  )
    ? (value as unknown as CompensationPayFrequency)
    : CompensationPayFrequency.MONTHLY;
}

function toLegacyPayFrequency(value: CompensationPayFrequency) {
  return Object.values(PayFrequency).includes(value as unknown as PayFrequency)
    ? (value as unknown as PayFrequency)
    : PayFrequency.MONTHLY;
}

function toCompensationHistoryStatus(value?: string | null) {
  if (value === 'ON_HOLD' || value === 'STOPPED') {
    return EmployeeCompensationHistoryStatus.RETIRED;
  }
  if (
    value &&
    Object.values(EmployeeCompensationHistoryStatus).includes(
      value as EmployeeCompensationHistoryStatus,
    )
  ) {
    return value as EmployeeCompensationHistoryStatus;
  }
  return EmployeeCompensationHistoryStatus.ACTIVE;
}

function toLegacyPayrollStatus(value: EmployeeCompensationHistoryStatus) {
  return value === EmployeeCompensationHistoryStatus.ACTIVE
    ? 'ACTIVE'
    : 'STOPPED';
}

function resolvePayrollComponentAmount(
  payComponent: PayrollPayComponentWithRules,
  rule: PayrollPayComponentRule | null,
  input: PayrollCompensationComponentInput | undefined,
  baseAmount: Prisma.Decimal,
) {
  if (input?.amount) return new Prisma.Decimal(input.amount);
  if (rule?.fixedAmount) return rule.fixedAmount;
  if (payComponent.fixedAmount) return payComponent.fixedAmount;
  if (isBasicPayrollComponent(payComponent)) return baseAmount;
  return new Prisma.Decimal(0);
}

function resolvePayrollComponentPercentage(
  payComponent: PayrollPayComponentWithRules,
  rule: PayrollPayComponentRule | null,
  input: PayrollCompensationComponentInput | undefined,
) {
  if (input?.percentage) return new Prisma.Decimal(input.percentage);
  return rule?.percentage ?? payComponent.percentage;
}

function resolvePayrollComponentCalculationMethod(
  payComponent: PayrollPayComponentWithRules,
  rule: PayrollPayComponentRule | null,
): PayComponentCalculationMethod {
  const method =
    rule?.calculationMethodOverride ?? payComponent.calculationMethod;
  const formulaExpression =
    rule?.formulaExpression ?? payComponent.formulaExpression;
  if (
    formulaExpression?.trim() &&
    method !== PayComponentCalculationMethod.FIXED &&
    method !== PayComponentCalculationMethod.MANUAL
  ) {
    return PayComponentCalculationMethod.FORMULA;
  }
  if (
    method === PayComponentCalculationMethod.MANUAL ||
    method === PayComponentCalculationMethod.SYSTEM_CALCULATED
  ) {
    return PayComponentCalculationMethod.FIXED;
  }
  return method;
}

function refreshCompensationComponentInput(
  component: PayrollCompensationHistoryWithRelations['components'][number],
) {
  if (
    component.payComponent.calculationMethod !==
    PayComponentCalculationMethod.MANUAL
  ) {
    return {};
  }
  return {
    amount: component.amount?.toString() ?? undefined,
    percentage: component.percentage?.toString() ?? undefined,
  };
}

function isBasicPayrollComponent(payComponent: {
  componentCategory: string;
  code: string;
  name: string;
}) {
  return (
    payComponent.componentCategory === 'BASIC' ||
    payComponent.code.toUpperCase() === 'BASIC' ||
    payComponent.name.toLowerCase().includes('basic')
  );
}

function isPayComponentApplicable(
  payComponent: PayrollPayComponentWithRules,
  rule: PayrollPayComponentRule | null,
) {
  return (
    payComponent.eligibilityAppliesTo !== 'MATCHING_EMPLOYEES' || rule !== null
  );
}

function selectPayComponentRule(
  payComponent: PayrollPayComponentWithRules,
  employee: PayrollEmployeeContext,
) {
  if (payComponent.eligibilityAppliesTo !== 'MATCHING_EMPLOYEES') return null;
  const matches = payComponent.eligibilityRules
    .filter((rule) => ruleMatchesEmployee(rule, employee))
    .sort(comparePayComponentRules);
  return matches[0] ?? null;
}

function comparePayComponentRules(
  left: PayrollPayComponentRule,
  right: PayrollPayComponentRule,
) {
  const employeeSpecific =
    Number(ruleSpecificity(right).employee) -
    Number(ruleSpecificity(left).employee);
  if (employeeSpecific) return employeeSpecific;
  const tier = ruleSpecificity(left).tier - ruleSpecificity(right).tier;
  if (tier) return tier;
  const priority = left.priority - right.priority;
  if (priority) return priority;
  const specificity =
    ruleSpecificity(right).count - ruleSpecificity(left).count;
  if (specificity) return specificity;
  return right.updatedAt.getTime() - left.updatedAt.getTime();
}

function ruleSpecificity(rule: PayrollPayComponentRule) {
  const attributes = conditionAttributes(rule.conditions);
  const employee = attributes.has('employeeId');
  const levelOrDesignation =
    attributes.has('employeeLevelId') || attributes.has('designationId');
  const teamOrDepartment =
    attributes.has('teamId') || attributes.has('departmentId');
  const tier = employee ? 1 : levelOrDesignation ? 2 : teamOrDepartment ? 3 : 4;
  return { employee, tier, count: attributes.size };
}

function ruleMatchesEmployee(
  rule: PayrollPayComponentRule,
  employee: PayrollEmployeeContext,
) {
  const conditions = normalizeRuleConditions(rule.conditions);
  if (!conditions.length) return false;
  const matchType = rule.matchType === 'ANY' ? 'ANY' : 'ALL';
  const results = conditions.map((condition) =>
    conditionMatchesEmployee(condition, employee),
  );
  return matchType === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

function normalizeRuleConditions(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const raw = Array.isArray(record.conditions)
    ? record.conditions
    : Object.entries(record).map(([attribute, expected]) => ({
        attribute,
        operator: Array.isArray(expected) ? 'IS_ONE_OF' : 'EQUALS',
        value: expected,
      }));
  return raw.filter(isRuleCondition);
}

function isRuleCondition(value: unknown): value is {
  attribute: string;
  operator?: string;
  value?: unknown;
  values?: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { attribute?: unknown }).attribute === 'string'
  );
}

function conditionMatchesEmployee(
  condition: {
    attribute: string;
    operator?: string;
    value?: unknown;
    values?: unknown;
  },
  employee: PayrollEmployeeContext,
) {
  const actual = employeeAttributeValue(employee, condition.attribute);
  const operator = normalizeConditionOperator(condition.operator);
  const expectedValues = conditionValues(condition);
  if (operator === 'IS_EMPTY') return !actual;
  if (operator === 'IS_NOT_EMPTY') return Boolean(actual);
  const matched = expectedValues.some((value) => value === actual);
  if (operator === 'NOT_EQUALS' || operator === 'IS_NOT_ONE_OF') {
    return !matched;
  }
  return matched;
}

function employeeAttributeValue(
  employee: PayrollEmployeeContext,
  attribute: string,
) {
  const normalized = attribute.trim();
  if (normalized === 'employeeId') return employee.id;
  if (normalized === 'organizationId') return employee.organizationId;
  if (normalized === 'businessUnitId') return employee.businessUnitId;
  if (normalized === 'departmentId') return employee.departmentId;
  if (normalized === 'teamId') return employee.teamId;
  if (normalized === 'designationId') return employee.designationId;
  if (normalized === 'employeeLevelId') return employee.employeeLevelId;
  return null;
}

function normalizeConditionOperator(operator?: string) {
  return (operator ?? 'EQUALS')
    .trim()
    .toUpperCase()
    .replaceAll(' ', '_')
    .replaceAll('-', '_');
}

function conditionValues(condition: { value?: unknown; values?: unknown }) {
  const raw = condition.values ?? condition.value;
  return (Array.isArray(raw) ? raw : [raw])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function conditionAttributes(value: Prisma.JsonValue) {
  return new Set(
    normalizeRuleConditions(value).map((condition) =>
      condition.attribute.trim(),
    ),
  );
}

function resolveEmployeeOverride(
  input: PayrollCompensationComponentInput | undefined,
  existing:
    | PayrollCompensationHistoryWithRelations['components'][number]
    | undefined,
) {
  const activeExistingOverride =
    existing?.isOverridden &&
    (!existing.overrideExpiresAt || existing.overrideExpiresAt >= new Date());
  const overrideAmount = input?.overrideAmount
    ? new Prisma.Decimal(input.overrideAmount)
    : activeExistingOverride
      ? existing.overrideAmount
      : null;
  const overrideReason =
    input?.overrideReason?.trim() ??
    (activeExistingOverride ? existing.overrideReason : null);
  const isOverridden = Boolean(overrideAmount);
  if (isOverridden && !overrideReason) {
    throw new BadRequestException('Override Reason is required.');
  }
  return {
    isOverridden,
    overrideAmount,
    overrideReason,
    overriddenAt: input?.overrideAmount
      ? new Date()
      : activeExistingOverride
        ? existing.overriddenAt
        : null,
    overriddenById: activeExistingOverride ? existing.overriddenById : null,
    overrideExpiresAt: activeExistingOverride
      ? existing.overrideExpiresAt
      : null,
  };
}

function buildCalculationSnapshot(
  payComponent: PayrollPayComponentWithRules,
  rule: PayrollPayComponentRule | null,
) {
  return {
    payComponentId: payComponent.id,
    payComponentCode: payComponent.code,
    payComponentName: payComponent.name,
    ruleAppliedId: rule?.id ?? null,
    calculationMethod: resolvePayrollComponentCalculationMethod(
      payComponent,
      rule,
    ),
    fixedAmount: (rule?.fixedAmount ?? payComponent.fixedAmount)?.toString(),
    percentage: (rule?.percentage ?? payComponent.percentage)?.toString(),
    percentageBaseComponentId:
      rule?.percentageBaseComponentId ?? payComponent.percentageBaseComponentId,
    formulaExpression:
      rule?.formulaExpression ?? payComponent.formulaExpression,
  };
}

function employeeCompensationComponentCreateData(component: {
  payComponentId: string;
  amount: Prisma.Decimal | null;
  percentage: Prisma.Decimal | null;
  configuredAmount: Prisma.Decimal | null;
  calculatedAmount: Prisma.Decimal;
  overrideAmount: Prisma.Decimal | null;
  effectiveAmount: Prisma.Decimal;
  isOverridden: boolean;
  overrideReason: string | null;
  overriddenById: string | null;
  overriddenAt: Date | null;
  overrideExpiresAt: Date | null;
  ruleAppliedId: string | null;
  calculationSource: string;
  calculationSnapshot: Prisma.InputJsonValue;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  formulaExpression: string | null;
  calculationMethodSnapshot: PayComponentCalculationMethod;
  isTaxable: boolean;
  isRecurring: boolean;
  isEmployeeEditable: boolean;
  displayOrder: number;
}) {
  return {
    payComponentId: component.payComponentId,
    amount: component.amount,
    percentage: component.percentage,
    configuredAmount: component.configuredAmount,
    calculatedAmount: component.calculatedAmount,
    overrideAmount: component.overrideAmount,
    effectiveAmount: component.effectiveAmount,
    isOverridden: component.isOverridden,
    overrideReason: component.overrideReason,
    overriddenById: component.overriddenById,
    overriddenAt: component.overriddenAt,
    overrideExpiresAt: component.overrideExpiresAt,
    ruleAppliedId: component.ruleAppliedId,
    calculationSource: component.calculationSource,
    calculationSnapshot: component.calculationSnapshot,
    effectiveFrom: component.effectiveFrom,
    effectiveTo: component.effectiveTo,
    formulaExpression: component.formulaExpression,
    calculationMethodSnapshot: component.calculationMethodSnapshot,
    isTaxable: component.isTaxable,
    isRecurring: component.isRecurring,
    isEmployeeEditable: component.isEmployeeEditable,
    displayOrder: component.displayOrder,
  };
}

function displayPayrollComponentValue(
  component: PayrollCompensationHistoryWithRelations['components'][number],
) {
  if (component.calculationMethodSnapshot === 'PERCENTAGE') {
    return (
      component.percentage?.toString() ?? component.calculatedAmount.toString()
    );
  }
  if (
    component.calculationMethodSnapshot === 'FORMULA' ||
    component.calculationMethodSnapshot === 'SYSTEM_CALCULATED'
  ) {
    return component.calculatedAmount.toString();
  }
  return (
    component.effectiveAmount?.toString() ??
    component.calculatedAmount.toString()
  );
}

function summarizePayrollCompensationComponents(
  components: readonly {
    calculatedAmount: Prisma.Decimal;
    effectiveAmount?: Prisma.Decimal;
    componentType: string;
    affectsGrossPay: boolean;
    affectsNetPay: boolean;
  }[],
) {
  const totals = {
    grossEarnings: new Prisma.Decimal(0),
    totalDeductions: new Prisma.Decimal(0),
    employerContributions: new Prisma.Decimal(0),
    estimatedNetPay: new Prisma.Decimal(0),
  };
  for (const component of components) {
    const amount = component.effectiveAmount ?? component.calculatedAmount;
    if (
      component.affectsGrossPay &&
      ['EARNING', 'ALLOWANCE', 'REIMBURSEMENT'].includes(
        component.componentType,
      )
    ) {
      totals.grossEarnings = totals.grossEarnings.plus(amount);
    }
    if (
      component.affectsNetPay &&
      ['DEDUCTION', 'TAX'].includes(component.componentType)
    ) {
      totals.totalDeductions = totals.totalDeductions.plus(amount);
    }
    if (component.componentType === 'EMPLOYER_CONTRIBUTION') {
      totals.employerContributions = totals.employerContributions.plus(amount);
    }
  }
  totals.estimatedNetPay = totals.grossEarnings.minus(totals.totalDeductions);
  return totals;
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
    const summary = summaryByEmployee.get(timesheet.employeeId) ?? {
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

      if (
        entry.project &&
        !summary.projects.some((project) => project.id === entry.project?.id)
      ) {
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
  employee: Awaited<
    ReturnType<PayrollRepository['findEmployeesInPayrollScope']>
  >[number],
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

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimNullable(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
