import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AddTaxRulePayComponentDto,
  CreateTaxRuleBracketDto,
  CreateTaxRuleDto,
  UpdateTaxRuleBracketDto,
  UpdateTaxRuleDto,
} from './dto/tax-rule.dto';
import { taxRuleInclude } from './tax-rule-resolver.service';

@Injectable()
export class TaxRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.taxRule.findMany({
      where: { tenantId: user.tenantId },
      include: taxRuleInclude,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    }).then((rules) => rules.map(mapTaxRule));
  }

  async get(user: AuthenticatedUser, id: string) {
    return mapTaxRule(await this.findRule(user.tenantId, id));
  }

  async create(user: AuthenticatedUser, dto: CreateTaxRuleDto) {
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const created = await this.prisma.taxRule.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          countryCode: normalizeOptional(dto.countryCode),
          regionCode: normalizeOptional(dto.regionCode),
          employeeLevelId: dto.employeeLevelId ?? null,
          calculationMethod: dto.calculationMethod,
          taxType: dto.taxType,
          employeeRate: nullableDecimal(dto.employeeRate),
          employerRate: nullableDecimal(dto.employerRate),
          fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
          fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
          currencyCode: normalizeOptional(dto.currencyCode),
          isActive: dto.isActive ?? true,
          effectiveFrom,
          effectiveTo,
        },
        include: taxRuleInclude,
      });
      await this.audit(user, 'TAX_RULE_CREATED', 'TaxRule', created.id, null, created);
      return mapTaxRule(created);
    } catch (error) {
      handleUnique(error, 'Tax rule code already exists.');
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaxRuleDto) {
    const existing = await this.findRule(user.tenantId, id);
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo !== undefined ? parseOptionalDate(dto.effectiveTo) : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const updated = await this.prisma.taxRule.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
          ...(dto.countryCode !== undefined ? { countryCode: normalizeOptional(dto.countryCode) } : {}),
          ...(dto.regionCode !== undefined ? { regionCode: normalizeOptional(dto.regionCode) } : {}),
          ...(dto.employeeLevelId !== undefined ? { employeeLevelId: dto.employeeLevelId } : {}),
          ...(dto.calculationMethod !== undefined ? { calculationMethod: dto.calculationMethod } : {}),
          ...(dto.taxType !== undefined ? { taxType: dto.taxType } : {}),
          ...(dto.employeeRate !== undefined ? { employeeRate: nullableDecimal(dto.employeeRate) } : {}),
          ...(dto.employerRate !== undefined ? { employerRate: nullableDecimal(dto.employerRate) } : {}),
          ...(dto.fixedEmployeeAmount !== undefined ? { fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount) } : {}),
          ...(dto.fixedEmployerAmount !== undefined ? { fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount) } : {}),
          ...(dto.currencyCode !== undefined ? { currencyCode: normalizeOptional(dto.currencyCode) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        },
        include: taxRuleInclude,
      });
      await this.audit(user, 'TAX_RULE_UPDATED', 'TaxRule', id, existing, updated);
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
    if (used > 0) throw new ConflictException('Tax rules used by approved, paid, or locked payroll cannot be deactivated.');
    const updated = await this.prisma.taxRule.update({
      where: { id },
      data: { isActive: false },
      include: taxRuleInclude,
    });
    await this.audit(user, 'TAX_RULE_DEACTIVATED', 'TaxRule', id, existing, updated);
    return mapTaxRule(updated);
  }

  async addBracket(user: AuthenticatedUser, taxRuleId: string, dto: CreateTaxRuleBracketDto) {
    await this.findRule(user.tenantId, taxRuleId);
    assertBracket(dto.minAmount, dto.maxAmount);
    await this.assertNoBracketOverlap(user.tenantId, taxRuleId, dto.minAmount, dto.maxAmount);
    const created = await this.prisma.taxRuleBracket.create({
      data: {
        tenantId: user.tenantId,
        taxRuleId,
        minAmount: new Prisma.Decimal(dto.minAmount),
        maxAmount: nullableDecimal(dto.maxAmount),
        employeeRate: nullableDecimal(dto.employeeRate),
        employerRate: nullableDecimal(dto.employerRate),
        fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
        fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
      },
    });
    await this.audit(user, 'TAX_BRACKET_CREATED', 'TaxRuleBracket', created.id, null, created);
    return this.get(user, taxRuleId);
  }

  async updateBracket(user: AuthenticatedUser, taxRuleId: string, bracketId: string, dto: UpdateTaxRuleBracketDto) {
    await this.findRule(user.tenantId, taxRuleId);
    assertBracket(dto.minAmount, dto.maxAmount);
    const existing = await this.findBracket(user.tenantId, taxRuleId, bracketId);
    await this.assertNoBracketOverlap(user.tenantId, taxRuleId, dto.minAmount, dto.maxAmount, bracketId);
    const updated = await this.prisma.taxRuleBracket.update({
      where: { id: bracketId },
      data: {
        minAmount: new Prisma.Decimal(dto.minAmount),
        maxAmount: nullableDecimal(dto.maxAmount),
        employeeRate: nullableDecimal(dto.employeeRate),
        employerRate: nullableDecimal(dto.employerRate),
        fixedEmployeeAmount: nullableDecimal(dto.fixedEmployeeAmount),
        fixedEmployerAmount: nullableDecimal(dto.fixedEmployerAmount),
      },
    });
    await this.audit(user, 'TAX_BRACKET_UPDATED', 'TaxRuleBracket', bracketId, existing, updated);
    return this.get(user, taxRuleId);
  }

  async deleteBracket(user: AuthenticatedUser, taxRuleId: string, bracketId: string) {
    await this.findRule(user.tenantId, taxRuleId);
    const existing = await this.findBracket(user.tenantId, taxRuleId, bracketId);
    await this.prisma.taxRuleBracket.delete({ where: { id: bracketId } });
    await this.audit(user, 'TAX_BRACKET_DELETED', 'TaxRuleBracket', bracketId, existing, null);
    return this.get(user, taxRuleId);
  }

  async addPayComponent(user: AuthenticatedUser, taxRuleId: string, dto: AddTaxRulePayComponentDto) {
    await this.findRule(user.tenantId, taxRuleId);
    const component = await this.prisma.payComponent.findFirst({
      where: { tenantId: user.tenantId, id: dto.payComponentId },
      select: { id: true },
    });
    if (!component) throw new BadRequestException('Pay component was not found for this tenant.');
    const created = await this.prisma.taxRulePayComponent.upsert({
      where: { taxRuleId_payComponentId: { taxRuleId, payComponentId: dto.payComponentId } },
      create: { tenantId: user.tenantId, taxRuleId, payComponentId: dto.payComponentId },
      update: {},
    });
    await this.audit(user, 'TAX_PAY_COMPONENT_MAPPING_ADDED', 'TaxRulePayComponent', created.id, null, created);
    return this.get(user, taxRuleId);
  }

  async removePayComponent(user: AuthenticatedUser, taxRuleId: string, payComponentId: string) {
    await this.findRule(user.tenantId, taxRuleId);
    const existing = await this.prisma.taxRulePayComponent.findFirst({
      where: { tenantId: user.tenantId, taxRuleId, payComponentId },
    });
    if (!existing) return this.get(user, taxRuleId);
    await this.prisma.taxRulePayComponent.delete({ where: { id: existing.id } });
    await this.audit(user, 'TAX_PAY_COMPONENT_MAPPING_REMOVED', 'TaxRulePayComponent', existing.id, existing, null);
    return this.get(user, taxRuleId);
  }

  private async findRule(tenantId: string, id: string) {
    const rule = await this.prisma.taxRule.findFirst({ where: { tenantId, id }, include: taxRuleInclude });
    if (!rule) throw new NotFoundException('Tax rule was not found.');
    return rule;
  }

  private async findBracket(tenantId: string, taxRuleId: string, id: string) {
    const bracket = await this.prisma.taxRuleBracket.findFirst({ where: { tenantId, taxRuleId, id } });
    if (!bracket) throw new NotFoundException('Tax bracket was not found.');
    return bracket;
  }

  private async assertEmployeeLevel(tenantId: string, employeeLevelId?: string | null) {
    if (!employeeLevelId) return;
    const level = await this.prisma.employeeLevel.findFirst({ where: { tenantId, id: employeeLevelId, isActive: true }, select: { id: true } });
    if (!level) throw new BadRequestException('Active employee level was not found for this tenant.');
  }

  private async assertNoBracketOverlap(
    tenantId: string,
    taxRuleId: string,
    minAmount: number,
    maxAmount?: number | null,
    excludeBracketId?: string,
  ) {
    const nextStart = Number(minAmount);
    const nextEnd = maxAmount === undefined || maxAmount === null ? Number.POSITIVE_INFINITY : Number(maxAmount);
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
      const end = bracket.maxAmount === null ? Number.POSITIVE_INFINITY : Number(bracket.maxAmount);
      return nextStart < end && start < nextEnd;
    });

    if (hasOverlap) throw new BadRequestException('Tax brackets cannot overlap.');
  }

  private audit(user: AuthenticatedUser, action: string, entityType: string, entityId: string, beforeSnapshot: unknown, afterSnapshot: unknown) {
    return this.auditService.log({ tenantId: user.tenantId, actorUserId: user.userId, action, entityType, entityId, beforeSnapshot, afterSnapshot });
  }
}

