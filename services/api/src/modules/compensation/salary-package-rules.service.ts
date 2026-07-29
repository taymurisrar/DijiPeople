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
import {
  CreateSalaryPackageRuleComponentDto,
  CreateSalaryPackageRuleDto,
  UpdateSalaryPackageRuleComponentDto,
  UpdateSalaryPackageRuleDto,
} from './dto/salary-package-rule.dto';

const packageInclude = {
  components: {
    include: { payComponent: true, percentageBaseComponent: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.SalaryPackageRuleInclude;

@Injectable()
export class SalaryPackageRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: { page?: number; pageSize?: number; search?: string },
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const where: Prisma.SalaryPackageRuleWhereInput = {
      tenantId: user.tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { currencyCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salaryPackageRule.findMany({
        where,
        include: {
          _count: { select: { components: true, compensations: true } },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salaryPackageRule.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...mapRuleSummary(item),
        componentCount: item._count.components,
        assignmentCount: item._count.compensations,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    const rule = await this.findRule(user.tenantId, id);
    return mapRule(rule);
  }

  async create(user: AuthenticatedUser, dto: CreateSalaryPackageRuleDto) {
    await this.validateScope(user.tenantId, dto);
    assertDateRange(dto.effectiveFrom, dto.effectiveTo);
    await this.assertDefaultScope(user.tenantId, dto);
    try {
      const created = await this.prisma.salaryPackageRule.create({
        data: {
          tenantId: user.tenantId,
          code: normalizePackageCode(dto.code?.trim() || dto.name),
          name: dto.name.trim(),
          currencyCode: dto.currencyCode.trim().toUpperCase(),
          ...ruleData({ ...dto, ownerUserId: dto.ownerUserId ?? user.userId }),
          createdById: user.userId,
          updatedById: user.userId,
        },
        include: packageInclude,
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SALARY_PACKAGE_RULE_CREATED',
        entityType: 'SalaryPackageRule',
        entityId: created.id,
        afterSnapshot: created,
      });
      return mapRule(created);
    } catch (error) {
      handleUnique(error, 'Salary package rule name is already in use.');
    }
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateSalaryPackageRuleDto,
  ) {
    const existing = await this.findRule(user.tenantId, id);
    await this.validateScope(user.tenantId, dto);
    assertDateRange(dto.effectiveFrom, dto.effectiveTo);
    await this.assertDefaultScope(user.tenantId, dto, id);
    try {
      const updated = await this.prisma.salaryPackageRule.update({
        where: { id },
        data: {
          ...ruleData(dto),
          updatedById: user.userId,
          version: { increment: 1 },
        },
        include: packageInclude,
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SALARY_PACKAGE_RULE_UPDATED',
        entityType: 'SalaryPackageRule',
        entityId: id,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });
      return mapRule(updated);
    } catch (error) {
      handleUnique(error, 'Salary package rule name is already in use.');
    }
  }

  async createComponent(
    user: AuthenticatedUser,
    ruleId: string,
    dto: CreateSalaryPackageRuleComponentDto,
  ) {
    await this.findRule(user.tenantId, ruleId);
    await this.validateComponent(user.tenantId, dto);
    try {
      const created = await this.prisma.salaryPackageRuleComponent.create({
        data: componentCreateData(user.tenantId, ruleId, dto, user.userId),
        include: { payComponent: true, percentageBaseComponent: true },
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SALARY_PACKAGE_COMPONENT_CREATED',
        entityType: 'SalaryPackageRuleComponent',
        entityId: created.id,
        afterSnapshot: created,
      });
      return mapComponent(created);
    } catch (error) {
      handleUnique(
        error,
        'This pay component is already assigned to the salary package rule.',
      );
    }
  }

  async updateComponent(
    user: AuthenticatedUser,
    ruleId: string,
    componentId: string,
    dto: UpdateSalaryPackageRuleComponentDto,
  ) {
    const existing = await this.findComponent(
      user.tenantId,
      ruleId,
      componentId,
    );
    await this.validateComponent(user.tenantId, dto);
    try {
      const updated = await this.prisma.salaryPackageRuleComponent.update({
        where: { id: componentId },
        data: {
          ...componentData(user.tenantId, ruleId, dto, user.userId, true),
          updatedById: user.userId,
        },
        include: { payComponent: true, percentageBaseComponent: true },
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SALARY_PACKAGE_COMPONENT_UPDATED',
        entityType: 'SalaryPackageRuleComponent',
        entityId: componentId,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });
      return mapComponent(updated);
    } catch (error) {
      handleUnique(
        error,
        'This pay component is already assigned to the salary package rule.',
      );
    }
  }

  async removeComponent(
    user: AuthenticatedUser,
    ruleId: string,
    componentId: string,
  ) {
    const existing = await this.findComponent(
      user.tenantId,
      ruleId,
      componentId,
    );
    await this.prisma.salaryPackageRuleComponent.delete({
      where: { id: componentId },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'SALARY_PACKAGE_COMPONENT_REMOVED',
      entityType: 'SalaryPackageRuleComponent',
      entityId: componentId,
      beforeSnapshot: existing,
    });
    return { deleted: true, id: componentId };
  }

  async assignments(
    user: AuthenticatedUser,
    ruleId: string,
    query: { page?: number; pageSize?: number },
  ) {
    await this.findRule(user.tenantId, ruleId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where = { tenantId: user.tenantId, salaryPackageRuleId: ruleId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employeeCompensationHistory.findMany({
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
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employeeCompensationHistory.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName:
          `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        employeeCode: item.employee.employeeCode,
        currencyCode: item.currencyCode,
        effectiveFrom: item.effectiveFrom,
        status: item.status,
        grossAmount: item.grossEarnings.toString(),
        updatedAt: item.updatedAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private async findRule(tenantId: string, id: string) {
    const rule = await this.prisma.salaryPackageRule.findFirst({
      where: { tenantId, id },
      include: packageInclude,
    });
    if (!rule)
      throw new NotFoundException('Salary package rule was not found.');
    return rule;
  }

  private async findComponent(
    tenantId: string,
    ruleId: string,
    componentId: string,
  ) {
    const component = await this.prisma.salaryPackageRuleComponent.findFirst({
      where: { tenantId, salaryPackageRuleId: ruleId, id: componentId },
      include: { payComponent: true, percentageBaseComponent: true },
    });
    if (!component)
      throw new NotFoundException('Salary package component was not found.');
    return component;
  }

  private async validateScope(
    tenantId: string,
    dto: Partial<CreateSalaryPackageRuleDto>,
  ) {
    if (dto.currencyCode)
      await assertCurrency(this.prisma, tenantId, dto.currencyCode);
    if (dto.organizationId)
      await assertExists(
        this.prisma.organization,
        tenantId,
        dto.organizationId,
        'organization',
      );
    if (dto.legalEntityId)
      await assertExists(
        this.prisma.organization,
        tenantId,
        dto.legalEntityId,
        'legal entity',
      );
    if (dto.businessUnitId) {
      const businessUnit = await this.prisma.businessUnit.findFirst({
        where: { tenantId, id: dto.businessUnitId, isActive: true },
        select: { id: true, organizationId: true },
      });
      if (!businessUnit)
        throw new BadRequestException('Selected business unit was not found.');
      if (
        dto.organizationId &&
        businessUnit.organizationId !== dto.organizationId
      )
        throw new BadRequestException(
          'Selected business unit must belong to the selected organization.',
        );
    }
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { tenantId, id: dto.departmentId, isActive: true },
        select: {
          id: true,
          businessUnitId: true,
          businessUnit: { select: { organizationId: true } },
        },
      });
      if (!department)
        throw new BadRequestException('Selected department was not found.');
      if (
        dto.businessUnitId &&
        department.businessUnitId !== dto.businessUnitId
      )
        throw new BadRequestException(
          'Selected department must belong to the selected business unit.',
        );
      if (
        dto.organizationId &&
        department.businessUnit?.organizationId !== dto.organizationId
      )
        throw new BadRequestException(
          'Selected department must belong to the selected organization.',
        );
    }
    if (dto.employeeLevelId)
      await assertExists(
        this.prisma.employeeLevel,
        tenantId,
        dto.employeeLevelId,
        'employee level',
      );
    if (dto.employmentTypeId)
      await assertExists(
        this.prisma.employmentType,
        tenantId,
        dto.employmentTypeId,
        'employment type',
      );
  }

  private async assertDefaultScope(
    tenantId: string,
    dto: Partial<CreateSalaryPackageRuleDto>,
    excludeId?: string,
  ) {
    if (!dto.isDefault) return;
    const existing = await this.prisma.salaryPackageRule.findFirst({
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
    if (existing)
      throw new ConflictException(
        'Only one default compensation package is allowed per organization and legal-entity scope.',
      );
  }

  private async validateComponent(
    tenantId: string,
    dto: Partial<CreateSalaryPackageRuleComponentDto>,
  ) {
    if (dto.payComponentId) {
      const component = await this.prisma.payComponent.findFirst({
        where: { tenantId, id: dto.payComponentId, isActive: true },
      });
      if (!component)
        throw new BadRequestException(
          'Component must reference an active pay component in the same tenant.',
        );
    }
    if (dto.percentageBaseComponentId) {
      const base = await this.prisma.payComponent.findFirst({
        where: { tenantId, id: dto.percentageBaseComponentId, isActive: true },
      });
      if (!base)
        throw new BadRequestException(
          'Percentage base component must reference an active pay component.',
        );
    }
    const componentCodes = dto.formulaExpression
      ? await this.prisma.payComponent.findMany({
          where: { tenantId, isActive: true },
          select: { code: true },
        })
      : [];
    validateCalculationFields(
      dto.calculationMethod,
      dto.fixedAmount,
      dto.percentage,
      dto.formulaExpression,
      componentCodes.map((component) => component.code),
    );
    assertNonNegative('fixedAmount', dto.fixedAmount);
    assertNonNegative('percentage', dto.percentage);
    assertNonNegative('minimumAmount', dto.minimumAmount);
    assertNonNegative('maximumAmount', dto.maximumAmount);
  }
}

function ruleData(dto: Partial<CreateSalaryPackageRuleDto>) {
  return {
    ...(dto.code !== undefined
      ? { code: normalizePackageCode(dto.code.trim() || dto.name || '') }
      : {}),
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.description !== undefined
      ? { description: clean(dto.description) }
      : {}),
    ...(dto.currencyCode !== undefined
      ? { currencyCode: dto.currencyCode.trim().toUpperCase() }
      : {}),
    ...(dto.organizationId !== undefined
      ? { organizationId: clean(dto.organizationId) }
      : {}),
    ...(dto.legalEntityId !== undefined
      ? { legalEntityId: clean(dto.legalEntityId) }
      : {}),
    ...(dto.businessUnitId !== undefined
      ? { businessUnitId: clean(dto.businessUnitId) }
      : {}),
    ...(dto.departmentId !== undefined
      ? { departmentId: clean(dto.departmentId) }
      : {}),
    ...(dto.employeeLevelId !== undefined
      ? { employeeLevelId: clean(dto.employeeLevelId) }
      : {}),
    ...(dto.employmentTypeId !== undefined
      ? { employmentTypeId: clean(dto.employmentTypeId) }
      : {}),
    ...(dto.payFrequency !== undefined
      ? { payFrequency: dto.payFrequency }
      : {}),
    ...(dto.effectiveFrom !== undefined
      ? { effectiveFrom: date(dto.effectiveFrom) }
      : {}),
    ...(dto.effectiveTo !== undefined
      ? { effectiveTo: date(dto.effectiveTo) }
      : {}),
    ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
    ...(dto.status !== undefined
      ? { status: dto.status, isActive: dto.status === 'ACTIVE' }
      : dto.isActive !== undefined
        ? {
            isActive: dto.isActive,
            status: dto.isActive ? ('ACTIVE' as const) : ('INACTIVE' as const),
          }
        : {}),
    ...(dto.ownerUserId !== undefined
      ? { ownerUserId: clean(dto.ownerUserId) }
      : {}),
    ...(dto.eligibilityRules !== undefined
      ? { eligibilityRules: dto.eligibilityRules as Prisma.InputJsonValue }
      : {}),
    ...(dto.autoAssign !== undefined ? { autoAssign: dto.autoAssign } : {}),
    ...(dto.allowEmployeeOverride !== undefined
      ? { allowEmployeeOverride: dto.allowEmployeeOverride }
      : {}),
    ...(dto.overrideRequiresApproval !== undefined
      ? { overrideRequiresApproval: dto.overrideRequiresApproval }
      : {}),
    ...(dto.configuration !== undefined
      ? { configuration: dto.configuration as Prisma.InputJsonValue }
      : {}),
  };
}

function normalizePackageCode(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!code)
    throw new BadRequestException('Compensation package code is required.');
  return code;
}

function componentData(
  tenantId: string,
  ruleId: string,
  dto: Partial<CreateSalaryPackageRuleComponentDto>,
  userId: string,
  partial = false,
) {
  return {
    ...(partial ? {} : { tenantId, salaryPackageRuleId: ruleId }),
    ...(dto.payComponentId !== undefined
      ? { payComponentId: dto.payComponentId }
      : {}),
    ...(dto.calculationMethod !== undefined
      ? { calculationMethod: dto.calculationMethod }
      : {}),
    ...(dto.fixedAmount !== undefined
      ? { fixedAmount: decimalOrNull(dto.fixedAmount) }
      : {}),
    ...(dto.percentage !== undefined
      ? { percentage: decimalOrNull(dto.percentage) }
      : {}),
    ...(dto.percentageBaseComponentId !== undefined
      ? { percentageBaseComponentId: clean(dto.percentageBaseComponentId) }
      : {}),
    ...(dto.formulaExpression !== undefined
      ? { formulaExpression: clean(dto.formulaExpression) }
      : {}),
    ...(dto.minimumAmount !== undefined
      ? { minimumAmount: decimalOrNull(dto.minimumAmount) }
      : {}),
    ...(dto.maximumAmount !== undefined
      ? { maximumAmount: decimalOrNull(dto.maximumAmount) }
      : {}),
    ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
    ...(dto.isEmployeeEditable !== undefined
      ? { isEmployeeEditable: dto.isEmployeeEditable }
      : {}),
    ...(dto.displayOrder !== undefined
      ? { displayOrder: dto.displayOrder }
      : {}),
    ...(dto.effectiveFrom !== undefined
      ? { effectiveFrom: date(dto.effectiveFrom) }
      : {}),
    ...(dto.effectiveTo !== undefined
      ? { effectiveTo: date(dto.effectiveTo) }
      : {}),
    ...(dto.status !== undefined ? { status: dto.status } : {}),
    ...(partial ? { version: { increment: 1 } } : {}),
    ...(partial ? {} : { createdById: userId }),
    updatedById: userId,
  };
}

function componentCreateData(
  tenantId: string,
  ruleId: string,
  dto: CreateSalaryPackageRuleComponentDto,
  userId: string,
) {
  return {
    tenantId,
    salaryPackageRuleId: ruleId,
    payComponentId: dto.payComponentId,
    calculationMethod: dto.calculationMethod,
    fixedAmount: decimalOrNull(dto.fixedAmount),
    percentage: decimalOrNull(dto.percentage),
    percentageBaseComponentId: clean(dto.percentageBaseComponentId),
    formulaExpression: clean(dto.formulaExpression),
    minimumAmount: decimalOrNull(dto.minimumAmount),
    maximumAmount: decimalOrNull(dto.maximumAmount),
    isRequired: dto.isRequired ?? false,
    isEmployeeEditable: dto.isEmployeeEditable ?? false,
    displayOrder: dto.displayOrder ?? 0,
    effectiveFrom: date(dto.effectiveFrom),
    effectiveTo: date(dto.effectiveTo),
    status: dto.status ?? 'ACTIVE',
    createdById: userId,
    updatedById: userId,
  };
}

export function validateCalculationFields(
  method?: PayComponentCalculationMethod,
  fixedAmount?: string | null,
  percentage?: string | null,
  formulaExpression?: string | null,
  allowedComponentCodes: readonly string[] = [],
) {
  if (method === 'FIXED' && !fixedAmount) {
    throw new BadRequestException(
      'Fixed salary package components require fixed amount.',
    );
  }
  if (method === 'PERCENTAGE' && !percentage) {
    throw new BadRequestException(
      'Percentage salary package components require percentage.',
    );
  }
  if (method === 'FORMULA') {
    const formula = formulaExpression?.trim();
    if (!formula)
      throw new BadRequestException(
        'Formula components require formula expression.',
      );
    if (!/^[A-Z0-9_+\-*/%(),.\s]+$/i.test(formula)) {
      throw new BadRequestException(
        'Formula expression contains unsupported tokens.',
      );
    }
    const identifiers = formula.match(/[A-Z_][A-Z0-9_]*/gi) ?? [];
    const allowedComponents = new Set(
      allowedComponentCodes.map((code) => code.trim().toUpperCase()),
    );
    const approvedIdentifiers = new Set([
      'BASIC',
      'BASE',
      'GROSS',
      'WORKING_DAYS',
      'CALENDAR_DAYS',
      'PAID_DAYS',
      'UNPAID_DAYS',
      'APPROVED_HOURS',
      'OVERTIME_HOURS',
      'MIN',
      'MAX',
      'ROUND',
      'CEIL',
      'FLOOR',
    ]);
    const unsupported = identifiers.some((identifier: string) => {
      const normalized = identifier.toUpperCase();
      return (
        !approvedIdentifiers.has(normalized) &&
        !allowedComponents.has(normalized)
      );
    });
    if (unsupported) {
      throw new BadRequestException(
        'Formula expression contains unsupported tokens.',
      );
    }
  }
}

async function assertCurrency(
  prisma: PrismaService,
  tenantId: string,
  currencyCode: string,
) {
  const currency = await prisma.currency.findFirst({
    where: {
      tenantId,
      code: currencyCode.trim().toUpperCase(),
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!currency)
    throw new BadRequestException(
      'Selected currency is not active for this tenant.',
    );
}

async function assertExists(
  model: { findFirst: (args: unknown) => Promise<unknown> },
  tenantId: string,
  id: string,
  label: string,
) {
  const row = await model.findFirst({
    where: { tenantId, id, isActive: true },
    select: { id: true },
  });
  if (!row) throw new BadRequestException(`Selected ${label} was not found.`);
}

function assertDateRange(from?: string, to?: string) {
  if (from && to && new Date(to) < new Date(from)) {
    throw new BadRequestException(
      'Effective To cannot be before Effective From.',
    );
  }
}

function assertNonNegative(field: string, value?: string | null) {
  if (
    value !== undefined &&
    value !== null &&
    new Prisma.Decimal(value).lt(0)
  ) {
    throw new BadRequestException(`${field} cannot be negative.`);
  }
}

function decimalOrNull(value?: string | null) {
  return value ? new Prisma.Decimal(value) : null;
}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function date(value?: string | null) {
  return value ? new Date(value) : null;
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

function mapRuleSummary(rule: Prisma.SalaryPackageRuleGetPayload<object>) {
  return { ...rule };
}

function mapRule<
  T extends Prisma.SalaryPackageRuleGetPayload<{
    include: typeof packageInclude;
  }>,
>(rule: T) {
  return {
    ...rule,
    components: rule.components?.map(mapComponent) ?? [],
  };
}

function mapComponent(
  component: Prisma.SalaryPackageRuleComponentGetPayload<{
    include: { payComponent: true; percentageBaseComponent: true };
  }>,
) {
  return {
    ...component,
    payComponentName: component.payComponent.name,
    payComponentCode: component.payComponent.code,
    percentageBaseComponentName:
      component.percentageBaseComponent?.name ?? null,
    fixedAmount: component.fixedAmount?.toString() ?? null,
    percentage: component.percentage?.toString() ?? null,
    minimumAmount: component.minimumAmount?.toString() ?? null,
    maximumAmount: component.maximumAmount?.toString() ?? null,
    category:
      component.payComponent.componentCategory ??
      component.payComponent.componentType,
  };
}
