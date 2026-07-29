import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CURRENCY_OPTIONS } from '../lookups/lookups.catalog';
import {
  AddTaxRulePayComponentDto,
  CreateTaxRuleBracketDto,
  CreateTaxRuleDto,
  PreviewTaxRuleDto,
  ReorderTaxRuleBracketsDto,
  UpdateTaxRuleBracketDto,
  UpdateTaxRuleDto,
} from './dto/tax-rule.dto';
import {
  calculateRuleAmounts,
  validateRuleBrackets,
} from './tax-calculation.service';
import { taxRuleInclude } from './tax-rule-resolver.service';

@Injectable()
export class TaxRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.taxRule
      .findMany({
        where: { tenantId: user.tenantId },
        include: taxRuleInclude,
        orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      })
      .then((rules) => rules.map(mapTaxRule));
  }

  async get(user: AuthenticatedUser, id: string) {
    return mapTaxRule(await this.findRule(user.tenantId, id));
  }

  async listBrackets(user: AuthenticatedUser, taxRuleId: string) {
    const rule = await this.findRule(user.tenantId, taxRuleId);
    return {
      items: rule.brackets.map(mapTaxBracket),
      warnings: taxBracketWarnings(rule.brackets),
    };
  }

  async preview(
    user: AuthenticatedUser,
    taxRuleId: string,
    dto: PreviewTaxRuleDto,
  ) {
    const rule = await this.findRule(user.tenantId, taxRuleId);
    const validationError = validateRuleBrackets(rule);
    if (validationError) throw new BadRequestException(validationError);
    const taxableIncome = new Prisma.Decimal(dto.taxableIncome);
    const calculated = calculateRuleAmounts(rule, taxableIncome);
    if (calculated.error) throw new BadRequestException(calculated.error);
    return {
      taxRuleId,
      taxableIncome: taxableIncome.toString(),
      employeeTax: calculated.employeeAmount.toDecimalPlaces(2).toString(),
      employerTax: calculated.employerAmount.toDecimalPlaces(2).toString(),
      baseTax: calculated.employeeBaseAmount.toDecimalPlaces(2).toString(),
      marginalTax: calculated.employeeMarginalAmount
        .toDecimalPlaces(2)
        .toString(),
      appliedBracket: calculated.appliedBracket
        ? mapTaxBracket(calculated.appliedBracket)
        : null,
      warnings: taxBracketWarnings(rule.brackets),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateTaxRuleDto) {
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    await this.assertExtendedReferences(user.tenantId, dto);
    await this.assertDefaultScope(user.tenantId, dto, undefined);
    await this.assertReferenceData(
      dto.countryCode,
      dto.regionCode,
      dto.currencyCode,
    );
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const created = await this.prisma.taxRule.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code, dto.name),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          organizationId: dto.organizationId ?? null,
          legalEntityId: dto.legalEntityId ?? null,
          payrollRegionId: dto.payrollRegionId ?? null,
          taxAuthority: emptyToNull(dto.taxAuthority),
          calculationStrategy: normalizeChoice(
            dto.calculationStrategy,
            'PERIODIC',
          ),
          taxYearStart: parseOptionalDate(dto.taxYearStart),
          taxYearEnd: parseOptionalDate(dto.taxYearEnd),
          status: dto.status ?? 'ACTIVE',
          ownerUserId: dto.ownerUserId ?? user.userId,
          isDefault: dto.isDefault ?? false,
          priority: dto.priority ?? 100,
          countryCode: normalizeOptional(dto.countryCode),
          regionCode: normalizeOptional(dto.regionCode),
          employeeLevelId: dto.employeeLevelId ?? null,
          businessUnitId: dto.businessUnitId ?? null,
          departmentId: dto.departmentId ?? null,
          employmentTypeId: dto.employmentTypeId ?? null,
          calculationMethod: dto.calculationMethod,
          taxType: dto.taxType,
          employeeRate: nullableDecimal(dto.employeeRate),
          employerRate: nullableDecimal(dto.employerRate),
          fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
          fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
          currencyCode: normalizeOptional(dto.currencyCode),
          formulaExpression: emptyToNull(dto.formulaExpression),
          employeeTaxComponentId: dto.employeeTaxComponentId ?? null,
          employerTaxComponentId: dto.employerTaxComponentId ?? null,
          postingCategory: emptyToNull(dto.postingCategory),
          taxStatementTemplateId: dto.taxStatementTemplateId ?? null,
          applicabilityRules: jsonOrNull(dto.applicabilityRules),
          configuration: jsonOrNull(dto.configuration),
          isActive:
            dto.isActive ??
            (dto.status === undefined || dto.status === 'ACTIVE'),
          effectiveFrom,
          effectiveTo,
          createdById: user.userId,
          updatedById: user.userId,
        },
        include: taxRuleInclude,
      });
      await this.audit(
        user,
        'TAX_RULE_CREATED',
        'TaxRule',
        created.id,
        null,
        created,
      );
      return mapTaxRule(created);
    } catch (error) {
      handleUnique(error, 'Tax rule code already exists.');
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaxRuleDto) {
    const existing = await this.findRule(user.tenantId, id);
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    await this.assertExtendedReferences(user.tenantId, dto);
    await this.assertDefaultScope(user.tenantId, dto, id);
    await this.assertReferenceData(
      dto.countryCode !== undefined ? dto.countryCode : existing.countryCode,
      dto.regionCode !== undefined ? dto.regionCode : existing.regionCode,
      dto.currencyCode !== undefined ? dto.currencyCode : existing.currencyCode,
    );
    const effectiveFrom = dto.effectiveFrom
      ? parseDate(dto.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const updated = await this.prisma.taxRule.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: emptyToNull(dto.description) }
            : {}),
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId }
            : {}),
          ...(dto.legalEntityId !== undefined
            ? { legalEntityId: dto.legalEntityId }
            : {}),
          ...(dto.payrollRegionId !== undefined
            ? { payrollRegionId: dto.payrollRegionId }
            : {}),
          ...(dto.taxAuthority !== undefined
            ? { taxAuthority: emptyToNull(dto.taxAuthority) }
            : {}),
          ...(dto.calculationStrategy !== undefined
            ? { calculationStrategy: normalizeChoice(dto.calculationStrategy) }
            : {}),
          ...(dto.taxYearStart !== undefined
            ? { taxYearStart: parseOptionalDate(dto.taxYearStart) }
            : {}),
          ...(dto.taxYearEnd !== undefined
            ? { taxYearEnd: parseOptionalDate(dto.taxYearEnd) }
            : {}),
          ...(dto.status !== undefined
            ? { status: dto.status, isActive: dto.status === 'ACTIVE' }
            : {}),
          ...(dto.ownerUserId !== undefined
            ? { ownerUserId: dto.ownerUserId }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.countryCode !== undefined
            ? { countryCode: normalizeOptional(dto.countryCode) }
            : {}),
          ...(dto.regionCode !== undefined
            ? { regionCode: normalizeOptional(dto.regionCode) }
            : {}),
          ...(dto.employeeLevelId !== undefined
            ? { employeeLevelId: dto.employeeLevelId }
            : {}),
          ...(dto.businessUnitId !== undefined
            ? { businessUnitId: dto.businessUnitId }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
          ...(dto.employmentTypeId !== undefined
            ? { employmentTypeId: dto.employmentTypeId }
            : {}),
          ...(dto.calculationMethod !== undefined
            ? { calculationMethod: dto.calculationMethod }
            : {}),
          ...(dto.taxType !== undefined ? { taxType: dto.taxType } : {}),
          ...(dto.employeeRate !== undefined
            ? { employeeRate: nullableDecimal(dto.employeeRate) }
            : {}),
          ...(dto.employerRate !== undefined
            ? { employerRate: nullableDecimal(dto.employerRate) }
            : {}),
          ...(dto.fixedEmployeeAmount !== undefined
            ? { fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount) }
            : {}),
          ...(dto.fixedEmployerAmount !== undefined
            ? { fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount) }
            : {}),
          ...(dto.currencyCode !== undefined
            ? { currencyCode: normalizeOptional(dto.currencyCode) }
            : {}),
          ...(dto.formulaExpression !== undefined
            ? { formulaExpression: emptyToNull(dto.formulaExpression) }
            : {}),
          ...(dto.employeeTaxComponentId !== undefined
            ? { employeeTaxComponentId: dto.employeeTaxComponentId }
            : {}),
          ...(dto.employerTaxComponentId !== undefined
            ? { employerTaxComponentId: dto.employerTaxComponentId }
            : {}),
          ...(dto.postingCategory !== undefined
            ? { postingCategory: emptyToNull(dto.postingCategory) }
            : {}),
          ...(dto.taxStatementTemplateId !== undefined
            ? { taxStatementTemplateId: dto.taxStatementTemplateId }
            : {}),
          ...(dto.applicabilityRules !== undefined
            ? { applicabilityRules: jsonOrNull(dto.applicabilityRules) }
            : {}),
          ...(dto.configuration !== undefined
            ? { configuration: jsonOrNull(dto.configuration) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
          updatedById: user.userId,
          version: { increment: 1 },
        },
        include: taxRuleInclude,
      });
      await this.audit(
        user,
        'TAX_RULE_UPDATED',
        'TaxRule',
        id,
        existing,
        updated,
      );
      return mapTaxRule(updated);
    } catch (error) {
      handleUnique(error, 'Tax rule code already exists.');
    }
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const existing = await this.findRule(user.tenantId, id);
    const used = await this.prisma.payrollRunLineItem.count({
      where: {
        tenantId: user.tenantId,
        sourceType: 'TAX',
        sourceId: id,
        payrollRunEmployee: {
          payrollRun: {
            status: { in: ['APPROVED', 'PAID', 'LOCKED'] },
          },
        },
      },
    });
    if (used > 0)
      throw new ConflictException(
        'Tax rules used by approved, paid, or locked payroll cannot be deactivated.',
      );
    const updated = await this.prisma.taxRule.update({
      where: { id },
      data: { isActive: false },
      include: taxRuleInclude,
    });
    await this.audit(
      user,
      'TAX_RULE_DEACTIVATED',
      'TaxRule',
      id,
      existing,
      updated,
    );
    return mapTaxRule(updated);
  }

  async addBracket(
    user: AuthenticatedUser,
    taxRuleId: string,
    dto: CreateTaxRuleBracketDto,
  ) {
    const rule = await this.findRule(user.tenantId, taxRuleId);
    assertBracket(dto.minAmount, dto.maxAmount);
    await this.assertNoBracketOverlap(
      user.tenantId,
      taxRuleId,
      dto.minAmount,
      dto.maxAmount,
    );
    const created = await this.prisma.taxRuleBracket.create({
      data: {
        tenantId: user.tenantId,
        taxRuleId,
        sequence: dto.sequence ?? 10,
        minAmount: new Prisma.Decimal(dto.minAmount),
        maxAmount: nullableDecimal(dto.maxAmount),
        employeeRate: nullableDecimal(dto.employeeRate),
        employerRate: nullableDecimal(dto.employerRate),
        fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
        fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
        excessOver: nullableDecimal(dto.excessOver),
        minimumTax: nullableDecimal(dto.minimumTax),
        maximumTax: nullableDecimal(dto.maximumTax),
        effectiveFrom: parseOptionalDate(dto.effectiveFrom),
        effectiveTo: parseOptionalDate(dto.effectiveTo),
        status: dto.status ?? (rule.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE'),
      },
    });
    await this.audit(
      user,
      'TAX_BRACKET_CREATED',
      'TaxRuleBracket',
      created.id,
      null,
      created,
    );
    return this.get(user, taxRuleId);
  }

  async updateBracket(
    user: AuthenticatedUser,
    taxRuleId: string,
    bracketId: string,
    dto: UpdateTaxRuleBracketDto,
  ) {
    await this.findRule(user.tenantId, taxRuleId);
    assertBracket(dto.minAmount, dto.maxAmount);
    const existing = await this.findBracket(
      user.tenantId,
      taxRuleId,
      bracketId,
    );
    await this.assertNoBracketOverlap(
      user.tenantId,
      taxRuleId,
      dto.minAmount,
      dto.maxAmount,
      bracketId,
    );
    const updated = await this.prisma.taxRuleBracket.update({
      where: { id: bracketId },
      data: {
        minAmount: new Prisma.Decimal(dto.minAmount),
        sequence: dto.sequence ?? existing.sequence,
        maxAmount: nullableDecimal(dto.maxAmount),
        employeeRate: nullableDecimal(dto.employeeRate),
        employerRate: nullableDecimal(dto.employerRate),
        fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
        fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
        excessOver: nullableDecimal(dto.excessOver),
        minimumTax: nullableDecimal(dto.minimumTax),
        maximumTax: nullableDecimal(dto.maximumTax),
        effectiveFrom: parseOptionalDate(dto.effectiveFrom),
        effectiveTo: parseOptionalDate(dto.effectiveTo),
        status: dto.status ?? existing.status,
      },
    });
    await this.audit(
      user,
      'TAX_BRACKET_UPDATED',
      'TaxRuleBracket',
      bracketId,
      existing,
      updated,
    );
    return this.get(user, taxRuleId);
  }

  async deleteBracket(
    user: AuthenticatedUser,
    taxRuleId: string,
    bracketId: string,
  ) {
    const rule = await this.findRule(user.tenantId, taxRuleId);
    const existing = await this.findBracket(
      user.tenantId,
      taxRuleId,
      bracketId,
    );
    if (rule.status !== 'DRAFT' || existing.status !== 'DRAFT') {
      throw new ConflictException(
        'Only unused draft slabs on a draft tax policy can be deleted.',
      );
    }
    await this.prisma.taxRuleBracket.delete({ where: { id: bracketId } });
    await this.audit(
      user,
      'TAX_BRACKET_DELETED',
      'TaxRuleBracket',
      bracketId,
      existing,
      null,
    );
    return this.get(user, taxRuleId);
  }

  async reorderBrackets(
    user: AuthenticatedUser,
    taxRuleId: string,
    dto: ReorderTaxRuleBracketsDto,
  ) {
    await this.findRule(user.tenantId, taxRuleId);
    if (!dto.items.length) return this.listBrackets(user, taxRuleId);
    const uniqueIds = new Set(dto.items.map((item) => item.id));
    const uniqueSequences = new Set(dto.items.map((item) => item.sequence));
    if (
      uniqueIds.size !== dto.items.length ||
      uniqueSequences.size !== dto.items.length
    ) {
      throw new BadRequestException(
        'Each slab and sequence must appear exactly once.',
      );
    }
    const count = await this.prisma.taxRuleBracket.count({
      where: {
        tenantId: user.tenantId,
        taxRuleId,
        id: { in: [...uniqueIds] },
      },
    });
    if (count !== dto.items.length) {
      throw new BadRequestException(
        'One or more tax slabs do not belong to this policy.',
      );
    }
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.taxRuleBracket.update({
          where: { id: item.id },
          data: { sequence: item.sequence },
        }),
      ),
    );
    return this.listBrackets(user, taxRuleId);
  }

  async addPayComponent(
    user: AuthenticatedUser,
    taxRuleId: string,
    dto: AddTaxRulePayComponentDto,
  ) {
    await this.findRule(user.tenantId, taxRuleId);
    const component = await this.prisma.payComponent.findFirst({
      where: { tenantId: user.tenantId, id: dto.payComponentId },
      select: { id: true },
    });
    if (!component)
      throw new BadRequestException(
        'Pay component was not found for this tenant.',
      );
    const created = await this.prisma.taxRulePayComponent.upsert({
      where: {
        taxRuleId_payComponentId: {
          taxRuleId,
          payComponentId: dto.payComponentId,
        },
      },
      create: {
        tenantId: user.tenantId,
        taxRuleId,
        payComponentId: dto.payComponentId,
      },
      update: {},
    });
    await this.audit(
      user,
      'TAX_PAY_COMPONENT_MAPPING_ADDED',
      'TaxRulePayComponent',
      created.id,
      null,
      created,
    );
    return this.get(user, taxRuleId);
  }

  async removePayComponent(
    user: AuthenticatedUser,
    taxRuleId: string,
    payComponentId: string,
  ) {
    await this.findRule(user.tenantId, taxRuleId);
    const existing = await this.prisma.taxRulePayComponent.findFirst({
      where: { tenantId: user.tenantId, taxRuleId, payComponentId },
    });
    if (!existing) return this.get(user, taxRuleId);
    await this.prisma.taxRulePayComponent.delete({
      where: { id: existing.id },
    });
    await this.audit(
      user,
      'TAX_PAY_COMPONENT_MAPPING_REMOVED',
      'TaxRulePayComponent',
      existing.id,
      existing,
      null,
    );
    return this.get(user, taxRuleId);
  }

  private async findRule(tenantId: string, id: string) {
    const rule = await this.prisma.taxRule.findFirst({
      where: { tenantId, id },
      include: taxRuleInclude,
    });
    if (!rule) throw new NotFoundException('Tax rule was not found.');
    return rule;
  }

  private async findBracket(tenantId: string, taxRuleId: string, id: string) {
    const bracket = await this.prisma.taxRuleBracket.findFirst({
      where: { tenantId, taxRuleId, id },
    });
    if (!bracket) throw new NotFoundException('Tax bracket was not found.');
    return bracket;
  }

  private async assertEmployeeLevel(
    tenantId: string,
    employeeLevelId?: string | null,
  ) {
    if (!employeeLevelId) return;
    const level = await this.prisma.employeeLevel.findFirst({
      where: { tenantId, id: employeeLevelId, isActive: true },
      select: { id: true },
    });
    if (!level)
      throw new BadRequestException(
        'Active employee level was not found for this tenant.',
      );
  }

  private async assertExtendedReferences(
    tenantId: string,
    dto: CreateTaxRuleDto | UpdateTaxRuleDto,
  ) {
    const checks: Array<Promise<unknown>> = [];
    if (dto.organizationId)
      checks.push(
        this.prisma.organization.findFirst({
          where: { tenantId, id: dto.organizationId, isActive: true },
          select: { id: true },
        }),
      );
    if (dto.legalEntityId)
      checks.push(
        this.prisma.organization.findFirst({
          where: { tenantId, id: dto.legalEntityId, isActive: true },
          select: { id: true },
        }),
      );
    if (dto.payrollRegionId)
      checks.push(
        this.prisma.payrollRegion.findFirst({
          where: { tenantId, id: dto.payrollRegionId, status: 'ACTIVE' },
          select: { id: true },
        }),
      );
    for (const id of [dto.employeeTaxComponentId, dto.employerTaxComponentId]) {
      if (id)
        checks.push(
          this.prisma.payComponent.findFirst({
            where: { tenantId, id, isActive: true },
            select: { id: true },
          }),
        );
    }
    const results = await Promise.all(checks);
    if (results.some((result) => !result)) {
      throw new BadRequestException(
        'Tax policy scope or output mapping does not belong to this tenant or is inactive.',
      );
    }
  }

  private async assertDefaultScope(
    tenantId: string,
    dto: CreateTaxRuleDto | UpdateTaxRuleDto,
    excludeId?: string,
  ) {
    if (!dto.isDefault) return;
    const existing = await this.prisma.taxRule.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
        organizationId: dto.organizationId ?? null,
        legalEntityId: dto.legalEntityId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Only one default tax policy is allowed per organization and legal-entity scope.',
      );
    }
  }

  private async assertReferenceData(
    countryValue?: string | null,
    regionValue?: string | null,
    currencyValue?: string | null,
  ) {
    const countryCode = normalizeOptional(countryValue);
    const regionCode = normalizeOptional(regionValue);
    const currencyCode = normalizeOptional(currencyValue);

    if (
      currencyCode &&
      !CURRENCY_OPTIONS.some((currency) => currency.code === currencyCode)
    ) {
      throw new BadRequestException(
        'Select a currency from the configured currency options.',
      );
    }

    if (regionCode && !countryCode) {
      throw new BadRequestException(
        'Select a country before selecting a region.',
      );
    }

    if (!countryCode) return;

    const country = await this.prisma.country.findFirst({
      where: { code: countryCode, isActive: true },
      select: { id: true },
    });
    if (!country) {
      throw new BadRequestException(
        'Select a country from the active country lookup.',
      );
    }

    if (!regionCode) return;

    const region = await this.prisma.stateProvince.findFirst({
      where: {
        countryId: country.id,
        code: regionCode,
        isActive: true,
      },
      select: { id: true },
    });
    if (!region) {
      throw new BadRequestException(
        'Select an active region belonging to the selected country.',
      );
    }
  }

  private async assertNoBracketOverlap(
    tenantId: string,
    taxRuleId: string,
    minAmount: number,
    maxAmount?: number | null,
    excludeBracketId?: string,
  ) {
    const nextStart = Number(minAmount);
    const nextEnd =
      maxAmount === undefined || maxAmount === null
        ? Number.POSITIVE_INFINITY
        : Number(maxAmount);
    const brackets = await this.prisma.taxRuleBracket.findMany({
      where: {
        tenantId,
        taxRuleId,
        ...(excludeBracketId ? { id: { not: excludeBracketId } } : {}),
      },
      select: { id: true, minAmount: true, maxAmount: true },
    });

    const hasOverlap = brackets.some((bracket) => {
      const start = Number(bracket.minAmount);
      const end =
        bracket.maxAmount === null
          ? Number.POSITIVE_INFINITY
          : Number(bracket.maxAmount);
      return nextStart < end && start < nextEnd;
    });

    if (hasOverlap)
      throw new BadRequestException('Tax brackets cannot overlap.');
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

function mapTaxRule(
  rule: Prisma.TaxRuleGetPayload<{ include: typeof taxRuleInclude }>,
) {
  return {
    ...rule,
    employeeRate: rule.employeeRate?.toString() ?? null,
    employerRate: rule.employerRate?.toString() ?? null,
    fixedEmployeeAmount: rule.fixedEmployeeAmount?.toString() ?? null,
    fixedEmployerAmount: rule.fixedEmployerAmount?.toString() ?? null,
    brackets: rule.brackets.map(mapTaxBracket),
    bracketWarnings: taxBracketWarnings(rule.brackets),
  };
}

function mapTaxBracket(
  bracket: Prisma.TaxRuleBracketGetPayload<Record<string, never>>,
) {
  return {
    ...bracket,
    minAmount: bracket.minAmount.toString(),
    maxAmount: bracket.maxAmount?.toString() ?? null,
    employeeRate: bracket.employeeRate?.toString() ?? null,
    employerRate: bracket.employerRate?.toString() ?? null,
    fixedEmployeeAmount: bracket.fixedEmployeeAmount?.toString() ?? null,
    fixedEmployerAmount: bracket.fixedEmployerAmount?.toString() ?? null,
    excessOver: bracket.excessOver?.toString() ?? null,
    minimumTax: bracket.minimumTax?.toString() ?? null,
    maximumTax: bracket.maximumTax?.toString() ?? null,
  };
}

function taxBracketWarnings(
  brackets: Prisma.TaxRuleBracketGetPayload<Record<string, never>>[],
) {
  if (!brackets.length) return ['No tax slabs have been configured.'];
  const warnings: string[] = [];
  const sorted = [...brackets].sort(
    (first, second) => Number(first.minAmount) - Number(second.minAmount),
  );
  if (Number(sorted[0].minAmount) !== 0) {
    warnings.push('Slabs do not start at zero. Add a zero-rate exempt slab.');
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previousMaximum = sorted[index - 1].maxAmount;
    const currentMinimum = sorted[index].minAmount;
    if (previousMaximum === null) {
      warnings.push('Only the final slab may be open-ended.');
      break;
    }
    if (!previousMaximum.equals(currentMinimum)) {
      warnings.push(
        `Gap detected between ${previousMaximum.toString()} and ${currentMinimum.toString()}.`,
      );
    }
  }
  if (sorted[sorted.length - 1]?.maxAmount !== null) {
    warnings.push('The final slab is not open-ended.');
  }
  return warnings;
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertEffectiveDates(from: Date, to: Date | null) {
  if (to && to < from)
    throw new BadRequestException(
      'effectiveTo must be greater than or equal to effectiveFrom.',
    );
}

function assertBracket(minAmount: number, maxAmount?: number | null) {
  if (maxAmount !== undefined && maxAmount !== null && maxAmount <= minAmount) {
    throw new BadRequestException(
      'Bracket maxAmount must be greater than minAmount.',
    );
  }
}

function nullableDecimal(value?: number | null) {
  return value === undefined || value === null
    ? null
    : new Prisma.Decimal(value);
}

function normalizeCode(value: string | undefined, fallbackName?: string) {
  const source = value?.trim() || `${fallbackName || 'TAX'}_${shortSuffix()}`;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_ -]+/g, '_')
    .replace(/^[_ -]+|[_ -]+$/g, '')
    .slice(0, 80);
}

function shortSuffix() {
  return Date.now().toString(36).toUpperCase().slice(-6);
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeChoice(value?: string | null, fallback = '') {
  const normalized = value?.trim().toUpperCase();
  return normalized || fallback;
}

function jsonOrNull(value?: Record<string, unknown>) {
  return value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function handleUnique(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
