import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfigurationStatus,
  PayComponentCalculationMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import {
  CreatePayComponentDto,
  PayComponentEligibilityRuleInputDto,
} from './dto/create-pay-component.dto';
import { ListPayComponentsDto } from './dto/list-pay-components.dto';
import { UpdatePayComponentDto } from './dto/update-pay-component.dto';
import { CompensationFormulaService } from '../compensation/compensation-formula.service';

type PayComponentValidationPayload = {
  code?: string | null;
  name?: string | null;
  calculationMethod?: PayComponentCalculationMethod;
  fixedAmount?: number | Prisma.Decimal | null;
  percentage?: number | Prisma.Decimal | null;
  percentageBaseComponentId?: string | null;
  formulaExpression?: string | null;
  eligibilityRules?: readonly PayComponentEligibilityRuleValidationPayload[];
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  minimumAmount?: number | Prisma.Decimal | null;
  maximumAmount?: number | Prisma.Decimal | null;
  roundingMethod?: string | null;
  organizationId?: string | null;
  legalEntityId?: string | null;
  ownerUserId?: string | null;
  isDefault?: boolean;
  defaultDebitAccountId?: string | null;
  defaultCreditAccountId?: string | null;
};

type PayComponentEligibilityRuleValidationPayload = {
  name?: string | null;
  matchType?: string | null;
  conditions?: unknown;
  priority?: number | null;
  calculationMethodOverride?: PayComponentCalculationMethod | null;
  fixedAmount?: number | Prisma.Decimal | null;
  percentage?: number | Prisma.Decimal | null;
  percentageBaseComponentId?: string | null;
  formulaExpression?: string | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
};

