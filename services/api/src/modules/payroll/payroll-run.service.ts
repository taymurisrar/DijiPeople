import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessTripStatus,
  ClaimRequestStatus,
  ConfigurationStatus,
  EmployeeEmploymentStatus,
  LeaveRequestStatus,
  LoanInstallmentStatus,
  LoanRequestStatus,
  PayrollAdjustmentStatus,
  PayrollExceptionSeverity,
  PayrollInputSnapshotSourceType,
  PayrollPeriodStatus,
  PayrollRunEmployeeStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  TimePayrollInputSourceType,
  TimePayrollInputStatus,
  TimeProrationBasis,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompensationResolverService } from '../compensation/compensation-resolver.service';
import { TimePayrollPreparationService } from '../time-payroll/time-payroll-preparation.service';
import { TaxCalculationService } from '../tax-rules/tax-calculation.service';
import { BenefitsService } from '../benefits/benefits.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { PayrollCostAllocationService } from './payroll-cost-allocation.service';
import { PayrollExchangeRateService } from './payroll-exchange-rate.service';
import {
  CreatePayrollCalendarDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  PayrollCoreQueryDto,
  UpdatePayrollCalendarDto,
  UpdatePayrollPeriodDto,
} from './dto/payroll-core.dto';
import {
  CreatePayrollAdjustmentDto,
  PayrollAdjustmentDecisionDto,
  PayrollExceptionActionDto,
  UpdatePayrollAdjustmentDto,
} from './dto/payroll-adjustment.dto';