function mapTaxRule(rule: Prisma.TaxRuleGetPayload<{ include: typeof taxRuleInclude }>) {
  return {
    ...rule,
    employeeRate: rule.employeeRate?.toString() ?? null,
    employerRate: rule.employerRate?.toString() ?? null,
    fixedEmployeeAmount: rule.fixedEmployeeAmount?.toString() ?? null,
    fixedEmployerAmount: rule.fixedEmployerAmount?.toString() ?? null,
    brackets: rule.brackets.map((bracket) => ({
      ...bracket,
      minAmount: bracket.minAmount.toString(),
      maxAmount: bracket.maxAmount?.toString() ?? null,
      employeeRate: bracket.employeeRate?.toString() ?? null,
      employerRate: bracket.employerRate?.toString() ?? null,
      fixedEmployeeAmount: bracket.fixedEmployeeAmount?.toString() ?? null,
      fixedEmployerAmount: bracket.fixedEmployerAmount?.toString() ?? null,
    })),
  };
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertEffectiveDates(from: Date, to: Date | null) {
  if (to && to < from) throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom.');
}

function assertBracket(minAmount: number, maxAmount?: number | null) {
  if (maxAmount !== undefined && maxAmount !== null && maxAmount <= minAmount) {
    throw new BadRequestException('Bracket maxAmount must be greater than minAmount.');
  }
}

function nullableDecimal(value?: number | null) {
  return value === undefined || value === null ? null : new Prisma.Decimal(value);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function handleUnique(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
}