@Injectable()
export class PayComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly formulaService: CompensationFormulaService,
  ) {}

  findAll(tenantId: string, query: ListPayComponentsDto) {
    return this.prisma.payComponent.findMany({
      where: {
        tenantId,
        ...(query.componentType ? { componentType: query.componentType } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                {
                  code: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  name: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  description: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { isActive: 'desc' },
        { displayOrder: 'asc' },
        { componentType: 'asc' },
        { code: 'asc' },
      ],
      include: { eligibilityRules: { orderBy: [{ priority: 'asc' }] } },
    });
  }

  async findOne(tenantId: string, id: string) {
    const component = await this.prisma.payComponent.findFirst({
      where: { tenantId, id },
      include: { eligibilityRules: { orderBy: [{ priority: 'asc' }] } },
    });

    if (!component) {
      throw new NotFoundException(
        'Pay component was not found for this tenant.',
      );
    }

    return component;
  }

  async create(currentUser: AuthenticatedUser, dto: CreatePayComponentDto) {
    await this.validatePayComponentPayload(currentUser.tenantId, {
      ...dto,
      ownerUserId: dto.ownerUserId ?? currentUser.userId,
    });
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const component = await tx.payComponent.create({
          data: {
            tenantId: currentUser.tenantId,
            ...payComponentCreateData(dto, currentUser.userId),
          },
        });
        await replaceEligibilityRules(
          tx,
          currentUser.tenantId,
          currentUser.userId,
          component.id,
          dto.eligibilityRules,
        );
        return tx.payComponent.findFirstOrThrow({
          where: { tenantId: currentUser.tenantId, id: component.id },
          include: { eligibilityRules: { orderBy: [{ priority: 'asc' }] } },
        });
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'PAY_COMPONENT_CREATED',
        entityType: 'PayComponent',
        entityId: created.id,
        afterSnapshot: created,
      });

      return created;
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdatePayComponentDto,
  ) {
    const existing = await this.findOne(currentUser.tenantId, id);
    await this.validatePayComponentPayload(
      currentUser.tenantId,
      {
        ...existing,
        ...dto,
      },
      id,
    );

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.payComponent.update({
          where: { id },
          data: payComponentUpdateData(dto, currentUser.userId),
        });
        if (dto.eligibilityRules !== undefined) {
          await replaceEligibilityRules(
            tx,
            currentUser.tenantId,
            currentUser.userId,
            id,
            dto.eligibilityRules,
          );
        }
        return tx.payComponent.findFirstOrThrow({
          where: { tenantId: currentUser.tenantId, id },
          include: { eligibilityRules: { orderBy: [{ priority: 'asc' }] } },
        });
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'PAY_COMPONENT_UPDATED',
        entityType: 'PayComponent',
        entityId: id,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });

      return updated;
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async deactivate(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.findOne(currentUser.tenantId, id);
    const updated = await this.prisma.payComponent.update({
      where: { id },
      data: {
        isActive: false,
        status: ConfigurationStatus.INACTIVE,
        updatedById: currentUser.userId,
        version: { increment: 1 },
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PAY_COMPONENT_DEACTIVATED',
      entityType: 'PayComponent',
      entityId: id,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return updated;
  }

  private handleUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Pay component code is already in use for this tenant.',
      );
    }

    throw error;
  }

  private async validatePayComponentPayload(
    tenantId: string,
    dto: PayComponentValidationPayload,
    payComponentId?: string,
  ) {
    validateDateRange(dto.effectiveFrom, dto.effectiveTo);
    validateAmountBounds(dto.minimumAmount, dto.maximumAmount);
    validateCalculationConfiguration(dto);
    validateRules(dto.eligibilityRules);
    await this.assertConfigurationReferences(tenantId, dto);
    await this.assertSingleDefault(tenantId, dto, payComponentId);

    const referenceIds = [
      dto.percentageBaseComponentId,
      ...(dto.eligibilityRules ?? []).flatMap((rule) => [
        rule.percentageBaseComponentId,
      ]),
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (
      dto.percentageBaseComponentId &&
      dto.percentageBaseComponentId === payComponentId
    ) {
      throw new BadRequestException(
        'Percentage Base Component cannot reference the same Pay Component.',
      );
    }

    if (referenceIds.length) {
      await this.assertReferencesBelongToTenant(tenantId, referenceIds);
    }

    await this.validateFormulaDependencies(tenantId, dto, payComponentId);
  }

  private async assertConfigurationReferences(
    tenantId: string,
    dto: PayComponentValidationPayload,
  ) {
    const scopedOrganizationIds = [
      dto.organizationId,
      dto.legalEntityId,
    ].filter((value): value is string => Boolean(value));
    if (scopedOrganizationIds.length) {
      const count = await this.prisma.organization.count({
        where: {
          tenantId,
          id: { in: [...new Set(scopedOrganizationIds)] },
          isActive: true,
        },
      });
      if (count !== new Set(scopedOrganizationIds).size) {
        throw new BadRequestException(
          'Selected organization or legal entity does not belong to this tenant or is inactive.',
        );
      }
    }

    if (dto.ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, id: dto.ownerUserId },
        select: { id: true },
      });
      if (!owner) {
        throw new BadRequestException(
          'Selected owner does not belong to this tenant.',
        );
      }
    }

    const accountIds = [
      dto.defaultDebitAccountId,
      dto.defaultCreditAccountId,
    ].filter((value): value is string => Boolean(value));
    if (accountIds.length) {
      const count = await this.prisma.payrollGlAccount.count({
        where: {
          tenantId,
          id: { in: [...new Set(accountIds)] },
          status: ConfigurationStatus.ACTIVE,
        },
      });
      if (count !== new Set(accountIds).size) {
        throw new BadRequestException(
          'Selected debit or credit account does not belong to this tenant or is inactive.',
        );
      }
    }
  }

  private async assertSingleDefault(
    tenantId: string,
    dto: PayComponentValidationPayload,
    payComponentId?: string,
  ) {
    if (!dto.isDefault) return;
    const duplicate = await this.prisma.payComponent.findFirst({
      where: {
        tenantId,
        isDefault: true,
        organizationId: dto.organizationId ?? null,
        legalEntityId: dto.legalEntityId ?? null,
        ...(payComponentId ? { id: { not: payComponentId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Default pay component already exists for this scope: ${duplicate.name}.`,
      );
    }
  }

  private async assertReferencesBelongToTenant(
    tenantId: string,
    referenceIds: readonly string[],
  ) {
    const payComponentIds = referenceIds.filter(isUuid);
    if (!payComponentIds.length) return;
    const count = await this.prisma.payComponent.count({
      where: { tenantId, id: { in: [...new Set(payComponentIds)] } },
    });
    if (count < new Set(payComponentIds).size) {
      throw new BadRequestException(
        'One or more referenced Pay Components do not belong to this tenant.',
      );
    }
  }

  private async validateFormulaDependencies(
    tenantId: string,
    dto: PayComponentValidationPayload,
    payComponentId?: string,
  ) {
    const activeComponents = await this.prisma.payComponent.findMany({
      where: { tenantId, isActive: true },
    });
    const candidateCode = normalizeCode(
      dto.code ?? undefined,
      dto.name ?? 'PAY',
    );
    const candidate = {
      id: payComponentId ?? 'candidate',
      payComponentId: payComponentId ?? 'candidate',
      code: candidateCode,
      name: dto.name ?? candidateCode,
      calculationMethod: resolveEffectiveCalculationMethod(
        dto.calculationMethod ?? PayComponentCalculationMethod.FIXED,
        dto.formulaExpression,
      ),
      fixedAmount: nullableDecimal(dto.fixedAmount) ?? new Prisma.Decimal(1),
      percentage: nullableDecimal(dto.percentage) ?? new Prisma.Decimal(1),
      percentageBaseComponentId: dto.percentageBaseComponentId ?? null,
      formulaExpression: normalizeNullableText(dto.formulaExpression),
      minimumAmount: nullableDecimal(dto.minimumAmount),
      maximumAmount: nullableDecimal(dto.maximumAmount),
      roundingMethod: normalizeChoice(dto.roundingMethod ?? undefined, 'NONE'),
    };
    const inputs = [
      ...activeComponents
        .filter((component) => component.id !== payComponentId)
        .map((component) => ({
          id: component.id,
          payComponentId: component.id,
          code: component.code,
          name: component.name,
          calculationMethod: resolveEffectiveCalculationMethod(
            component.calculationMethod,
            component.formulaExpression,
          ),
          fixedAmount: component.fixedAmount ?? new Prisma.Decimal(1),
          percentage: component.percentage ?? new Prisma.Decimal(1),
          percentageBaseComponentId: component.percentageBaseComponentId,
          formulaExpression: component.formulaExpression,
          minimumAmount: component.minimumAmount,
          maximumAmount: component.maximumAmount,
          roundingMethod: component.roundingMethod,
        })),
      candidate,
    ];
    this.formulaService.resolveComponents(inputs, { basic: 1, gross: 1 });
  }
}

function normalizeCode(value: string | undefined, fallbackName?: string) {
  const source = value?.trim() || `${fallbackName || 'PAY'}_${shortSuffix()}`;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function payComponentCreateData(dto: CreatePayComponentDto, userId: string) {
  const status =
    dto.status ??
    (dto.isActive === false
      ? ConfigurationStatus.INACTIVE
      : ConfigurationStatus.ACTIVE);
  return {
    code: normalizeCode(dto.code, dto.name),
    name: dto.name.trim(),
    description: normalizeOptionalText(dto.description),
    organizationId: dto.organizationId ?? null,
    legalEntityId: dto.legalEntityId ?? null,
    ownerUserId: dto.ownerUserId ?? userId,
    status,
    isDefault: dto.isDefault ?? false,
    componentCategory: normalizeChoice(dto.componentCategory, 'BASIC'),
    componentType: dto.componentType,
    calculationMethod: dto.calculationMethod,
    fixedAmount: nullableDecimal(dto.fixedAmount),
    percentage: nullableDecimal(dto.percentage),
    percentageBaseComponentId: dto.percentageBaseComponentId ?? null,
    formulaExpression: normalizeNullableText(dto.formulaExpression),
    eligibilityAppliesTo: normalizeEligibilityAppliesTo(
      dto.eligibilityAppliesTo,
    ),
    effectiveFrom: nullableDate(dto.effectiveFrom),
    effectiveTo: nullableDate(dto.effectiveTo),
    prorationBasis: normalizeChoice(dto.prorationBasis, 'NONE'),
    minimumAmount: nullableDecimal(dto.minimumAmount),
    maximumAmount: nullableDecimal(dto.maximumAmount),
    roundingMethod: normalizeChoice(dto.roundingMethod, 'NONE'),
    defaultDebitAccountId: dto.defaultDebitAccountId ?? null,
    defaultCreditAccountId: dto.defaultCreditAccountId ?? null,
    isTaxable: dto.isTaxable ?? false,
    affectsGrossPay: dto.affectsGrossPay ?? true,
    affectsNetPay: dto.affectsNetPay ?? true,
    isRecurring: dto.isRecurring ?? false,
    requiresApproval: dto.requiresApproval ?? false,
    displayOnPayslip: dto.displayOnPayslip ?? true,
    employeeVisible: dto.employeeVisible ?? true,
    displayOrder: dto.displayOrder ?? 0,
    isActive: dto.isActive ?? status === ConfigurationStatus.ACTIVE,
    createdById: userId,
    updatedById: userId,
  };
}

function payComponentUpdateData(dto: UpdatePayComponentDto, userId: string) {
  return {
    ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.description !== undefined
      ? { description: normalizeOptionalText(dto.description) }
      : {}),
    ...(dto.organizationId !== undefined
      ? { organizationId: dto.organizationId }
      : {}),
    ...(dto.legalEntityId !== undefined
      ? { legalEntityId: dto.legalEntityId }
      : {}),
    ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
    ...(dto.status !== undefined
      ? {
          status: dto.status,
          ...(dto.isActive === undefined
            ? { isActive: dto.status === ConfigurationStatus.ACTIVE }
            : {}),
        }
      : {}),
    ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
    ...(dto.componentType !== undefined
      ? { componentType: dto.componentType }
      : {}),
    ...(dto.calculationMethod !== undefined
      ? { calculationMethod: dto.calculationMethod }
      : {}),
    ...(dto.fixedAmount !== undefined
      ? { fixedAmount: nullableDecimal(dto.fixedAmount) }
      : {}),
    ...(dto.percentage !== undefined
      ? { percentage: nullableDecimal(dto.percentage) }
      : {}),
    ...(dto.componentCategory !== undefined
      ? { componentCategory: normalizeChoice(dto.componentCategory, 'BASIC') }
      : {}),
    ...(dto.percentageBaseComponentId !== undefined
      ? { percentageBaseComponentId: dto.percentageBaseComponentId }
      : {}),
    ...(dto.formulaExpression !== undefined
      ? { formulaExpression: normalizeNullableText(dto.formulaExpression) }
      : {}),
    ...(dto.eligibilityAppliesTo !== undefined
      ? {
          eligibilityAppliesTo: normalizeEligibilityAppliesTo(
            dto.eligibilityAppliesTo,
          ),
        }
      : {}),
    ...(dto.effectiveFrom !== undefined
      ? { effectiveFrom: nullableDate(dto.effectiveFrom) }
      : {}),
    ...(dto.effectiveTo !== undefined
      ? { effectiveTo: nullableDate(dto.effectiveTo) }
      : {}),
    ...(dto.prorationBasis !== undefined
      ? { prorationBasis: normalizeChoice(dto.prorationBasis, 'NONE') }
      : {}),
    ...(dto.minimumAmount !== undefined
      ? { minimumAmount: nullableDecimal(dto.minimumAmount) }
      : {}),
    ...(dto.maximumAmount !== undefined
      ? { maximumAmount: nullableDecimal(dto.maximumAmount) }
      : {}),
    ...(dto.roundingMethod !== undefined
      ? { roundingMethod: normalizeChoice(dto.roundingMethod, 'NONE') }
      : {}),
    ...(dto.defaultDebitAccountId !== undefined
      ? { defaultDebitAccountId: dto.defaultDebitAccountId }
      : {}),
    ...(dto.defaultCreditAccountId !== undefined
      ? { defaultCreditAccountId: dto.defaultCreditAccountId }
      : {}),
    ...(dto.isTaxable !== undefined ? { isTaxable: dto.isTaxable } : {}),
    ...(dto.affectsGrossPay !== undefined
      ? { affectsGrossPay: dto.affectsGrossPay }
      : {}),
    ...(dto.affectsNetPay !== undefined
      ? { affectsNetPay: dto.affectsNetPay }
      : {}),
    ...(dto.isRecurring !== undefined ? { isRecurring: dto.isRecurring } : {}),
    ...(dto.requiresApproval !== undefined
      ? { requiresApproval: dto.requiresApproval }
      : {}),
    ...(dto.displayOnPayslip !== undefined
      ? { displayOnPayslip: dto.displayOnPayslip }
      : {}),
    ...(dto.employeeVisible !== undefined
      ? { employeeVisible: dto.employeeVisible }
      : {}),
    ...(dto.displayOrder !== undefined
      ? { displayOrder: dto.displayOrder }
      : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    updatedById: userId,
    version: { increment: 1 },
  };
}

async function replaceEligibilityRules(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  payComponentId: string,
  rules: readonly PayComponentEligibilityRuleInputDto[] | undefined,
) {
  if (rules === undefined) return;
  await tx.payComponentEligibilityRule.deleteMany({
    where: { tenantId, payComponentId },
  });
  if (!rules.length) return;
  await tx.payComponentEligibilityRule.createMany({
    data: rules.map((rule) => ({
      tenantId,
      payComponentId,
      name: normalizeNullableText(rule.name),
      matchType: normalizeRuleMatchType(rule.matchType),
      conditions: normalizeConditions(rule.conditions),
      priority: rule.priority ?? 10,
      calculationMethodOverride: rule.calculationMethodOverride ?? null,
      fixedAmount: nullableDecimal(rule.fixedAmount),
      percentage: nullableDecimal(rule.percentage),
      percentageBaseComponentId: rule.percentageBaseComponentId ?? null,
      formulaExpression: normalizeNullableText(rule.formulaExpression),
      effectiveFrom: nullableDate(rule.effectiveFrom),
      effectiveTo: nullableDate(rule.effectiveTo),
      isActive: rule.isActive ?? true,
      createdById: userId,
      updatedById: userId,
    })),
  });
}

function validateCalculationConfiguration(dto: PayComponentValidationPayload) {
  if (dto.calculationMethod === PayComponentCalculationMethod.FIXED) {
    if (dto.fixedAmount === null || dto.fixedAmount === undefined) {
      throw payComponentFieldValidationError(
        'Fixed calculation requires Fixed Amount.',
        'fixedAmount',
      );
    }
  }
  if (dto.calculationMethod === PayComponentCalculationMethod.PERCENTAGE) {
    if (!dto.formulaExpression?.trim()) {
      if (dto.percentage === null || dto.percentage === undefined) {
        throw payComponentFieldValidationError(
          'Percentage calculation requires Percentage Value.',
          'percentage',
        );
      }
      if (!dto.percentageBaseComponentId) {
        throw payComponentFieldValidationError(
          'Percentage calculation requires Percentage Base Component.',
          'percentageBaseComponentId',
        );
      }
    }
  }
  if (dto.calculationMethod === PayComponentCalculationMethod.FORMULA) {
    if (!dto.formulaExpression?.trim()) {
      throw payComponentFieldValidationError(
        'Formula calculation requires Formula Expression.',
        'formulaExpression',
      );
    }
  }
}

function payComponentFieldValidationError(message: string, field: string) {
  return new AppError('VALIDATION_FAILED', {
    message,
    details: {
      fieldErrors: [{ field, message }],
    },
  });
}

function validateRules(
  rules: readonly PayComponentEligibilityRuleValidationPayload[] | undefined,
) {
  for (const rule of rules ?? []) {
    validateDateRange(rule.effectiveFrom, rule.effectiveTo);
    if (!hasConditions(rule.conditions)) {
      throw new BadRequestException(
        'Matching employee eligibility rules require at least one condition.',
      );
    }
    if (rule.calculationMethodOverride) {
      validateCalculationConfiguration({
        name: rule.name ?? 'Eligibility Rule',
        calculationMethod: rule.calculationMethodOverride,
        fixedAmount: rule.fixedAmount,
        percentage: rule.percentage,
        percentageBaseComponentId: rule.percentageBaseComponentId,
        formulaExpression: rule.formulaExpression,
      });
    }
  }
}

function validateDateRange(
  effectiveFrom?: string | Date | null,
  effectiveTo?: string | Date | null,
) {
  const from = nullableDate(effectiveFrom);
  const to = nullableDate(effectiveTo);
  if (from && to && to < from) {
    throw new BadRequestException(
      'Effective To cannot be before Effective From.',
    );
  }
}

function validateAmountBounds(
  minimumAmount?: number | Prisma.Decimal | null,
  maximumAmount?: number | Prisma.Decimal | null,
) {
  const minimum = nullableDecimal(minimumAmount);
  const maximum = nullableDecimal(maximumAmount);
  if (minimum && maximum && minimum.gt(maximum)) {
    throw new BadRequestException(
      'Minimum Amount cannot be greater than Maximum Amount.',
    );
  }
}

function normalizeEligibilityAppliesTo(value?: string | null) {
  const normalized = normalizeChoice(value ?? undefined, 'ALL_EMPLOYEES');
  return normalized === 'MATCHING_EMPLOYEES' ? normalized : 'ALL_EMPLOYEES';
}

function normalizeRuleMatchType(value?: string | null) {
  const normalized = normalizeChoice(value ?? undefined, 'ALL');
  return normalized === 'ANY' ? normalized : 'ALL';
}

function normalizeConditions(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Prisma.InputJsonValue)
    : {};
}

function hasConditions(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.conditions)) return record.conditions.length > 0;
  return Object.keys(record).length > 0;
}

function nullableDate(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function resolveEffectiveCalculationMethod(
  method: PayComponentCalculationMethod,
  formulaExpression?: string | null,
) {
  if (
    formulaExpression?.trim() &&
    method !== PayComponentCalculationMethod.FIXED
  ) {
    return PayComponentCalculationMethod.FORMULA;
  }
  return method;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableText(value: string | null | undefined) {
  if (value === null) return null;
  return normalizeOptionalText(value);
}

function normalizeChoice(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).toUpperCase();
}

function nullableDecimal(value: number | Prisma.Decimal | null | undefined) {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value);
}

function shortSuffix() {
  return Date.now().toString(36).toUpperCase().slice(-6);
}
