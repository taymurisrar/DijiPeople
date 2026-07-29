import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayComponentCalculationMethod, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompensationResolverService } from './compensation-resolver.service';
import {
  AssignSalaryPackageDto,
  CreateCompensationRevisionDto,
} from './dto/assign-salary-package.dto';
import {
  CompensationFormulaService,
  type FormulaComponentInput,
} from './compensation-formula.service';
import { CreateCompensationComponentDto } from './dto/create-compensation-component.dto';
import { CreateCompensationHistoryDto } from './dto/create-compensation-history.dto';
import { UpdateCompensationComponentDto } from './dto/update-compensation-component.dto';
import { UpdateCompensationHistoryDto } from './dto/update-compensation-history.dto';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';

const compensationInclude = {
  salaryPackageRule: true,
  approvedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  components: {
    include: { payComponent: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.EmployeeCompensationHistoryInclude;

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly compensationResolver: CompensationResolverService,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
    private readonly formulaService: CompensationFormulaService,
  ) {}

  async listHistory(currentUser: AuthenticatedUser, employeeId: string) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const items = await this.prisma.employeeCompensationHistory.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      include: compensationInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return items.map(mapHistory);
  }

  async getHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const history = await this.findHistoryOrThrow(
      currentUser.tenantId,
      employeeId,
      historyId,
    );

    return mapHistory(history);
  }

  async getActive(currentUser: AuthenticatedUser, employeeId: string) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const active = await this.compensationResolver.resolveActiveCompensation({
      tenantId: currentUser.tenantId,
      employeeId,
      effectiveDate: new Date(),
    });

    return active ? mapHistory(active) : null;
  }

  async createHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateCompensationHistoryDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertSingleActiveOpenEnded(
      currentUser.tenantId,
      employeeId,
      dto.status ?? 'DRAFT',
      effectiveTo,
    );
    await this.assertNoActiveOverlap(
      currentUser.tenantId,
      employeeId,
      dto.status ?? 'DRAFT',
      effectiveFrom,
      effectiveTo,
    );

    const created = await this.prisma.employeeCompensationHistory.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        effectiveFrom,
        effectiveTo,
        payFrequency: dto.payFrequency,
        currencyCode: normalizeCurrency(dto.currencyCode),
        baseAmount: new Prisma.Decimal(dto.baseAmount),
        ...emptyTotals(),
        status: dto.status ?? 'DRAFT',
        notes: normalizeOptionalText(dto.notes),
        createdBy: currentUser.userId,
      },
      include: compensationInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'COMPENSATION_HISTORY_CREATED',
      entityType: 'EmployeeCompensationHistory',
      entityId: created.id,
      afterSnapshot: created,
    });

    return mapHistory(created);
  }

  async updateHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    dto: UpdateCompensationHistoryDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const existing = await this.findHistoryOrThrow(
      currentUser.tenantId,
      employeeId,
      historyId,
    );
    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? parseDate(dto.effectiveFrom)
        : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    const status = dto.status ?? existing.status;

    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertSingleActiveOpenEnded(
      currentUser.tenantId,
      employeeId,
      status,
      effectiveTo,
      historyId,
    );
    await this.assertNoActiveOverlap(
      currentUser.tenantId,
      employeeId,
      status,
      effectiveFrom,
      effectiveTo,
      historyId,
    );

    const updated = await this.prisma.employeeCompensationHistory.update({
      where: { id: historyId },
      data: {
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        ...(dto.payFrequency !== undefined
          ? { payFrequency: dto.payFrequency }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
        ...(dto.baseAmount !== undefined
          ? { baseAmount: new Prisma.Decimal(dto.baseAmount) }
          : {}),
        ...(dto.status === 'ACTIVE'
          ? { approvedById: currentUser.userId }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined
          ? { notes: normalizeOptionalText(dto.notes) }
          : {}),
      },
      include: compensationInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action:
        updated.status === 'RETIRED'
          ? 'COMPENSATION_HISTORY_RETIRED'
          : 'COMPENSATION_HISTORY_UPDATED',
      entityType: 'EmployeeCompensationHistory',
      entityId: historyId,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return mapHistory(updated);
  }

  async assignSalaryPackage(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: AssignSalaryPackageDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const packageRule = await this.prisma.salaryPackageRule.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        id: dto.salaryPackageRuleId,
        isActive: true,
      },
      include: {
        components: {
          include: { payComponent: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!packageRule) {
      throw new BadRequestException(
        'Active salary package rule was not found.',
      );
    }
    if (packageRule.components.length === 0) {
      throw new BadRequestException(
        'Salary package rule must have at least one component before assignment.',
      );
    }

    const effectiveFrom = parseDate(dto.effectiveFrom);
    const status = dto.status ?? 'DRAFT';
    const replacementId =
      status === 'ACTIVE'
        ? await this.findReplaceableActiveCompensationId(
            currentUser.tenantId,
            employeeId,
            effectiveFrom,
          )
        : undefined;
    await this.assertNoActiveOverlap(
      currentUser.tenantId,
      employeeId,
      status,
      effectiveFrom,
      null,
      replacementId,
    );

    const payrollSettings =
      await this.tenantSettingsResolver.getPayrollSettings(
        currentUser.tenantId,
      );
    const currencyCode = await this.resolveCompensationCurrency(
      currentUser.tenantId,
      packageRule.currencyCode,
      payrollSettings.defaultPayrollRegionId,
      payrollSettings.defaultCurrency,
    );
    const baseAmount = new Prisma.Decimal(dto.baseAmount ?? '0');
    const preparedComponents = buildCopiedComponents(
      this.formulaService,
      packageRule.components,
      baseAmount,
    );
    const totals = summarizeComponents(preparedComponents);

    const created = await this.prisma.$transaction(async (tx) => {
      if (status === 'ACTIVE') {
        await retireOpenActiveCompensations(
          tx,
          currentUser.tenantId,
          employeeId,
          effectiveFrom,
        );
      }
      const created = await tx.employeeCompensationHistory.create({
        data: {
          tenantId: currentUser.tenantId,
          employeeId,
          salaryPackageRuleId: packageRule.id,
          effectiveFrom,
          effectiveTo: null,
          payFrequency: dto.payFrequency ?? 'MONTHLY',
          currencyCode,
          baseAmount,
          ...totals,
          changeReason: normalizeOptionalText(dto.changeReason),
          status,
          approvedById: status === 'ACTIVE' ? currentUser.userId : null,
          notes: normalizeOptionalText(dto.notes),
          createdBy: currentUser.userId,
        },
      });

      if (preparedComponents.length) {
        await tx.employeeCompensationComponent.createMany({
          data: preparedComponents.map((component) => ({
            tenantId: currentUser.tenantId,
            compensationHistoryId: created.id,
            payComponentId: component.payComponentId,
            amount: component.amount,
            percentage: component.percentage,
            calculatedAmount: component.calculatedAmount,
            formulaExpression: component.formulaExpression,
            calculationMethodSnapshot: component.calculationMethodSnapshot,
            isTaxable: component.isTaxable,
            isRecurring: component.isRecurring,
            isEmployeeEditable: component.isEmployeeEditable,
            displayOrder: component.displayOrder,
          })),
        });
      }

      return tx.employeeCompensationHistory.findFirstOrThrow({
        where: { tenantId: currentUser.tenantId, id: created.id },
        include: compensationInclude,
      });
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_SALARY_PACKAGE_ASSIGNED',
      entityType: 'EmployeeCompensationHistory',
      entityId: created.id,
      afterSnapshot: created,
    });

    return mapHistory(created);
  }

  async createRevision(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    dto: CreateCompensationRevisionDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const source = await this.findHistoryOrThrow(
      currentUser.tenantId,
      employeeId,
      historyId,
    );
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const status = dto.status ?? 'DRAFT';
    const replacementId =
      status === 'ACTIVE' &&
      source.status === 'ACTIVE' &&
      source.effectiveTo === null &&
      source.effectiveFrom < effectiveFrom
        ? source.id
        : undefined;
    await this.assertNoActiveOverlap(
      currentUser.tenantId,
      employeeId,
      status,
      effectiveFrom,
      null,
      replacementId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      if (status === 'ACTIVE') {
        await retireOpenActiveCompensations(
          tx,
          currentUser.tenantId,
          employeeId,
          effectiveFrom,
        );
      }
      const created = await tx.employeeCompensationHistory.create({
        data: {
          tenantId: currentUser.tenantId,
          employeeId,
          salaryPackageRuleId: source.salaryPackageRuleId,
          effectiveFrom,
          effectiveTo: null,
          payFrequency: source.payFrequency,
          currencyCode: source.currencyCode,
          baseAmount: source.baseAmount,
          grossEarnings: source.grossEarnings,
          totalDeductions: source.totalDeductions,
          employerContributions: source.employerContributions,
          estimatedNetPay: source.estimatedNetPay,
          changeReason: dto.changeReason.trim(),
          status,
          approvedById: status === 'ACTIVE' ? currentUser.userId : null,
          notes: source.notes,
          createdBy: currentUser.userId,
        },
      });

      if (source.components.length) {
        await tx.employeeCompensationComponent.createMany({
          data: source.components.map((component) => ({
            tenantId: currentUser.tenantId,
            compensationHistoryId: created.id,
            payComponentId: component.payComponentId,
            amount: component.amount,
            percentage: component.percentage,
            calculatedAmount: component.calculatedAmount,
            formulaExpression: component.formulaExpression,
            calculationMethodSnapshot: component.calculationMethodSnapshot,
            isTaxable: component.isTaxable,
            isRecurring: component.isRecurring,
            isEmployeeEditable: component.isEmployeeEditable,
            displayOrder: component.displayOrder,
          })),
        });
      }

      return tx.employeeCompensationHistory.findFirstOrThrow({
        where: { tenantId: currentUser.tenantId, id: created.id },
        include: compensationInclude,
      });
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_COMPENSATION_REVISION_CREATED',
      entityType: 'EmployeeCompensationHistory',
      entityId: created.id,
      beforeSnapshot: source,
      afterSnapshot: created,
    });

    return mapHistory(created);
  }

  async createComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    dto: CreateCompensationComponentDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const payComponent = await this.findActivePayComponent(
      currentUser.tenantId,
      dto.payComponentId,
    );
    validateComponentValue(
      payComponent.calculationMethod,
      dto.amount,
      dto.percentage,
    );

    try {
      const created = await this.prisma.employeeCompensationComponent.create({
        data: {
          tenantId: currentUser.tenantId,
          compensationHistoryId: historyId,
          payComponentId: payComponent.id,
          amount: dto.amount ? new Prisma.Decimal(dto.amount) : null,
          percentage: dto.percentage
            ? new Prisma.Decimal(dto.percentage)
            : null,
          calculationMethodSnapshot: payComponent.calculationMethod,
          isRecurring: dto.isRecurring ?? payComponent.isRecurring,
          displayOrder: dto.displayOrder ?? payComponent.displayOrder,
        },
        include: { payComponent: true },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'COMPENSATION_COMPONENT_CREATED',
        entityType: 'EmployeeCompensationComponent',
        entityId: created.id,
        afterSnapshot: created,
      });

      await this.recalculateHistoryTotals(currentUser.tenantId, historyId);
      const recalculated = await this.findComponentOrThrow(
        currentUser.tenantId,
        historyId,
        created.id,
      );
      return mapComponent(recalculated);
    } catch (error) {
      handleComponentWriteError(error);
    }
  }

  async updateComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    componentId: string,
    dto: UpdateCompensationComponentDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const existing = await this.findComponentOrThrow(
      currentUser.tenantId,
      historyId,
      componentId,
    );
    const payComponent = dto.payComponentId
      ? await this.findActivePayComponent(
          currentUser.tenantId,
          dto.payComponentId,
        )
      : existing.payComponent;
    const amount =
      dto.amount !== undefined ? dto.amount : existing.amount?.toString();
    const percentage =
      dto.percentage !== undefined
        ? dto.percentage
        : existing.percentage?.toString();

    validateComponentValue(payComponent.calculationMethod, amount, percentage);

    try {
      const updated = await this.prisma.employeeCompensationComponent.update({
        where: { id: componentId },
        data: {
          ...(dto.payComponentId !== undefined
            ? {
                payComponentId: payComponent.id,
                calculationMethodSnapshot: payComponent.calculationMethod,
              }
            : {}),
          ...(dto.amount !== undefined
            ? { amount: dto.amount ? new Prisma.Decimal(dto.amount) : null }
            : {}),
          ...(dto.percentage !== undefined
            ? {
                percentage: dto.percentage
                  ? new Prisma.Decimal(dto.percentage)
                  : null,
              }
            : {}),
          ...(dto.isRecurring !== undefined
            ? { isRecurring: dto.isRecurring }
            : {}),
          ...(dto.displayOrder !== undefined
            ? { displayOrder: dto.displayOrder }
            : {}),
        },
        include: { payComponent: true },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'COMPENSATION_COMPONENT_UPDATED',
        entityType: 'EmployeeCompensationComponent',
        entityId: componentId,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });

      await this.recalculateHistoryTotals(currentUser.tenantId, historyId);
      const recalculated = await this.findComponentOrThrow(
        currentUser.tenantId,
        historyId,
        componentId,
      );
      return mapComponent(recalculated);
    } catch (error) {
      handleComponentWriteError(error);
    }
  }

  async deleteComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    componentId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const existing = await this.findComponentOrThrow(
      currentUser.tenantId,
      historyId,
      componentId,
    );

    await this.prisma.employeeCompensationComponent.delete({
      where: { id: componentId },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'COMPENSATION_COMPONENT_DELETED',
      entityType: 'EmployeeCompensationComponent',
      entityId: componentId,
      beforeSnapshot: existing,
    });

    await this.recalculateHistoryTotals(currentUser.tenantId, historyId);

    return { deleted: true, id: componentId };
  }

  private async ensureEmployeeBelongsToTenant(
    tenantId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }
  }

  private async findHistoryOrThrow(
    tenantId: string,
    employeeId: string,
    historyId: string,
  ) {
    const history = await this.prisma.employeeCompensationHistory.findFirst({
      where: { tenantId, employeeId, id: historyId },
      include: compensationInclude,
    });

    if (!history) {
      throw new NotFoundException(
        'Compensation history was not found for this employee.',
      );
    }

    return history;
  }

  private async findComponentOrThrow(
    tenantId: string,
    historyId: string,
    componentId: string,
  ) {
    const component = await this.prisma.employeeCompensationComponent.findFirst(
      {
        where: { tenantId, compensationHistoryId: historyId, id: componentId },
        include: { payComponent: true },
      },
    );

    if (!component) {
      throw new NotFoundException(
        'Compensation component was not found for this history record.',
      );
    }

    return component;
  }

  private async findActivePayComponent(
    tenantId: string,
    payComponentId: string,
  ) {
    const payComponent = await this.prisma.payComponent.findFirst({
      where: { tenantId, id: payComponentId, isActive: true },
    });

    if (!payComponent) {
      throw new BadRequestException(
        'Component must reference an active pay component in the same tenant.',
      );
    }

    return payComponent;
  }

  private async assertSingleActiveOpenEnded(
    tenantId: string,
    employeeId: string,
    status: string,
    effectiveTo: Date | null,
    excludeId?: string,
  ) {
    if (status !== 'ACTIVE' || effectiveTo !== null) {
      return;
    }

    const existing = await this.prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        effectiveTo: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Only one ACTIVE open-ended compensation record is allowed per employee.',
      );
    }
  }

  private async assertNoActiveOverlap(
    tenantId: string,
    employeeId: string,
    status: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string,
  ) {
    if (status !== 'ACTIVE') return;
    const overlaps = await this.prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        ...(excludeId ? { id: { not: excludeId } } : {}),
        effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      select: { id: true },
    });
    if (overlaps) {
      throw new ConflictException(
        'Active compensation periods cannot overlap for the same employee.',
      );
    }
  }

  private async findReplaceableActiveCompensationId(
    tenantId: string,
    employeeId: string,
    effectiveFrom: Date,
  ) {
    const existing = await this.prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        effectiveTo: null,
        effectiveFrom: { lt: effectiveFrom },
      },
      select: { id: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    return existing?.id;
  }

  private async resolveCompensationCurrency(
    tenantId: string,
    packageCurrency: string,
    payrollRegionId?: string,
    tenantDefaultCurrency?: string,
  ) {
    const normalizedPackageCurrency = normalizeCurrency(packageCurrency);
    if (normalizedPackageCurrency) return normalizedPackageCurrency;
    if (payrollRegionId) {
      const region = await this.prisma.payrollRegion.findFirst({
        where: { tenantId, id: payrollRegionId, status: 'ACTIVE' },
        select: { currencyCode: true },
      });
      if (region?.currencyCode) return normalizeCurrency(region.currencyCode);
    }
    return normalizeCurrency(tenantDefaultCurrency || 'USD');
  }

  private async recalculateHistoryTotals(tenantId: string, historyId: string) {
    const history = await this.prisma.employeeCompensationHistory.findFirst({
      where: { tenantId, id: historyId },
      include: {
        components: {
          include: { payComponent: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!history) return;

    const resolved = this.formulaService.resolveComponents(
      history.components.map(
        (component): FormulaComponentInput => ({
          id: component.id,
          payComponentId: component.payComponentId,
          code: component.payComponent.code,
          name: component.payComponent.name,
          calculationMethod:
            component.calculationMethodSnapshot === 'MANUAL' ||
            component.calculationMethodSnapshot === 'SYSTEM_CALCULATED'
              ? 'FIXED'
              : component.calculationMethodSnapshot,
          fixedAmount: component.amount,
          percentage: component.percentage,
          percentageBaseComponentId:
            component.payComponent.percentageBaseComponentId,
          formulaExpression:
            component.formulaExpression ??
            component.payComponent.formulaExpression,
          minimumAmount: component.payComponent.minimumAmount,
          maximumAmount: component.payComponent.maximumAmount,
          roundingMethod: component.payComponent.roundingMethod,
        }),
      ),
      { basic: history.baseAmount, gross: history.baseAmount },
    );
    const amountByComponentId = new Map(
      resolved.map((component) => [component.id, component.calculatedAmount]),
    );
    const totals = summarizeEmployeeComponents(
      history.components.map((component) => ({
        calculatedAmount:
          amountByComponentId.get(component.id) ?? new Prisma.Decimal(0),
        componentType: component.payComponent.componentType,
        affectsGrossPay: component.payComponent.affectsGrossPay,
      })),
    );

    await this.prisma.$transaction([
      ...history.components.map((component) =>
        this.prisma.employeeCompensationComponent.update({
          where: { id: component.id },
          data: {
            calculatedAmount:
              amountByComponentId.get(component.id) ?? new Prisma.Decimal(0),
            formulaExpression:
              component.formulaExpression ??
              component.payComponent.formulaExpression,
          },
        }),
      ),
      this.prisma.employeeCompensationHistory.update({
        where: { id: historyId },
        data: totals,
      }),
    ]);
  }
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value: string | undefined) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return new Date(value);
}

function assertDateRange(effectiveFrom: Date, effectiveTo: Date | null) {
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new BadRequestException(
      'effectiveTo must be greater than or equal to effectiveFrom.',
    );
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateComponentValue(
  calculationMethod: PayComponentCalculationMethod,
  amount?: string | null,
  percentage?: string | null,
) {
  if (calculationMethod === 'FIXED' && !amount) {
    throw new BadRequestException('Fixed components require amount.');
  }

  if (calculationMethod === 'PERCENTAGE' && !percentage) {
    throw new BadRequestException('Percentage components require percentage.');
  }
}

function emptyTotals() {
  return {
    grossEarnings: new Prisma.Decimal(0),
    totalDeductions: new Prisma.Decimal(0),
    employerContributions: new Prisma.Decimal(0),
    estimatedNetPay: new Prisma.Decimal(0),
  };
}

function buildCopiedComponents(
  formulaService: CompensationFormulaService,
  components: Prisma.SalaryPackageRuleComponentGetPayload<{
    include: { payComponent: true };
  }>[],
  baseAmount: Prisma.Decimal,
) {
  const resolved = formulaService.resolveComponents(
    components.map(
      (component): FormulaComponentInput => ({
        id: component.id,
        payComponentId: component.payComponentId,
        code: component.payComponent.code,
        name: component.payComponent.name,
        calculationMethod: component.calculationMethod,
        fixedAmount: component.fixedAmount,
        percentage: component.percentage,
        percentageBaseComponentId:
          component.percentageBaseComponentId ??
          component.payComponent.percentageBaseComponentId,
        formulaExpression: component.formulaExpression,
        minimumAmount:
          component.minimumAmount ?? component.payComponent.minimumAmount,
        maximumAmount:
          component.maximumAmount ?? component.payComponent.maximumAmount,
        roundingMethod: component.payComponent.roundingMethod,
      }),
    ),
    { basic: baseAmount, gross: baseAmount },
  );
  const amountById = new Map(
    resolved.map((component) => [component.id, component.calculatedAmount]),
  );
  return components.map((component) =>
    buildCopiedComponent(
      component,
      amountById.get(component.id) ?? new Prisma.Decimal(0),
    ),
  );
}

function buildCopiedComponent(
  component: Prisma.SalaryPackageRuleComponentGetPayload<{
    include: { payComponent: true };
  }>,
  calculatedAmount: Prisma.Decimal,
) {
  return {
    payComponentId: component.payComponentId,
    amount: component.fixedAmount,
    percentage: component.percentage,
    calculatedAmount,
    formulaExpression: component.formulaExpression,
    calculationMethodSnapshot: component.calculationMethod,
    componentType: component.payComponent.componentType,
    affectsGrossPay: component.payComponent.affectsGrossPay,
    affectsNetPay: component.payComponent.affectsNetPay,
    isTaxable: component.payComponent.isTaxable,
    isRecurring: component.payComponent.isRecurring,
    isEmployeeEditable: component.isEmployeeEditable,
    displayOrder: component.displayOrder,
  };
}

function summarizeComponents(
  components: ReturnType<typeof buildCopiedComponents>,
) {
  const totals = emptyTotals();
  for (const component of components) {
    if (
      component.affectsGrossPay &&
      ['EARNING', 'ALLOWANCE', 'REIMBURSEMENT'].includes(
        component.componentType,
      )
    ) {
      totals.grossEarnings = totals.grossEarnings.plus(
        component.calculatedAmount,
      );
    }
    if (['DEDUCTION', 'TAX'].includes(component.componentType)) {
      totals.totalDeductions = totals.totalDeductions.plus(
        component.calculatedAmount,
      );
    }
    if (component.componentType === 'EMPLOYER_CONTRIBUTION') {
      totals.employerContributions = totals.employerContributions.plus(
        component.calculatedAmount,
      );
    }
  }
  totals.estimatedNetPay = totals.grossEarnings.minus(totals.totalDeductions);
  return totals;
}

function summarizeEmployeeComponents(
  components: readonly {
    calculatedAmount: Prisma.Decimal;
    componentType: string;
    affectsGrossPay: boolean;
  }[],
) {
  const totals = emptyTotals();
  for (const component of components) {
    if (
      component.affectsGrossPay &&
      ['EARNING', 'ALLOWANCE', 'REIMBURSEMENT'].includes(
        component.componentType,
      )
    ) {
      totals.grossEarnings = totals.grossEarnings.plus(
        component.calculatedAmount,
      );
    }
    if (['DEDUCTION', 'TAX'].includes(component.componentType)) {
      totals.totalDeductions = totals.totalDeductions.plus(
        component.calculatedAmount,
      );
    }
    if (component.componentType === 'EMPLOYER_CONTRIBUTION') {
      totals.employerContributions = totals.employerContributions.plus(
        component.calculatedAmount,
      );
    }
  }
  totals.estimatedNetPay = totals.grossEarnings.minus(totals.totalDeductions);
  return totals;
}

export async function retireOpenActiveCompensations(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  nextEffectiveFrom: Date,
  excludeId?: string,
) {
  const previousEnd = new Date(nextEffectiveFrom);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  await tx.employeeCompensationHistory.updateMany({
    where: {
      tenantId,
      employeeId,
      status: 'ACTIVE',
      effectiveTo: null,
      effectiveFrom: { lt: nextEffectiveFrom },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    data: { status: 'RETIRED', effectiveTo: previousEnd },
  });
}

function handleComponentWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'This pay component is already assigned to the compensation history record.',
    );
  }

  throw error;
}

function mapHistory(
  history: Prisma.EmployeeCompensationHistoryGetPayload<{
    include: typeof compensationInclude;
  }>,
) {
  return {
    ...history,
    baseAmount: history.baseAmount.toString(),
    grossEarnings: history.grossEarnings.toString(),
    totalDeductions: history.totalDeductions.toString(),
    employerContributions: history.employerContributions.toString(),
    estimatedNetPay: history.estimatedNetPay.toString(),
    components: history.components.map(mapComponent),
  };
}

function mapComponent(
  component: Prisma.EmployeeCompensationComponentGetPayload<{
    include: { payComponent: true };
  }>,
) {
  return {
    ...component,
    amount: component.amount?.toString() ?? null,
    percentage: component.percentage?.toString() ?? null,
    calculatedAmount: component.calculatedAmount.toString(),
  };
}