const runDetailInclude = {
  payrollPeriod: { include: { payrollCalendar: true } },
  employees: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      },
      lineItems: {
        include: { payComponent: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
      inputSnapshots: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  exceptions: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PayrollRunInclude;

@Injectable()
export class PayrollRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly compensationResolver: CompensationResolverService,
    private readonly timePayrollPreparation: TimePayrollPreparationService,
    private readonly taxCalculationService: TaxCalculationService,
    private readonly benefitsService: BenefitsService,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
    private readonly costAllocationService: PayrollCostAllocationService,
    private readonly exchangeRateService: PayrollExchangeRateService,
  ) {}

  async createCalendar(user: AuthenticatedUser, dto: CreatePayrollCalendarDto) {
    await this.assertBusinessUnitAccess(user, dto.businessUnitId);

    if (dto.isDefault !== false) {
      await this.assertNoDefaultCalendar(user.tenantId, dto.businessUnitId);
    }

    const calendar = await this.prisma.payrollCalendar.create({
      data: {
        tenantId: user.tenantId,
        businessUnitId: dto.businessUnitId ?? null,
        name: dto.name.trim(),
        frequency: dto.frequency,
        timezone: dto.timezone?.trim() || 'UTC',
        currencyCode: normalizeCurrency(dto.currencyCode),
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit(
      user,
      'PAYROLL_CALENDAR_CREATED',
      'PayrollCalendar',
      calendar.id,
      null,
      calendar,
    );
    return this.findCalendarOrThrow(user.tenantId, calendar.id);
  }

  listCalendars(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollCalendar.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.businessUnitId
          ? { businessUnitId: query.businessUnitId }
          : {}),
      },
      include: { businessUnit: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getCalendar(user: AuthenticatedUser, id: string) {
    return this.findCalendarOrThrow(user.tenantId, id);
  }

  async updateCalendar(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollCalendarDto,
  ) {
    const existing = await this.findCalendarOrThrow(user.tenantId, id);
    await this.assertBusinessUnitAccess(user, existing.businessUnitId);
    if (dto.businessUnitId !== undefined) {
      await this.assertBusinessUnitAccess(user, dto.businessUnitId);
    }

    const nextBusinessUnitId =
      dto.businessUnitId === undefined
        ? existing.businessUnitId
        : dto.businessUnitId || null;
    const nextIsDefault = dto.isDefault ?? existing.isDefault;

    if (
      nextIsDefault &&
      (!existing.isDefault || nextBusinessUnitId !== existing.businessUnitId)
    ) {
      await this.assertNoDefaultCalendar(user.tenantId, nextBusinessUnitId, id);
    }

    const updated = await this.prisma.payrollCalendar.update({
      where: { id },
      data: {
        ...(dto.businessUnitId !== undefined
          ? { businessUnitId: dto.businessUnitId || null }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.timezone !== undefined
          ? { timezone: dto.timezone.trim() || 'UTC' }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit(
      user,
      'PAYROLL_CALENDAR_UPDATED',
      'PayrollCalendar',
      id,
      existing,
      updated,
    );
    return this.findCalendarOrThrow(user.tenantId, updated.id);
  }

  async createPeriod(user: AuthenticatedUser, dto: CreatePayrollPeriodDto) {
    const calendar = await this.findCalendarOrThrow(
      user.tenantId,
      dto.payrollCalendarId,
    );
    await this.assertBusinessUnitAccess(user, calendar.businessUnitId);
    const periodStart = parseDate(dto.periodStart);
    const periodEnd = parseDate(dto.periodEnd);
    const paymentDate = parseOptionalDate(dto.paymentDate);
    assertPeriodDates(periodStart, periodEnd, paymentDate);

    const period = await this.prisma.payrollPeriod.create({
      data: {
        tenantId: user.tenantId,
        payrollCalendarId: calendar.id,
        name: dto.name.trim(),
        periodStart,
        periodEnd,
        cutoffDate: parseOptionalDate(dto.cutoffDate),
        paymentDate,
        status: dto.status ?? PayrollPeriodStatus.OPEN,
      },
    });

    await this.audit(
      user,
      'PAYROLL_PERIOD_CREATED',
      'PayrollPeriod',
      period.id,
      null,
      period,
    );
    return period;
  }

  listPeriods(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollPeriod.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.payrollCalendarId
          ? { payrollCalendarId: query.payrollCalendarId }
          : {}),
      },
      include: { payrollCalendar: true },
      orderBy: [{ periodStart: 'desc' }],
    });
  }

  async getPeriod(user: AuthenticatedUser, id: string) {
    return this.findPeriodOrThrow(user.tenantId, id);
  }

  async updatePeriod(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollPeriodDto,
  ) {
    const existing = await this.findPeriodOrThrow(user.tenantId, id);
    if (existing.status === PayrollPeriodStatus.LOCKED) {
      throw new ForbiddenException('Locked payroll periods cannot be edited.');
    }
    await this.assertBusinessUnitAccess(
      user,
      existing.payrollCalendar.businessUnitId,
    );

    const periodStart = dto.periodStart
      ? parseDate(dto.periodStart)
      : existing.periodStart;
    const periodEnd = dto.periodEnd
      ? parseDate(dto.periodEnd)
      : existing.periodEnd;
    const paymentDate =
      dto.paymentDate !== undefined
        ? parseOptionalDate(dto.paymentDate)
        : existing.paymentDate;
    assertPeriodDates(periodStart, periodEnd, paymentDate);

    const updated = await this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.periodStart !== undefined ? { periodStart } : {}),
        ...(dto.periodEnd !== undefined ? { periodEnd } : {}),
        ...(dto.cutoffDate !== undefined
          ? { cutoffDate: parseOptionalDate(dto.cutoffDate) }
          : {}),
        ...(dto.paymentDate !== undefined ? { paymentDate } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { payrollCalendar: true },
    });

    await this.audit(
      user,
      'PAYROLL_PERIOD_UPDATED',
      'PayrollPeriod',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async createPayrollRun(user: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const period = await this.findPeriodOrThrow(
      user.tenantId,
      dto.payrollPeriodId,
    );
    if (
      period.status !== PayrollPeriodStatus.OPEN &&
      period.status !== PayrollPeriodStatus.INPUT_CLOSED
    ) {
      throw new BadRequestException(
        'Payroll runs can only be created for OPEN or INPUT_CLOSED periods.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      period.payrollCalendar.businessUnitId,
    );

    const run = await this.createPayrollRunRecord(user, {
      payrollPeriodId: period.id,
      runNumber:
        dto.runNumber ??
        (await this.nextPayrollRunNumber(user.tenantId, period.id)),
      notes: dto.notes?.trim() || null,
      retryWithNextRunNumber: dto.runNumber === undefined,
    });

    await this.audit(
      user,
      'PAYROLL_RUN_CREATED',
      'PayrollRun',
      run.id,
      null,
      run,
    );
    return run;
  }

  private async createPayrollRunRecord(
    user: AuthenticatedUser,
    input: {
      payrollPeriodId: string;
      runNumber: number;
      notes: string | null;
      retryWithNextRunNumber: boolean;
    },
  ) {
    try {
      return await this.prisma.payrollRun.create({
        data: {
          tenantId: user.tenantId,
          payrollPeriodId: input.payrollPeriodId,
          runNumber: input.runNumber,
          notes: input.notes,
          createdBy: user.userId,
        },
      });
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      if (!input.retryWithNextRunNumber) {
        throw new ConflictException(
          'Run number already exists for this payroll period.',
        );
      }
      return this.prisma.payrollRun.create({
        data: {
          tenantId: user.tenantId,
          payrollPeriodId: input.payrollPeriodId,
          runNumber: await this.nextPayrollRunNumber(
            user.tenantId,
            input.payrollPeriodId,
          ),
          notes: input.notes,
          createdBy: user.userId,
        },
      });
    }
  }

  private async nextPayrollRunNumber(
    tenantId: string,
    payrollPeriodId: string,
  ) {
    const result = await this.prisma.payrollRun.aggregate({
      where: { tenantId, payrollPeriodId },
      _max: { runNumber: true },
    });
    return (result._max.runNumber ?? 0) + 1;
  }

  listPayrollRuns(user: AuthenticatedUser, query: PayrollCoreQueryDto) {
    return this.prisma.payrollRun.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.payrollPeriodId
          ? { payrollPeriodId: query.payrollPeriodId }
          : {}),
      },
      include: { payrollPeriod: { include: { payrollCalendar: true } } },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    return mapRun(run);
  }

  async deletePayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );

    if (
      run.status !== PayrollRunStatus.DRAFT &&
      run.status !== PayrollRunStatus.FAILED
    ) {
      throw new BadRequestException(
        'Only draft or failed payroll runs can be deleted.',
      );
    }

    const deleted = await this.prisma.payrollRun.delete({
      where: { id },
    });

    await this.audit(
      user,
      'PAYROLL_RUN_DELETED',
      'PayrollRun',
      id,
      run,
      deleted,
    );

    return { deleted: true, id };
  }

  async listRunEmployees(user: AuthenticatedUser, runId: string) {
    await this.findRunOrThrow(user.tenantId, runId);
    const items = await this.prisma.payrollRunEmployee.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        lineItems: {
          include: { payComponent: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(mapRunEmployee);
  }

  async listRunExceptions(user: AuthenticatedUser, runId: string) {
    await this.findRunOrThrow(user.tenantId, runId);
    return this.prisma.payrollException.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async acknowledgeRunException(
    user: AuthenticatedUser,
    runId: string,
    exceptionId: string,
    dto: PayrollExceptionActionDto,
  ) {
    await this.findRunOrThrow(user.tenantId, runId);
    const exception = await this.prisma.payrollException.findFirst({
      where: { tenantId: user.tenantId, payrollRunId: runId, id: exceptionId },
    });
    if (!exception)
      throw new NotFoundException('Payroll exception was not found.');
    const updated = await this.prisma.payrollException.update({
      where: { id: exceptionId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: user.userId,
        resolutionNote: dto.comment?.trim() || exception.resolutionNote,
      },
    });
    await this.audit(
      user,
      'PAYROLL_EXCEPTION_ACKNOWLEDGED',
      'PayrollException',
      exceptionId,
      exception,
      updated,
    );
    return updated;
  }

  async resolveRunException(
    user: AuthenticatedUser,
    runId: string,
    exceptionId: string,
    dto: PayrollExceptionActionDto,
  ) {
    const run = await this.findRunOrThrow(user.tenantId, runId);
    const exception = await this.prisma.payrollException.findFirst({
      where: { tenantId: user.tenantId, payrollRunId: runId, id: exceptionId },
    });
    if (!exception)
      throw new NotFoundException('Payroll exception was not found.');
    await this.assertRunExceptionIsResolved(user.tenantId, run, exception);
    const updated = await this.prisma.payrollException.update({
      where: { id: exceptionId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: user.userId,
        resolutionNote: dto.comment?.trim() || exception.resolutionNote,
      },
    });
    await this.audit(
      user,
      'PAYROLL_EXCEPTION_RESOLVED',
      'PayrollException',
      exceptionId,
      exception,
      updated,
    );
    return updated;
  }

  private async assertRunExceptionIsResolved(
    tenantId: string,
    run: { payrollPeriod: { periodStart: Date; periodEnd: Date } },
    exception: { employeeId: string | null; errorType: string },
  ) {
    if (exception.errorType !== 'MISSING_VERIFIED_PAYROLL_BANK_ACCOUNT') return;
    if (!exception.employeeId) {
      throw new BadRequestException(
        'This bank-account blocker is not linked to an employee.',
      );
    }
    const bankAccount = await this.prisma.employeeBankAccount.findFirst({
      where: {
        tenantId,
        employeeId: exception.employeeId,
        isPrimaryPayroll: true,
        isActive: true,
        verificationStatus: 'VERIFIED',
        effectiveFrom: { lte: run.payrollPeriod.periodEnd },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: run.payrollPeriod.periodStart } },
        ],
      },
      select: { id: true },
    });
    if (!bankAccount) {
      throw new BadRequestException(
        'Verify an effective primary payroll bank account before resolving this blocker.',
      );
    }
  }

  async listRunAdjustments(user: AuthenticatedUser, runId: string) {
    await this.findRunOrThrow(user.tenantId, runId);
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        payComponent: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return adjustments.map(mapAdjustment);
  }

  async createRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    dto: CreatePayrollAdjustmentDto,
  ) {
    const run = await this.findRunOrThrow(user.tenantId, runId);
    this.assertRunEditableForAdjustments(run.status);
    await this.assertEmployeeIsEligibleForRun(
      user.tenantId,
      run,
      dto.employeeId,
    );
    const category = dto.category ?? PayrollRunLineItemCategory.ADJUSTMENT;
    const currencyCode = normalizeCurrency(dto.currencyCode);
    await this.assertCurrency(user.tenantId, currencyCode);
    await this.assertAdjustmentPayComponent(
      user.tenantId,
      dto.payComponentId,
      category,
    );
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.eq(0))
      throw new BadRequestException('Adjustment amount cannot be zero.');

    const adjustment = await this.prisma.payrollAdjustment.create({
      data: {
        tenantId: user.tenantId,
        payrollRunId: runId,
        employeeId: dto.employeeId,
        payComponentId: dto.payComponentId ?? null,
        label: dto.label.trim(),
        amount,
        currencyCode,
        category,
        reason: dto.reason?.trim() || null,
        notes: dto.notes?.trim() || null,
        sourceReference: dto.sourceReference?.trim() || null,
        createdBy: user.userId,
      },
    });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_CREATED',
      'PayrollAdjustment',
      adjustment.id,
      null,
      adjustment,
    );
    return mapAdjustment(adjustment);
  }

  async updateRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    adjustmentId: string,
    dto: UpdatePayrollAdjustmentDto,
  ) {
    const run = await this.findRunOrThrow(user.tenantId, runId);
    this.assertRunEditableForAdjustments(run.status);
    const existing = await this.findAdjustmentOrThrow(
      user.tenantId,
      runId,
      adjustmentId,
    );
    if (existing.status !== PayrollAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be edited.');
    }
    const category = dto.category ?? existing.category;
    await this.assertAdjustmentPayComponent(
      user.tenantId,
      dto.payComponentId === undefined
        ? existing.payComponentId
        : (dto.payComponentId ?? undefined),
      category,
    );
    if (dto.currencyCode !== undefined) {
      await this.assertCurrency(
        user.tenantId,
        normalizeCurrency(dto.currencyCode),
      );
    }
    if (dto.amount !== undefined && new Prisma.Decimal(dto.amount).eq(0)) {
      throw new BadRequestException('Adjustment amount cannot be zero.');
    }
    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        ...(dto.payComponentId !== undefined
          ? { payComponentId: dto.payComponentId }
          : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.amount !== undefined
          ? { amount: new Prisma.Decimal(dto.amount) }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
        ...(dto.category !== undefined ? { category } : {}),
        ...(dto.reason !== undefined
          ? { reason: dto.reason?.trim() || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.sourceReference !== undefined
          ? { sourceReference: dto.sourceReference?.trim() || null }
          : {}),
        updatedBy: user.userId,
      },
    });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_UPDATED',
      'PayrollAdjustment',
      adjustmentId,
      existing,
      updated,
    );
    return mapAdjustment(updated);
  }

  async deleteRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    adjustmentId: string,
  ) {
    const run = await this.findRunOrThrow(user.tenantId, runId);
    this.assertRunEditableForAdjustments(run.status);
    const existing = await this.findAdjustmentOrThrow(
      user.tenantId,
      runId,
      adjustmentId,
    );
    if (existing.status !== PayrollAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be deleted.');
    }
    await this.prisma.payrollAdjustment.delete({ where: { id: adjustmentId } });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_DELETED',
      'PayrollAdjustment',
      adjustmentId,
      existing,
      null,
    );
    return { deleted: true };
  }

  async submitRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    adjustmentId: string,
  ) {
    const existing = await this.findAdjustmentOrThrow(
      user.tenantId,
      runId,
      adjustmentId,
    );
    if (existing.status !== PayrollAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be submitted.');
    }
    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: PayrollAdjustmentStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedBy: user.userId,
      },
    });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_SUBMITTED',
      'PayrollAdjustment',
      adjustmentId,
      existing,
      updated,
    );
    return mapAdjustment(updated);
  }

  async approveRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    adjustmentId: string,
  ) {
    const existing = await this.findAdjustmentOrThrow(
      user.tenantId,
      runId,
      adjustmentId,
    );
    if (
      existing.status !== PayrollAdjustmentStatus.SUBMITTED &&
      existing.status !== PayrollAdjustmentStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Only draft or submitted adjustments can be approved.',
      );
    }
    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: PayrollAdjustmentStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: user.userId,
        rejectionReason: null,
      },
    });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_APPROVED',
      'PayrollAdjustment',
      adjustmentId,
      existing,
      updated,
    );
    return mapAdjustment(updated);
  }

  async rejectRunAdjustment(
    user: AuthenticatedUser,
    runId: string,
    adjustmentId: string,
    dto: PayrollAdjustmentDecisionDto,
  ) {
    const existing = await this.findAdjustmentOrThrow(
      user.tenantId,
      runId,
      adjustmentId,
    );
    if (
      existing.status !== PayrollAdjustmentStatus.SUBMITTED &&
      existing.status !== PayrollAdjustmentStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Only draft or submitted adjustments can be rejected.',
      );
    }
    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: PayrollAdjustmentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: user.userId,
        rejectionReason: dto.reason?.trim() || null,
      },
    });
    await this.audit(
      user,
      'PAYROLL_ADJUSTMENT_REJECTED',
      'PayrollAdjustment',
      adjustmentId,
      existing,
      updated,
    );
    return mapAdjustment(updated);
  }

  async listRunCostAllocations(
    user: AuthenticatedUser,
    runId: string,
    query: { page?: number; pageSize?: number; search?: string },
  ) {
    await this.findRunOrThrow(user.tenantId, runId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const where: Prisma.PayrollCostAllocationLineWhereInput = {
      tenantId: user.tenantId,
      payrollRunId: runId,
      ...(search
        ? {
            OR: [
              {
                employee: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                employee: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                employee: {
                  employeeCode: { contains: search, mode: 'insensitive' },
                },
              },
              { project: { name: { contains: search, mode: 'insensitive' } } },
              {
                customer: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payrollCostAllocationLine.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          project: { select: { id: true, name: true, code: true } },
          customer: { select: { id: true, companyName: true } },
        },
        orderBy: [{ employee: { firstName: 'asc' } }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payrollCostAllocationLine.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName:
          `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        employeeCode: item.employee.employeeCode,
        projectId: item.projectId,
        projectName: item.project?.name ?? null,
        customerId: item.customerId,
        customerName: item.customer?.companyName ?? null,
        allocationPercentage: item.allocationPercentage.toString(),
        originalAmount: item.originalAmount.toString(),
        currencyCode: item.currencyCode,
        reportingAmount: item.reportingAmount?.toString() ?? null,
        reportingCurrency: item.reportingCurrency,
        isBench: item.isBench,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async calculateDraftPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    if (
      run.status === PayrollRunStatus.APPROVED ||
      run.status === PayrollRunStatus.PAID ||
      run.status === PayrollRunStatus.LOCKED
    ) {
      throw new BadRequestException(
        'Approved, paid, or locked payroll runs cannot be recalculated.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );

    const period = run.payrollPeriod;
    const businessUnitId = period.payrollCalendar.businessUnitId;
    const employees = await this.prisma.employee.findMany({
      where: buildPayrollEmployeeEligibilityWhere({
        tenantId: user.tenantId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        businessUnitId,
      }),
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.CALCULATING,
        calculationStartedAt: new Date(),
      },
    });

    await this.clearRunDraftData(user.tenantId, id, user.userId);

    const compensationByEmployeeId = new Map<string, CompensationPayload>();
    const benefitsByEmployeeId = new Map<
      string,
      Awaited<ReturnType<BenefitsService['resolvePayrollBenefits']>>
    >();
    const payrollSettings =
      await this.tenantSettingsResolver.getPayrollSettings(user.tenantId);
    const reportingCurrency = normalizeCurrency(
      payrollSettings.baseReportingCurrency ||
        payrollSettings.defaultCurrency ||
        period.payrollCalendar.currencyCode,
    );
    let hasBlockingReadinessIssue = false;
    try {
      for (const employee of employees) {
        const compensation =
          await this.compensationResolver.resolveActiveCompensation({
            tenantId: user.tenantId,
            employeeId: employee.id,
            effectiveDate: period.periodEnd,
          });
        compensationByEmployeeId.set(employee.id, compensation);
        if (!compensation) {
          hasBlockingReadinessIssue = true;
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: PayrollExceptionSeverity.BLOCKER,
              errorType: 'MISSING_COMPENSATION',
              message: 'No active compensation was found for the employee.',
              details: { employeeCode: employee.employeeCode },
            },
          });
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: period.payrollCalendar.currencyCode,
            },
          });
          continue;
        }
        const benefitInputs = await this.benefitsService.resolvePayrollBenefits(
          {
            tenantId: user.tenantId,
            employeeId: employee.id,
            effectiveDate: period.periodEnd,
            baseCompensation: compensation.baseAmount,
            currencyCode: compensation.currencyCode,
          },
        );
        benefitsByEmployeeId.set(employee.id, benefitInputs);
        if (benefitInputs.blockers.length) {
          hasBlockingReadinessIssue = true;
          for (const blocker of benefitInputs.blockers) {
            await this.prisma.payrollException.create({
              data: {
                tenantId: user.tenantId,
                payrollRunId: id,
                employeeId: employee.id,
                severity: PayrollExceptionSeverity.BLOCKER,
                errorType: blocker.code,
                message: blocker.message,
                details: {
                  employeeCode: employee.employeeCode,
                  benefitPolicyId: blocker.policyId,
                },
              },
            });
          }
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: compensation.currencyCode,
            },
          });
          continue;
        }
        const compensationRate = await this.exchangeRateService.lockRate({
          tenantId: user.tenantId,
          payrollRunId: id,
          fromCurrency: compensation.currencyCode,
          toCurrency: reportingCurrency,
          effectiveDate: period.paymentDate ?? period.periodEnd,
        });
        if (!compensationRate) {
          hasBlockingReadinessIssue = true;
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: PayrollExceptionSeverity.BLOCKER,
              errorType: 'MISSING_EXCHANGE_RATE',
              message: `No exchange rate was found for ${compensation.currencyCode} to ${reportingCurrency}.`,
              details: {
                employeeCode: employee.employeeCode,
                fromCurrency: compensation.currencyCode,
                toCurrency: reportingCurrency,
              },
            },
          });
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: compensation.currencyCode,
              reportingCurrencyCode: reportingCurrency,
            },
          });
          continue;
        }
        if (!compensationRequiresDisbursement(compensation)) {
          continue;
        }
        const bankAccount = await this.prisma.employeeBankAccount.findFirst({
          where: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            isPrimaryPayroll: true,
            isActive: true,
            verificationStatus: 'VERIFIED',
            effectiveFrom: { lte: period.periodEnd },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: period.periodStart } },
            ],
          },
          select: { id: true },
        });
        if (bankAccount) continue;
        if (payrollSettings.payrollBankAccountAction === 'IGNORE') continue;
        const bankAccountSeverity =
          payrollSettings.payrollBankAccountAction === 'BLOCK'
            ? PayrollExceptionSeverity.BLOCKER
            : PayrollExceptionSeverity.WARNING;
        if (bankAccountSeverity === PayrollExceptionSeverity.BLOCKER) {
          hasBlockingReadinessIssue = true;
        }
        await this.prisma.payrollException.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId: employee.id,
            severity: bankAccountSeverity,
            errorType: 'MISSING_VERIFIED_PAYROLL_BANK_ACCOUNT',
            message:
              'No effective verified primary payroll bank account was found for the employee.',
            details: { employeeCode: employee.employeeCode },
          },
        });
        if (bankAccountSeverity === PayrollExceptionSeverity.BLOCKER) {
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: period.payrollCalendar.currencyCode,
            },
          });
        }
      }
      if (hasBlockingReadinessIssue) {
        const failed = await this.prisma.payrollRun.update({
          where: { id },
          data: { status: PayrollRunStatus.FAILED },
          include: runDetailInclude,
        });
        await this.audit(
          user,
          'PAYROLL_RUN_READINESS_FAILED',
          'PayrollRun',
          id,
          run,
          failed,
        );
        return mapRun(failed);
      }

      for (const employee of employees) {
        const compensation = compensationByEmployeeId.get(employee.id) ?? null;
        const benefitInputs = benefitsByEmployeeId.get(employee.id) ?? {
          blockers: [],
          snapshots: [],
          lineItems: [],
        };

        if (!compensation) {
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: PayrollExceptionSeverity.ERROR,
              errorType: 'MISSING_COMPENSATION',
              message: 'No active compensation was found for the employee.',
              details: { employeeCode: employee.employeeCode },
            },
          });
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: period.payrollCalendar.currencyCode,
            },
          });
          continue;
        }

        const leaveInputs = await this.buildLeavePayrollInputs({
          tenantId: user.tenantId,
          employeeId: employee.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          baseAmount: compensation.baseAmount,
          currencyCode: compensation.currencyCode,
        });
        const claimInputs = await this.buildClaimPayrollInputs({
          tenantId: user.tenantId,
          employeeId: employee.id,
          cutoffDate: endOfUtcDay(period.cutoffDate ?? period.periodEnd),
        });
        const loanInputs = await this.buildLoanPayrollInputs({
          tenantId: user.tenantId,
          employeeId: employee.id,
          periodEnd: period.periodEnd,
          currencyCode: compensation.currencyCode,
        });
        const tadaInputs = await this.buildTadaPayrollInputs({
          tenantId: user.tenantId,
          employeeId: employee.id,
        });
        const preparedTimeInputs =
          await this.timePayrollPreparation.prepareTimeInputsForPayroll({
            tenantId: user.tenantId,
            employeeId: employee.id,
            payrollPeriodId: period.id,
            actorUserId: user.userId,
          });
        const timeInputs = this.buildTimePayrollInputs({
          prepared: preparedTimeInputs,
          baseAmount: compensation.baseAmount,
          currencyCode: compensation.currencyCode,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });
        const adjustmentInputs = await this.buildAdjustmentPayrollInputs({
          tenantId: user.tenantId,
          payrollRunId: id,
          employeeId: employee.id,
          currencyCode: compensation.currencyCode,
        });
        const lineItems = [
          ...buildLineItems(compensation),
          ...leaveInputs.lineItems,
          ...timeInputs.lineItems,
          ...claimInputs.lineItems,
          ...loanInputs.lineItems,
          ...tadaInputs.lineItems,
          ...benefitInputs.lineItems,
          ...adjustmentInputs.lineItems,
        ];
        const rateByCurrency = new Map<string, Prisma.Decimal>();
        let missingLineItemRate = false;
        for (const currency of [
          ...new Set(
            lineItems.map((item) => normalizeCurrency(item.currencyCode)),
          ),
        ]) {
          const rate = await this.exchangeRateService.lockRate({
            tenantId: user.tenantId,
            payrollRunId: id,
            fromCurrency: currency,
            toCurrency: reportingCurrency,
            effectiveDate: period.paymentDate ?? period.periodEnd,
          });
          if (!rate) {
            missingLineItemRate = true;
            await this.prisma.payrollException.create({
              data: {
                tenantId: user.tenantId,
                payrollRunId: id,
                employeeId: employee.id,
                severity: PayrollExceptionSeverity.BLOCKER,
                errorType: 'MISSING_EXCHANGE_RATE',
                message: `No exchange rate was found for ${currency} to ${reportingCurrency}.`,
                details: {
                  employeeCode: employee.employeeCode,
                  fromCurrency: currency,
                  toCurrency: reportingCurrency,
                },
              },
            });
          } else {
            rateByCurrency.set(currency, rate.rate);
          }
        }
        if (missingLineItemRate) {
          await this.prisma.payrollRunEmployee.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              status: PayrollRunEmployeeStatus.EXCEPTION,
              currencyCode: compensation.currencyCode,
              reportingCurrencyCode: reportingCurrency,
            },
          });
          continue;
        }
        const reportingLineItems = lineItems.map((item) => {
          const exchangeRate =
            rateByCurrency.get(normalizeCurrency(item.currencyCode)) ??
            new Prisma.Decimal(1);
          return {
            ...item,
            reportingAmount: this.exchangeRateService.convert(
              item.amount,
              exchangeRate,
            ),
            reportingCurrency,
            exchangeRate,
          };
        });
        const totals = calculateTotals(lineItems);
        const negativeNetPay = totals.netPay.lt(0);
        const negativeNetPayAction = payrollSettings.negativeNetPayAction;
        const reportingTotals = calculateTotals(
          reportingLineItems.map((item) => ({
            ...item,
            amount: item.reportingAmount,
            currencyCode: reportingCurrency,
          })),
        );
        const runEmployee = await this.prisma.payrollRunEmployee.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId: employee.id,
            status:
              negativeNetPay && negativeNetPayAction === 'BLOCK'
                ? PayrollRunEmployeeStatus.EXCEPTION
                : PayrollRunEmployeeStatus.CALCULATED,
            currencyCode: compensation.currencyCode,
            grossEarnings: totals.grossEarnings,
            totalDeductions: totals.totalDeductions,
            totalTaxes: totals.totalTaxes,
            totalReimbursements: totals.totalReimbursements,
            employerContributions: totals.employerContributions,
            netPay: totals.netPay,
            reportingCurrencyCode: reportingCurrency,
            exchangeRate:
              rateByCurrency.get(
                normalizeCurrency(compensation.currencyCode),
              ) ?? null,
            grossEarningsReporting: reportingTotals.grossEarnings,
            totalDeductionsReporting: reportingTotals.totalDeductions,
            totalTaxesReporting: reportingTotals.totalTaxes,
            totalReimbursementsReporting: reportingTotals.totalReimbursements,
            employerContributionsReporting:
              reportingTotals.employerContributions,
            netPayReporting: reportingTotals.netPay,
            calculationSummary: {
              source: 'COMPENSATION_AND_LEAVE',
              compensationHistoryId: compensation.id,
              lineItemCount: lineItems.length,
              approvedLeaveCount: leaveInputs.snapshots.length,
              unpaidLeaveDays: leaveInputs.unpaidDays.toString(),
              unpaidLeaveDeduction: leaveInputs.unpaidDeduction.toString(),
              approvedClaimLineCount: claimInputs.snapshots.length,
              claimReimbursementTotal:
                claimInputs.reimbursementTotal.toString(),
              loanInstallmentCount: loanInputs.snapshots.length,
              loanDeductionTotal: loanInputs.deductionTotal.toString(),
              approvedTadaAllowanceCount: tadaInputs.snapshots.length,
              tadaReimbursementTotal: tadaInputs.reimbursementTotal.toString(),
              timeInputCount: timeInputs.snapshots.length,
              benefitCount: benefitInputs.snapshots.length,
              manualAdjustmentCount: adjustmentInputs.snapshots.length,
              manualAdjustmentTotal:
                adjustmentInputs.adjustmentTotal.toString(),
              regularHours: timeInputs.regularHours.toString(),
              overtimeHours: timeInputs.overtimeHours.toString(),
              noShowDays: timeInputs.noShowDays.toString(),
              noShowDeduction: timeInputs.noShowDeduction.toString(),
              overtimeEarnings: timeInputs.overtimeEarnings.toString(),
            },
          },
        });

        if (negativeNetPay && negativeNetPayAction !== 'IGNORE') {
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity:
                negativeNetPayAction === 'BLOCK'
                  ? PayrollExceptionSeverity.BLOCKER
                  : PayrollExceptionSeverity.WARNING,
              errorType: 'NEGATIVE_NET_PAY',
              message: `Calculated net pay is negative (${totals.netPay.toString()} ${compensation.currencyCode}).`,
              details: {
                employeeCode: employee.employeeCode,
                netPay: totals.netPay.toString(),
                currencyCode: compensation.currencyCode,
              },
            },
          });
        }

        await this.prisma.payrollInputSnapshot.create({
          data: {
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
            sourceType: PayrollInputSnapshotSourceType.COMPENSATION,
            sourceId: compensation.id,
            effectiveDate: period.periodEnd,
            snapshotData: compensation as unknown as Prisma.InputJsonValue,
          },
        });

        if (leaveInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: leaveInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.LEAVE,
              sourceId: snapshot.requestId,
              effectiveDate: period.periodEnd,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (claimInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: claimInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.CLAIM,
              sourceId: snapshot.lineItemId,
              effectiveDate: period.periodEnd,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (loanInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: loanInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.LOAN,
              sourceId: snapshot.installmentId,
              effectiveDate: new Date(snapshot.dueDate),
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (tadaInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: tadaInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.TADA,
              sourceId: snapshot.allowanceId,
              effectiveDate: period.periodEnd,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (timeInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: timeInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: sourceSnapshotForTimeInput(snapshot.sourceType),
              sourceId: snapshot.inputId,
              effectiveDate: snapshot.workDate,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (benefitInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: benefitInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.BENEFIT,
              sourceId: snapshot.assignmentId,
              effectiveDate: period.periodEnd,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        if (adjustmentInputs.snapshots.length) {
          await this.prisma.payrollInputSnapshot.createMany({
            data: adjustmentInputs.snapshots.map((snapshot) => ({
              tenantId: user.tenantId,
              payrollRunEmployeeId: runEmployee.id,
              sourceType: PayrollInputSnapshotSourceType.MANUAL,
              sourceId: snapshot.adjustmentId,
              effectiveDate: period.periodEnd,
              snapshotData: snapshot as unknown as Prisma.InputJsonValue,
            })),
          });
        }

        await this.prisma.payrollRunLineItem.createMany({
          data: reportingLineItems.map((item) => ({
            ...item,
            tenantId: user.tenantId,
            payrollRunEmployeeId: runEmployee.id,
          })),
        });

        const allocationCost = totals.grossEarnings.plus(
          totals.employerContributions,
        );
        const allocation = await this.costAllocationService.allocate({
          tenantId: user.tenantId,
          employeeId: employee.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          payrollCost: allocationCost,
          currencyCode: compensation.currencyCode,
          settings: payrollSettings,
        });
        if (allocation.lines.length) {
          await this.prisma.payrollCostAllocationLine.createMany({
            data: allocation.lines.map((line) => ({
              tenantId: user.tenantId,
              payrollRunId: id,
              payrollRunEmployeeId: runEmployee.id,
              employeeId: employee.id,
              projectId: line.projectId,
              customerId: line.customerId,
              costCenterId: line.costCenterId,
              allocationPercentage: new Prisma.Decimal(
                line.allocationPercentage,
              ),
              originalAmount: new Prisma.Decimal(line.amount),
              currencyCode: line.currencyCode,
              reportingAmount: this.exchangeRateService.convert(
                line.amount,
                rateByCurrency.get(normalizeCurrency(line.currencyCode)) ??
                  new Prisma.Decimal(1),
              ),
              reportingCurrency,
              exchangeRate:
                rateByCurrency.get(normalizeCurrency(line.currencyCode)) ??
                new Prisma.Decimal(1),
              isBench: line.source === 'BENCH',
            })),
          });
        }
        for (const message of allocation.warnings) {
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: PayrollExceptionSeverity.WARNING,
              errorType: payrollAllocationWarningType(message),
              message,
            },
          });
        }
        for (const message of allocation.blockers) {
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: PayrollExceptionSeverity.BLOCKER,
              errorType: message.includes('exceeds')
                ? 'PROJECT_OVER_ALLOCATION'
                : 'PROJECT_UNDER_ALLOCATION',
              message,
            },
          });
        }

        if (claimInputs.claimLineItemIds.length) {
          await this.prisma.claimLineItem.updateMany({
            where: {
              tenantId: user.tenantId,
              id: { in: claimInputs.claimLineItemIds },
              payrollRunEmployeeId: null,
            },
            data: {
              payrollRunEmployeeId: runEmployee.id,
              payrollIncludedAt: new Date(),
            },
          });

          await this.markIncludedClaims(user, claimInputs.claimRequestIds);
        }

        if (tadaInputs.allowanceIds.length) {
          await this.prisma.businessTripAllowance.updateMany({
            where: {
              tenantId: user.tenantId,
              id: { in: tadaInputs.allowanceIds },
              payrollRunEmployeeId: null,
            },
            data: {
              payrollRunEmployeeId: runEmployee.id,
              payrollIncludedAt: new Date(),
            },
          });

          await this.markIncludedBusinessTrips(
            user,
            tadaInputs.businessTripIds,
          );
        }

        if (timeInputs.inputIds.length) {
          await this.prisma.timePayrollInput.updateMany({
            where: {
              tenantId: user.tenantId,
              id: { in: timeInputs.inputIds },
              payrollRunEmployeeId: null,
            },
            data: {
              payrollRunEmployeeId: runEmployee.id,
              status: TimePayrollInputStatus.INCLUDED_IN_PAYROLL,
            },
          });

          await this.audit(
            user,
            'TIME_PAYROLL_INPUTS_INCLUDED_IN_PAYROLL',
            'PayrollRunEmployee',
            runEmployee.id,
            null,
            { timeInputCount: timeInputs.inputIds.length },
          );
        }

        for (const warning of [
          ...preparedTimeInputs.warnings,
          ...timeInputs.warnings,
        ]) {
          await this.prisma.payrollException.create({
            data: {
              tenantId: user.tenantId,
              payrollRunId: id,
              employeeId: employee.id,
              severity: warning.severity,
              errorType: warning.errorType,
              message: warning.message,
            },
          });
        }

        await this.taxCalculationService.calculateTaxesForPayrollRunEmployee({
          tenantId: user.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          effectiveDate: period.periodEnd,
          actorUserId: user.userId,
        });

        await this.includeLoanInputs({
          tenantId: user.tenantId,
          payrollRunEmployeeId: runEmployee.id,
          snapshots: loanInputs.snapshots,
          actorUserId: user.userId,
        });
      }
    } catch (error) {
      await this.clearRunDraftData(user.tenantId, id, user.userId);
      await this.prisma.payrollRun.update({
        where: { id },
        data: { status: PayrollRunStatus.FAILED },
      });
      await this.audit(
        user,
        'PAYROLL_RUN_CALCULATION_FAILED',
        'PayrollRun',
        id,
        run,
        {
          status: PayrollRunStatus.FAILED,
          message:
            error instanceof Error
              ? error.message
              : 'Payroll calculation failed.',
        },
      );
      throw error;
    }

    const calculated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.CALCULATED,
        calculatedAt: new Date(),
        requiresRecalculation: false,
        inputChangedAfterCalculation: false,
      },
      include: runDetailInclude,
    });

    await this.audit(
      user,
      'PAYROLL_RUN_CALCULATED',
      'PayrollRun',
      id,
      run,
      calculated,
    );
    return mapRun(calculated);
  }

  async lockPayrollRun(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.REVIEWED &&
      run.status !== PayrollRunStatus.APPROVED &&
      run.status !== PayrollRunStatus.PAID
    ) {
      throw new BadRequestException(
        'Only CALCULATED, REVIEWED, APPROVED, or PAID payroll runs can be locked.',
      );
    }
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );

    const locked = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.LOCKED,
        lockedAt: new Date(),
        lockedBy: user.userId,
      },
      include: runDetailInclude,
    });
    await this.prisma.payrollRunEmployee.updateMany({
      where: { tenantId: user.tenantId, payrollRunId: id },
      data: { status: PayrollRunEmployeeStatus.LOCKED },
    });
    await this.audit(user, 'PAYROLL_RUN_LOCKED', 'PayrollRun', id, run, locked);
    return mapRun(locked);
  }

  async calculatePayrollRunTaxes(user: AuthenticatedUser, id: string) {
    const run = await this.findRunOrThrow(user.tenantId, id);
    await this.assertBusinessUnitAccess(
      user,
      run.payrollPeriod.payrollCalendar.businessUnitId,
    );
    return this.taxCalculationService.calculateTaxesForRun(user, id);
  }

  private async includeLoanInputs(input: {
    tenantId: string;
    payrollRunEmployeeId: string;
    snapshots: LoanPayrollSnapshot[];
    actorUserId: string;
  }) {
    if (!input.snapshots.length) return;
    const changes = await this.prisma.$transaction(async (tx) => {
      const includedAt = new Date();
      for (const snapshot of input.snapshots) {
        const claimed = await tx.loanInstallment.updateMany({
          where: {
            tenantId: input.tenantId,
            id: snapshot.installmentId,
            loanRequestId: snapshot.loanRequestId,
            status: LoanInstallmentStatus.SCHEDULED,
            payrollRunEmployeeId: null,
          },
          data: {
            status: LoanInstallmentStatus.INCLUDED_IN_PAYROLL,
            payrollRunEmployeeId: input.payrollRunEmployeeId,
            includedAt,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            `Loan installment ${snapshot.installmentId} was already consumed by another payroll run.`,
          );
        }
      }

      const balanceChanges: Array<{
        loanRequestId: string;
        before: string;
        after: string;
      }> = [];
      for (const loanRequestId of [
        ...new Set(input.snapshots.map((item) => item.loanRequestId)),
      ]) {
        const included = input.snapshots
          .filter((item) => item.loanRequestId === loanRequestId)
          .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
        const loan = await tx.loanRequest.findFirst({
          where: {
            tenantId: input.tenantId,
            id: loanRequestId,
            status: LoanRequestStatus.ACTIVE,
          },
          select: { outstandingBalance: true },
        });
        if (!loan) {
          throw new ConflictException(
            `Active loan ${loanRequestId} was not found while including its installment.`,
          );
        }
        const balance = Prisma.Decimal.max(
          loan.outstandingBalance.minus(included),
          0,
        );
        await tx.loanRequest.update({
          where: { id: loanRequestId },
          data: {
            outstandingBalance: balance,
            ...(balance.eq(0)
              ? { status: LoanRequestStatus.SETTLED, settledAt: includedAt }
              : {}),
          },
        });
        balanceChanges.push({
          loanRequestId,
          before: loan.outstandingBalance.toString(),
          after: balance.toString(),
        });
      }
      return balanceChanges;
    });
    for (const change of changes) {
      await this.auditService.log({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'LOAN_INSTALLMENT_INCLUDED_IN_PAYROLL',
        entityType: 'LoanRequest',
        entityId: change.loanRequestId,
        beforeSnapshot: { outstandingBalance: change.before },
        afterSnapshot: {
          outstandingBalance: change.after,
          payrollRunEmployeeId: input.payrollRunEmployeeId,
          installmentIds: input.snapshots
            .filter((item) => item.loanRequestId === change.loanRequestId)
            .map((item) => item.installmentId),
        },
      });
    }
  }

  private async clearRunDraftData(
    tenantId: string,
    payrollRunId: string,
    actorUserId: string,
  ) {
    const restoredLoans: Array<{
      loanRequestId: string;
      installmentId: string;
      amount: string;
    }> = [];
    await this.prisma.$transaction(async (tx) => {
      const employees = await tx.payrollRunEmployee.findMany({
        where: { tenantId, payrollRunId },
        select: { id: true },
      });
      const employeeIds = employees.map((item) => item.id);
      if (employeeIds.length) {
        const includedClaimLines = await tx.claimLineItem.findMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          select: { claimRequestId: true },
        });
        const includedTripAllowances = await tx.businessTripAllowance.findMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          select: { businessTripId: true },
        });
        const loanInstallments = await tx.loanInstallment.findMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          select: { id: true, loanRequestId: true, amount: true },
        });
        for (const installment of loanInstallments) {
          const restored = await tx.loanInstallment.updateMany({
            where: {
              id: installment.id,
              tenantId,
              payrollRunEmployeeId: { in: employeeIds },
              status: LoanInstallmentStatus.INCLUDED_IN_PAYROLL,
            },
            data: {
              payrollRunEmployeeId: null,
              status: LoanInstallmentStatus.SCHEDULED,
              includedAt: null,
            },
          });
          if (restored.count !== 1) continue;
          restoredLoans.push({
            loanRequestId: installment.loanRequestId,
            installmentId: installment.id,
            amount: installment.amount.toString(),
          });
          await tx.loanRequest.update({
            where: { id: installment.loanRequestId },
            data: {
              status: LoanRequestStatus.ACTIVE,
              settledAt: null,
              outstandingBalance: { increment: installment.amount },
            },
          });
        }
        await tx.payrollInputSnapshot.deleteMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        });
        await tx.payrollRunLineItem.deleteMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        });
        await tx.payrollCostAllocationLine.deleteMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
        });
        await tx.claimLineItem.updateMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
        });
        await tx.claimRequest.updateMany({
          where: {
            tenantId,
            id: {
              in: [
                ...new Set(
                  includedClaimLines.map((item) => item.claimRequestId),
                ),
              ],
            },
            status: ClaimRequestStatus.INCLUDED_IN_PAYROLL,
          },
          data: {
            status: ClaimRequestStatus.PAYROLL_APPROVED,
            includedInPayrollAt: null,
          },
        });
        await tx.businessTripAllowance.updateMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
        });
        await tx.businessTrip.updateMany({
          where: {
            tenantId,
            id: {
              in: [
                ...new Set(
                  includedTripAllowances.map((item) => item.businessTripId),
                ),
              ],
            },
            status: BusinessTripStatus.INCLUDED_IN_PAYROLL,
          },
          data: {
            status: BusinessTripStatus.APPROVED,
            includedInPayrollAt: null,
          },
        });
        await tx.timePayrollInput.updateMany({
          where: { tenantId, payrollRunEmployeeId: { in: employeeIds } },
          data: {
            payrollRunEmployeeId: null,
            status: TimePayrollInputStatus.PREPARED,
          },
        });
      }
      await tx.payrollRunEmployee.deleteMany({
        where: { tenantId, payrollRunId },
      });
      await tx.payrollException.deleteMany({
        where: { tenantId, payrollRunId },
      });
      await tx.payrollExchangeRateLock.deleteMany({
        where: { tenantId, payrollRunId },
      });
    });
    for (const restored of restoredLoans) {
      await this.auditService.log({
        tenantId,
        actorUserId,
        action: 'LOAN_INSTALLMENT_ROLLED_BACK_FROM_PAYROLL',
        entityType: 'LoanRequest',
        entityId: restored.loanRequestId,
        afterSnapshot: {
          payrollRunId,
          installmentId: restored.installmentId,
          restoredAmount: restored.amount,
        },
      });
    }
  }

  private async buildLeavePayrollInputs(params: {
    tenantId: string;
    employeeId: string;
    periodStart: Date;
    periodEnd: Date;
    baseAmount: Prisma.Decimal;
    currencyCode: string;
  }) {
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: params.periodEnd },
        endDate: { gte: params.periodStart },
      },
      include: {
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            isPaid: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    const periodDays = new Prisma.Decimal(
      countInclusiveDays(params.periodStart, params.periodEnd),
    );
    let unpaidDays = new Prisma.Decimal(0);
    let unpaidDeduction = new Prisma.Decimal(0);
    const snapshots: LeavePayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];

    for (const leave of approvedLeaves) {
      const days = new Prisma.Decimal(
        countOverlapDays(
          leave.startDate,
          leave.endDate,
          params.periodStart,
          params.periodEnd,
        ),
      );

      if (days.lte(0)) {
        continue;
      }

      snapshots.push({
        leaveType: {
          id: leave.leaveType.id,
          code: leave.leaveType.code,
          name: leave.leaveType.name,
          category: leave.leaveType.category,
        },
        days: days.toString(),
        isPaid: leave.leaveType.isPaid,
        requestId: leave.id,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
      });

      if (leave.leaveType.isPaid) {
        continue;
      }

      const amount = params.baseAmount.div(periodDays).mul(days);
      unpaidDays = unpaidDays.plus(days);
      unpaidDeduction = unpaidDeduction.plus(amount);
      lineItems.push({
        payComponentId: null,
        category: PayrollRunLineItemCategory.DEDUCTION,
        sourceType: 'LEAVE',
        sourceId: leave.id,
        label: 'Unpaid Leave',
        quantity: days,
        rate: params.baseAmount.div(periodDays),
        amount,
        currencyCode: params.currencyCode,
        isTaxable: false,
        affectsGrossPay: false,
        affectsNetPay: true,
        displayOnPayslip: true,
        displayOrder: 900,
      });
    }

    return { snapshots, lineItems, unpaidDays, unpaidDeduction };
  }

  private async buildClaimPayrollInputs(params: {
    tenantId: string;
    employeeId: string;
    cutoffDate: Date;
  }) {
    const claims = await this.prisma.claimRequest.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: ClaimRequestStatus.PAYROLL_APPROVED,
        payrollApprovedAt: { lte: params.cutoffDate },
      },
      include: {
        lineItems: {
          where: {
            payrollRunEmployeeId: null,
            transactionDate: { lte: params.cutoffDate },
          },
          include: { claimType: true, claimSubType: true },
          orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ payrollApprovedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const snapshots: ClaimPayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const claimLineItemIds: string[] = [];
    const claimRequestIds = new Set<string>();
    let reimbursementTotal = new Prisma.Decimal(0);

    for (const claim of claims) {
      for (const line of claim.lineItems) {
        const amount = line.approvedAmount ?? line.amount;
        if (amount.lte(0)) continue;
        const label = [
          line.claimSubType?.name,
          line.claimType.name,
          claim.title,
        ].find(Boolean) as string;

        snapshots.push({
          claimRequestId: claim.id,
          lineItemId: line.id,
          title: claim.title,
          claimType: {
            id: line.claimType.id,
            code: line.claimType.code,
            name: line.claimType.name,
          },
          claimSubType: line.claimSubType
            ? {
                id: line.claimSubType.id,
                code: line.claimSubType.code,
                name: line.claimSubType.name,
              }
            : null,
          amount: amount.toString(),
          currencyCode: line.currencyCode,
          transactionDate: line.transactionDate.toISOString(),
          receiptDocumentId: line.receiptDocumentId,
        });
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.REIMBURSEMENT,
          sourceType: 'CLAIM',
          sourceId: line.id,
          label,
          quantity: null,
          rate: null,
          amount,
          currencyCode: line.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 700,
        });
        claimLineItemIds.push(line.id);
        claimRequestIds.add(claim.id);
        reimbursementTotal = reimbursementTotal.plus(amount);
      }
    }

    return {
      snapshots,
      lineItems,
      claimLineItemIds,
      claimRequestIds: [...claimRequestIds],
      reimbursementTotal,
    };
  }

  private async buildLoanPayrollInputs(params: {
    tenantId: string;
    employeeId: string;
    periodEnd: Date;
    currencyCode: string;
  }) {
    const installments = await this.prisma.loanInstallment.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: LoanInstallmentStatus.SCHEDULED,
        dueDate: { lte: params.periodEnd },
        loanRequest: { status: LoanRequestStatus.ACTIVE },
      },
      include: {
        loanRequest: {
          select: {
            id: true,
            requestNumber: true,
            currencyCode: true,
            loanPolicy: {
              select: {
                id: true,
                code: true,
                name: true,
                deductionPayComponentId: true,
                postingCategory: true,
                payslipVisible: true,
                negativeNetPayHandling: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
    const snapshots: LoanPayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    let deductionTotal = new Prisma.Decimal(0);
    for (const installment of installments) {
      if (installment.loanRequest.currencyCode !== params.currencyCode) {
        throw new BadRequestException(
          `Loan ${installment.loanRequest.requestNumber} is in ${installment.loanRequest.currencyCode}, but payroll is in ${params.currencyCode}. Configure a supported payroll conversion before calculating this run.`,
        );
      }
      deductionTotal = deductionTotal.plus(installment.amount);
      snapshots.push({
        installmentId: installment.id,
        loanRequestId: installment.loanRequestId,
        requestNumber: installment.loanRequest.requestNumber,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate.toISOString(),
        amount: installment.amount.toString(),
        currencyCode: installment.loanRequest.currencyCode,
        loanPolicyId: installment.loanRequest.loanPolicy?.id ?? null,
        loanPolicyCode: installment.loanRequest.loanPolicy?.code ?? null,
      });
      lineItems.push({
        payComponentId:
          installment.loanRequest.loanPolicy?.deductionPayComponentId ?? null,
        category: PayrollRunLineItemCategory.DEDUCTION,
        sourceType: 'LOAN',
        sourceId: installment.id,
        label: `Loan ${installment.loanRequest.requestNumber} / installment ${installment.installmentNumber}`,
        quantity: null,
        rate: null,
        amount: installment.amount,
        currencyCode: installment.loanRequest.currencyCode,
        isTaxable: false,
        affectsGrossPay: false,
        affectsNetPay: true,
        displayOnPayslip:
          installment.loanRequest.loanPolicy?.payslipVisible ?? true,
        displayOrder: 920,
      });
    }
    return {
      snapshots,
      lineItems,
      deductionTotal,
    };
  }

  private async buildTadaPayrollInputs(params: {
    tenantId: string;
    employeeId: string;
  }) {
    const trips = await this.prisma.businessTrip.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        status: {
          in: [BusinessTripStatus.APPROVED, BusinessTripStatus.COMPLETED],
        },
      },
      include: {
        allowances: {
          where: { payrollRunEmployeeId: null },
          include: { travelAllowanceRule: true },
          orderBy: [{ createdAt: 'asc' }],
        },
      },
      orderBy: [{ approvedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const snapshots: TadaPayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const allowanceIds: string[] = [];
    const businessTripIds = new Set<string>();
    let reimbursementTotal = new Prisma.Decimal(0);

    for (const trip of trips) {
      for (const allowance of trip.allowances) {
        if (allowance.amount.lte(0)) continue;
        const label = `${formatAllowanceType(allowance.allowanceType)} / ${trip.title}`;

        snapshots.push({
          businessTripId: trip.id,
          allowanceId: allowance.id,
          title: trip.title,
          destinationCountry: trip.destinationCountry,
          destinationCity: trip.destinationCity,
          startDate: trip.startDate.toISOString(),
          endDate: trip.endDate.toISOString(),
          allowanceType: allowance.allowanceType,
          calculationBasis: allowance.calculationBasis,
          quantity: allowance.quantity.toString(),
          rate: allowance.rate.toString(),
          amount: allowance.amount.toString(),
          currencyCode: allowance.currencyCode,
        });
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.REIMBURSEMENT,
          sourceType: 'TADA',
          sourceId: allowance.id,
          label,
          quantity: allowance.quantity,
          rate: allowance.rate,
          amount: allowance.amount,
          currencyCode: allowance.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 720,
        });
        allowanceIds.push(allowance.id);
        businessTripIds.add(trip.id);
        reimbursementTotal = reimbursementTotal.plus(allowance.amount);
      }
    }

    return {
      snapshots,
      lineItems,
      allowanceIds,
      businessTripIds: [...businessTripIds],
      reimbursementTotal,
    };
  }

  private buildTimePayrollInputs(params: {
    prepared: Awaited<
      ReturnType<TimePayrollPreparationService['prepareTimeInputsForPayroll']>
    >;
    baseAmount: Prisma.Decimal;
    currencyCode: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const policy = params.prepared.policy;
    const overtimePolicy = params.prepared.overtimePolicy;
    const snapshots: TimePayrollSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    const inputIds: string[] = [];
    const warnings: TimePayrollWarning[] = [];
    let regularHours = new Prisma.Decimal(0);
    let overtimeHours = new Prisma.Decimal(0);
    let noShowDays = new Prisma.Decimal(0);
    let noShowDeduction = new Prisma.Decimal(0);
    let overtimeEarnings = new Prisma.Decimal(0);

    if (!policy) {
      return {
        snapshots,
        lineItems,
        inputIds,
        warnings,
        regularHours,
        overtimeHours,
        noShowDays,
        noShowDeduction,
        overtimeEarnings,
      };
    }

    const calendarDays = new Prisma.Decimal(
      countInclusiveDays(params.periodStart, params.periodEnd),
    );
    const preparedWorkingDays = new Prisma.Decimal(
      new Set(
        params.prepared.inputs
          .filter((input) => input.regularHours.gt(0))
          .map((input) => input.workDate.toISOString().slice(0, 10)),
      ).size,
    );
    const dailyRate = resolveDailyRate({
      baseAmount: params.baseAmount,
      calendarDays,
      workingDays: preparedWorkingDays,
      standardWorkingDaysPerMonth: policy.standardWorkingDaysPerMonth,
      prorationBasis: policy.prorationBasis,
      warnings,
    });
    const payableHours = policy.standardWorkingDaysPerMonth?.gt(0)
      ? policy.standardWorkingDaysPerMonth.mul(policy.standardHoursPerDay)
      : calendarDays.mul(policy.standardHoursPerDay);
    const hourlyRate = payableHours.gt(0)
      ? params.baseAmount.div(payableHours)
      : params.baseAmount.div(calendarDays.mul(policy.standardHoursPerDay));
    const overtimeMultiplier =
      overtimePolicy?.rateMultiplier ?? new Prisma.Decimal(1);

    for (const input of params.prepared.inputs) {
      inputIds.push(input.id);
      regularHours = regularHours.plus(input.regularHours);
      overtimeHours = overtimeHours.plus(input.overtimeHours);
      noShowDays = noShowDays.plus(input.absenceDays);
      snapshots.push({
        inputId: input.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        workDate: input.workDate,
        regularHours: input.regularHours.toString(),
        overtimeHours: input.overtimeHours.toString(),
        absenceDays: input.absenceDays.toString(),
        metadata: input.metadata,
      });

      if (
        input.sourceType === TimePayrollInputSourceType.NO_SHOW &&
        policy.deductNoShow &&
        input.absenceDays.gt(0)
      ) {
        const amount = dailyRate.mul(input.absenceDays);
        noShowDeduction = noShowDeduction.plus(amount);
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.DEDUCTION,
          sourceType: 'NO_SHOW',
          sourceId: input.id,
          label: 'No-show / unpaid absence',
          quantity: input.absenceDays,
          rate: dailyRate,
          amount,
          currencyCode: params.currencyCode,
          isTaxable: false,
          affectsGrossPay: false,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 910,
        });
      }

      if (
        input.sourceType === TimePayrollInputSourceType.OVERTIME &&
        input.overtimeHours.gt(0)
      ) {
        const rate = hourlyRate.mul(overtimeMultiplier);
        const amount = input.overtimeHours.mul(rate);
        overtimeEarnings = overtimeEarnings.plus(amount);
        lineItems.push({
          payComponentId: null,
          category: PayrollRunLineItemCategory.EARNING,
          sourceType: 'OVERTIME',
          sourceId: input.id,
          label: 'Overtime',
          quantity: input.overtimeHours,
          rate,
          amount,
          currencyCode: params.currencyCode,
          isTaxable: false,
          affectsGrossPay: true,
          affectsNetPay: true,
          displayOnPayslip: true,
          displayOrder: 650,
        });
      }
    }

    return {
      snapshots,
      lineItems,
      inputIds,
      warnings,
      regularHours,
      overtimeHours,
      noShowDays,
      noShowDeduction,
      overtimeEarnings,
    };
  }

  private async buildAdjustmentPayrollInputs(params: {
    tenantId: string;
    payrollRunId: string;
    employeeId: string;
    currencyCode: string;
  }) {
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: {
        tenantId: params.tenantId,
        payrollRunId: params.payrollRunId,
        employeeId: params.employeeId,
        status: PayrollAdjustmentStatus.APPROVED,
      },
      include: { payComponent: true },
      orderBy: [{ approvedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const snapshots: PayrollAdjustmentSnapshot[] = [];
    const lineItems: PayrollLineItemDraft[] = [];
    let adjustmentTotal = new Prisma.Decimal(0);

    for (const adjustment of adjustments) {
      snapshots.push({
        adjustmentId: adjustment.id,
        payComponentId: adjustment.payComponentId,
        label: adjustment.label,
        amount: adjustment.amount.toString(),
        currencyCode: adjustment.currencyCode,
        category: adjustment.category,
        reason: adjustment.reason,
        notes: adjustment.notes,
        sourceReference: adjustment.sourceReference,
        approvedAt: adjustment.approvedAt?.toISOString() ?? null,
        approvedBy: adjustment.approvedBy,
      });
      adjustmentTotal = adjustmentTotal.plus(adjustment.amount);
      lineItems.push({
        payComponentId: adjustment.payComponentId,
        category: adjustment.category,
        sourceType: 'MANUAL_ADJUSTMENT',
        sourceId: adjustment.id,
        label: adjustment.payComponent?.name ?? adjustment.label,
        quantity: null,
        rate: null,
        amount: adjustment.amount,
        currencyCode: adjustment.currencyCode,
        isTaxable: adjustment.payComponent?.isTaxable ?? false,
        affectsGrossPay: adjustment.payComponent?.affectsGrossPay ?? true,
        affectsNetPay: adjustment.payComponent?.affectsNetPay ?? true,
        displayOnPayslip: adjustment.payComponent?.displayOnPayslip ?? true,
        displayOrder: adjustment.payComponent?.displayOrder ?? 800,
      });
    }

    return { snapshots, lineItems, adjustmentTotal };
  }

  private async markIncludedClaims(
    user: AuthenticatedUser,
    claimRequestIds: string[],
  ) {
    for (const claimRequestId of claimRequestIds) {
      const remaining = await this.prisma.claimLineItem.count({
        where: {
          tenantId: user.tenantId,
          claimRequestId,
          payrollRunEmployeeId: null,
        },
      });
      if (remaining > 0) continue;
      const updated = await this.prisma.claimRequest.update({
        where: { id: claimRequestId },
        data: {
          status: ClaimRequestStatus.INCLUDED_IN_PAYROLL,
          includedInPayrollAt: new Date(),
        },
      });
      await this.audit(
        user,
        'CLAIM_INCLUDED_IN_PAYROLL',
        'ClaimRequest',
        claimRequestId,
        null,
        updated,
      );
    }
  }

  private async markIncludedBusinessTrips(
    user: AuthenticatedUser,
    businessTripIds: string[],
  ) {
    for (const businessTripId of businessTripIds) {
      const remaining = await this.prisma.businessTripAllowance.count({
        where: {
          tenantId: user.tenantId,
          businessTripId,
          payrollRunEmployeeId: null,
        },
      });
      if (remaining > 0) continue;
      const updated = await this.prisma.businessTrip.update({
        where: { id: businessTripId },
        data: {
          status: BusinessTripStatus.INCLUDED_IN_PAYROLL,
          includedInPayrollAt: new Date(),
        },
      });
      await this.audit(
        user,
        'BUSINESS_TRIP_INCLUDED_IN_PAYROLL',
        'BusinessTrip',
        businessTripId,
        null,
        updated,
      );
    }
  }

  private async findCalendarOrThrow(tenantId: string, id: string) {
    const calendar = await this.prisma.payrollCalendar.findFirst({
      where: { tenantId, id },
      include: { businessUnit: { select: { id: true, name: true } } },
    });
    if (!calendar)
      throw new NotFoundException('Payroll calendar was not found.');
    return calendar;
  }

  private async findPeriodOrThrow(tenantId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId, id },
      include: { payrollCalendar: true },
    });
    if (!period) throw new NotFoundException('Payroll period was not found.');
    return period;
  }

  private async findRunOrThrow(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId, id },
      include: runDetailInclude,
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    return run;
  }

  private async findAdjustmentOrThrow(
    tenantId: string,
    payrollRunId: string,
    id: string,
  ) {
    const adjustment = await this.prisma.payrollAdjustment.findFirst({
      where: { tenantId, payrollRunId, id },
    });
    if (!adjustment) {
      throw new NotFoundException('Payroll adjustment was not found.');
    }
    return adjustment;
  }

  private assertRunEditableForAdjustments(status: PayrollRunStatus) {
    if (
      status !== PayrollRunStatus.DRAFT &&
      status !== PayrollRunStatus.FAILED
    ) {
      throw new BadRequestException(
        'Payroll adjustments can only be changed before calculation.',
      );
    }
  }

  private async assertEmployeeIsEligibleForRun(
    tenantId: string,
    run: Prisma.PayrollRunGetPayload<{ include: typeof runDetailInclude }>,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: buildPayrollEmployeeEligibilityWhere({
        tenantId,
        periodStart: run.payrollPeriod.periodStart,
        periodEnd: run.payrollPeriod.periodEnd,
        businessUnitId: run.payrollPeriod.payrollCalendar.businessUnitId,
      }),
      select: { id: true },
    });
    if (!employee || employee.id !== employeeId) {
      const exactEmployee = await this.prisma.employee.findFirst({
        where: {
          ...buildPayrollEmployeeEligibilityWhere({
            tenantId,
            periodStart: run.payrollPeriod.periodStart,
            periodEnd: run.payrollPeriod.periodEnd,
            businessUnitId: run.payrollPeriod.payrollCalendar.businessUnitId,
          }),
          id: employeeId,
        },
        select: { id: true },
      });
      if (!exactEmployee) {
        throw new BadRequestException(
          'Employee is not eligible for this payroll run.',
        );
      }
    }
  }

  private async assertAdjustmentPayComponent(
    tenantId: string,
    payComponentId: string | null | undefined,
    category: PayrollRunLineItemCategory,
  ) {
    if (!payComponentId) return;
    const component = await this.prisma.payComponent.findFirst({
      where: { tenantId, id: payComponentId, isActive: true },
      select: { componentType: true },
    });
    if (!component) {
      throw new BadRequestException('Pay component was not found.');
    }
    if (component.componentType !== category) {
      throw new BadRequestException(
        'Pay component type must match the adjustment category.',
      );
    }
  }

  private async assertCurrency(tenantId: string, currencyCode: string) {
    const currency = await this.prisma.currency.findFirst({
      where: {
        tenantId,
        code: currencyCode,
        status: ConfigurationStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!currency) {
      throw new BadRequestException('Currency was not found for this tenant.');
    }
  }

  private async assertNoDefaultCalendar(
    tenantId: string,
    businessUnitId?: string | null,
    excludeId?: string,
  ) {
    const existing = await this.prisma.payrollCalendar.findFirst({
      where: {
        tenantId,
        businessUnitId: businessUnitId ?? null,
        isDefault: true,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Only one default active payroll calendar is allowed per tenant/business-unit scope.',
      );
    }
  }

  private async assertBusinessUnitAccess(
    user: AuthenticatedUser,
    businessUnitId?: string | null,
  ) {
    if (!businessUnitId) return;
    const businessUnit = await this.prisma.businessUnit.findFirst({
      where: { tenantId: user.tenantId, id: businessUnitId },
      select: { id: true },
    });
    if (!businessUnit)
      throw new BadRequestException(
        'Business unit was not found for this tenant.',
      );
    const context = user.accessContext;
    if (!context || context.canAccessAllBusinessUnits) return;
    if (!context.accessibleBusinessUnitIds.includes(businessUnitId)) {
      throw new ForbiddenException(
        'You do not have access to this business unit.',
      );
    }
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(value);
}

function endOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function assertPeriodDates(
  periodStart: Date,
  periodEnd: Date,
  paymentDate: Date | null,
) {
  if (periodEnd < periodStart) {
    throw new BadRequestException(
      'periodEnd must be greater than or equal to periodStart.',
    );
  }
  if (paymentDate && paymentDate < periodEnd) {
    throw new BadRequestException('paymentDate cannot be before periodEnd.');
  }
}

function countInclusiveDays(startDate: Date, endDate: Date) {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  return Math.floor((end - start) / 86_400_000) + 1;
}

function countOverlapDays(
  leaveStart: Date,
  leaveEnd: Date,
  periodStart: Date,
  periodEnd: Date,
) {
  const start = leaveStart > periodStart ? leaveStart : periodStart;
  const end = leaveEnd < periodEnd ? leaveEnd : periodEnd;
  if (end < start) return 0;
  return countInclusiveDays(start, end);
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

type CompensationPayload = Awaited<
  ReturnType<CompensationResolverService['resolveActiveCompensation']>
>;

type PayrollLineItemDraft = {
  payComponentId: string | null;
  category: PayrollRunLineItemCategory;
  sourceType: string;
  sourceId: string | null;
  label: string;
  quantity: Prisma.Decimal | null;
  rate: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  currencyCode: string;
  reportingAmount?: Prisma.Decimal;
  reportingCurrency?: string;
  exchangeRate?: Prisma.Decimal;
  isTaxable: boolean;
  affectsGrossPay: boolean;
  affectsNetPay: boolean;
  displayOnPayslip: boolean;
  displayOrder: number;
};

type LeavePayrollSnapshot = {
  leaveType: {
    id: string;
    code: string;
    name: string;
    category: string;
  };
  days: string;
  isPaid: boolean;
  requestId: string;
  startDate: string;
  endDate: string;
};

type PayrollAdjustmentSnapshot = {
  adjustmentId: string;
  payComponentId: string | null;
  label: string;
  amount: string;
  currencyCode: string;
  category: PayrollRunLineItemCategory;
  reason: string | null;
  notes: string | null;
  sourceReference: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
};

type ClaimPayrollSnapshot = {
  claimRequestId: string;
  lineItemId: string;
  title: string;
  claimType: {
    id: string;
    code: string;
    name: string;
  };
  claimSubType: {
    id: string;
    code: string;
    name: string;
  } | null;
  amount: string;
  currencyCode: string;
  transactionDate: string;
  receiptDocumentId: string | null;
};

type LoanPayrollSnapshot = {
  installmentId: string;
  loanRequestId: string;
  requestNumber: string;
  installmentNumber: number;
  dueDate: string;
  amount: string;
  currencyCode: string;
  loanPolicyId: string | null;
  loanPolicyCode: string | null;
};

type TadaPayrollSnapshot = {
  businessTripId: string;
  allowanceId: string;
  title: string;
  destinationCountry: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  allowanceType: string;
  calculationBasis: string;
  quantity: string;
  rate: string;
  amount: string;
  currencyCode: string;
};

type TimePayrollSnapshot = {
  inputId: string;
  sourceType: TimePayrollInputSourceType;
  sourceId: string | null;
  workDate: Date;
  regularHours: string;
  overtimeHours: string;
  absenceDays: string;
  metadata: Prisma.JsonValue | null;
};

type TimePayrollWarning = {
  severity: PayrollExceptionSeverity;
  errorType: string;
  message: string;
};

function buildLineItems(
  compensation: NonNullable<CompensationPayload>,
): PayrollLineItemDraft[] {
  if (!compensation.components.length) {
    return [
      {
        payComponentId: null,
        category: PayrollRunLineItemCategory.EARNING,
        sourceType: 'COMPENSATION',
        sourceId: compensation.id,
        label: 'Base Compensation',
        quantity: null,
        rate: null,
        amount: compensation.baseAmount,
        currencyCode: compensation.currencyCode,
        isTaxable: false,
        affectsGrossPay: true,
        affectsNetPay: true,
        displayOnPayslip: true,
        displayOrder: 0,
      },
    ];
  }

  return compensation.components.map((component) => ({
    payComponentId: component.payComponentId,
    category: component.payComponent
      .componentType as unknown as PayrollRunLineItemCategory,
    sourceType: 'COMPENSATION',
    sourceId: component.id,
    label: component.payComponent.name,
    quantity: null,
    rate: component.percentage,
    amount: component.calculatedAmount,
    currencyCode: compensation.currencyCode,
    isTaxable: component.payComponent.isTaxable,
    affectsGrossPay: component.payComponent.affectsGrossPay,
    affectsNetPay: component.payComponent.affectsNetPay,
    displayOnPayslip: component.payComponent.displayOnPayslip,
    displayOrder: component.displayOrder,
  }));
}

export function compensationRequiresDisbursement(
  compensation: NonNullable<CompensationPayload>,
) {
  return calculateTotals(buildLineItems(compensation)).netPay.gt(0);
}

export function buildPayrollEmployeeEligibilityWhere(input: {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  businessUnitId?: string | null;
}): Prisma.EmployeeWhereInput {
  return {
    tenantId: input.tenantId,
    isDraftProfile: false,
    hireDate: { lte: input.periodEnd },
    AND: [
      {
        OR: [
          {
            employmentStatus: {
              in: [
                EmployeeEmploymentStatus.ACTIVE,
                EmployeeEmploymentStatus.PROBATION,
                EmployeeEmploymentStatus.NOTICE,
              ],
            },
          },
          {
            employmentStatus: EmployeeEmploymentStatus.TERMINATED,
            terminationDate: {
              gte: input.periodStart,
              lte: input.periodEnd,
            },
          },
        ],
      },
      {
        OR: [
          { terminationDate: null },
          { terminationDate: { gte: input.periodStart } },
        ],
      },
    ],
    ...(input.businessUnitId
      ? {
          OR: [
            { businessUnitId: input.businessUnitId },
            {
              businessUnitId: null,
              user: { businessUnitId: input.businessUnitId },
            },
          ],
        }
      : {}),
  };
}

function formatAllowanceType(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function sourceSnapshotForTimeInput(sourceType: TimePayrollInputSourceType) {
  if (sourceType === TimePayrollInputSourceType.ATTENDANCE) {
    return PayrollInputSnapshotSourceType.ATTENDANCE;
  }
  if (sourceType === TimePayrollInputSourceType.TIMESHEET) {
    return PayrollInputSnapshotSourceType.TIMESHEET;
  }
  if (sourceType === TimePayrollInputSourceType.OVERTIME) {
    return PayrollInputSnapshotSourceType.POLICY;
  }
  return PayrollInputSnapshotSourceType.MANUAL;
}

function resolveDailyRate(input: {
  baseAmount: Prisma.Decimal;
  calendarDays: Prisma.Decimal;
  workingDays: Prisma.Decimal;
  standardWorkingDaysPerMonth: Prisma.Decimal | null;
  prorationBasis: TimeProrationBasis;
  warnings: TimePayrollWarning[];
}) {
  if (input.prorationBasis === TimeProrationBasis.FIXED_30_DAYS) {
    return input.baseAmount.div(30);
  }
  if (input.prorationBasis === TimeProrationBasis.WORKING_DAYS) {
    if (input.standardWorkingDaysPerMonth?.gt(0)) {
      return input.baseAmount.div(input.standardWorkingDaysPerMonth);
    }
    if (input.workingDays.gt(0)) {
      return input.baseAmount.div(input.workingDays);
    }
    input.warnings.push({
      severity: PayrollExceptionSeverity.WARNING,
      errorType: 'WORKING_DAYS_UNAVAILABLE',
      message:
        'Working days were unavailable for time proration; calendar days were used.',
    });
  }
  return input.baseAmount.div(input.calendarDays);
}

function calculateTotals(lineItems: PayrollLineItemDraft[]) {
  let grossEarnings = new Prisma.Decimal(0);
  let totalDeductions = new Prisma.Decimal(0);
  let totalTaxes = new Prisma.Decimal(0);
  let totalReimbursements = new Prisma.Decimal(0);
  let employerContributions = new Prisma.Decimal(0);

  for (const item of lineItems) {
    const amount = new Prisma.Decimal(item.amount);
    if (
      item.category === PayrollRunLineItemCategory.EARNING ||
      item.category === PayrollRunLineItemCategory.ALLOWANCE
    ) {
      grossEarnings = grossEarnings.plus(amount);
    } else if (item.category === PayrollRunLineItemCategory.DEDUCTION) {
      totalDeductions = totalDeductions.plus(amount.abs());
    } else if (item.category === PayrollRunLineItemCategory.TAX) {
      totalTaxes = totalTaxes.plus(amount.abs());
    } else if (item.category === PayrollRunLineItemCategory.REIMBURSEMENT) {
      totalReimbursements = totalReimbursements.plus(amount);
    } else if (
      item.category === PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION
    ) {
      employerContributions = employerContributions.plus(amount);
    }
  }

  return {
    grossEarnings,
    totalDeductions,
    totalTaxes,
    totalReimbursements,
    employerContributions,
    netPay: grossEarnings
      .plus(totalReimbursements)
      .minus(totalDeductions)
      .minus(totalTaxes),
  };
}

function payrollAllocationWarningType(message: string) {
  if (message.toLowerCase().includes('customer')) {
    return 'PROJECT_CUSTOMER_ACCOUNT_UNAVAILABLE';
  }
  return 'PROJECT_UNDER_ALLOCATION';
}

function mapRun(
  run: Prisma.PayrollRunGetPayload<{ include: typeof runDetailInclude }>,
) {
  return {
    ...run,
    employees: run.employees.map(mapRunEmployee),
  };
}

function mapRunEmployee(
  item: Prisma.PayrollRunEmployeeGetPayload<{
    include: {
      employee: {
        select: {
          id: true;
          employeeCode: true;
          firstName: true;
          lastName: true;
        };
      };
      lineItems: { include: { payComponent: true } };
    };
  }>,
) {
  return {
    ...item,
    grossEarnings: item.grossEarnings.toString(),
    totalDeductions: item.totalDeductions.toString(),
    totalTaxes: item.totalTaxes.toString(),
    totalReimbursements: item.totalReimbursements.toString(),
    employerContributions: item.employerContributions.toString(),
    netPay: item.netPay.toString(),
    exchangeRate: item.exchangeRate?.toString() ?? null,
    grossEarningsReporting: item.grossEarningsReporting?.toString() ?? null,
    totalDeductionsReporting: item.totalDeductionsReporting?.toString() ?? null,
    totalTaxesReporting: item.totalTaxesReporting?.toString() ?? null,
    totalReimbursementsReporting:
      item.totalReimbursementsReporting?.toString() ?? null,
    employerContributionsReporting:
      item.employerContributionsReporting?.toString() ?? null,
    netPayReporting: item.netPayReporting?.toString() ?? null,
    lineItems: item.lineItems.map((line) => ({
      ...line,
      quantity: line.quantity?.toString() ?? null,
      rate: line.rate?.toString() ?? null,
      amount: line.amount.toString(),
      reportingAmount: line.reportingAmount?.toString() ?? null,
      exchangeRate: line.exchangeRate?.toString() ?? null,
    })),
  };
}

function mapAdjustment<T extends { amount: Prisma.Decimal }>(adjustment: T) {
  const employee = (
    adjustment as T & {
      employee?: {
        employeeCode: string | null;
        firstName: string;
        lastName: string;
      };
    }
  ).employee;
  return {
    ...adjustment,
    amount: adjustment.amount.toString(),
    employeeName: employee
      ? `${employee.firstName} ${employee.lastName}`.trim()
      : undefined,
    employeeCode: employee?.employeeCode,
  };
}
