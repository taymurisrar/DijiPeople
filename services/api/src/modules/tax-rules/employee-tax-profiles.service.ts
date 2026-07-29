import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigurationStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateEmployeeTaxProfileDto,
  EmployeeTaxProfileQueryDto,
  UpdateEmployeeTaxProfileDto,
} from './dto/employee-tax-profile.dto';

const profileInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      organizationId: true,
      businessUnitId: true,
    },
  },
  taxRule: { select: { id: true, code: true, name: true, isActive: true } },
} satisfies Prisma.EmployeeTaxProfileInclude;

type Profile = Prisma.EmployeeTaxProfileGetPayload<{
  include: typeof profileInclude;
}>;

@Injectable()
export class EmployeeTaxProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser, query: EmployeeTaxProfileQueryDto) {
    const profiles = await this.prisma.employeeTaxProfile.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: profileInclude,
      orderBy: [
        { status: 'asc' },
        { effectiveFrom: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    return profiles.map(mapProfile);
  }

  async get(user: AuthenticatedUser, id: string) {
    return mapProfile(await this.findOrThrow(user.tenantId, id));
  }

  async create(user: AuthenticatedUser, dto: CreateEmployeeTaxProfileDto) {
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertDateRange(effectiveFrom, effectiveTo);
    assertOverrideReason(dto);
    await this.validateReferences(
      user.tenantId,
      dto,
      effectiveFrom,
      effectiveTo,
    );
    await this.assertNoActiveOverlap(
      user.tenantId,
      dto.employeeId,
      dto.status ?? ConfigurationStatus.ACTIVE,
      effectiveFrom,
      effectiveTo,
    );

    try {
      const data: Prisma.EmployeeTaxProfileUncheckedCreateInput = {
        tenantId: user.tenantId,
        employeeId: dto.employeeId,
        taxIdentificationNumber: normalize(dto.taxIdentificationNumber),
        taxResidencyCountryCode: normalizeCode(dto.taxResidencyCountryCode),
        workTaxJurisdiction: normalize(dto.workTaxJurisdiction),
        taxStatus: normalize(dto.taxStatus),
        taxCategory: normalize(dto.taxCategory),
        filingStatus: normalize(dto.filingStatus),
        dependentAllowances: dto.dependentAllowances ?? 0,
        taxRuleId: dto.taxRuleId ?? null,
        additionalTaxAmount: decimal(dto.additionalTaxAmount),
        taxExemptionAmount: decimal(dto.taxExemptionAmount),
        taxCreditAmount: decimal(dto.taxCreditAmount),
        previousEmployerTaxableIncome: decimal(
          dto.previousEmployerTaxableIncome,
        ),
        previousEmployerTaxDeducted: decimal(dto.previousEmployerTaxDeducted),
        jurisdictionExtensions:
          dto.jurisdictionExtensions === null
            ? Prisma.JsonNull
            : (dto.jurisdictionExtensions as Prisma.InputJsonValue | undefined),
        effectiveFrom,
        effectiveTo,
        overrideReason: normalize(dto.overrideReason),
        status: dto.status ?? ConfigurationStatus.ACTIVE,
        ownerUserId: dto.ownerUserId ?? user.userId,
        createdById: user.userId,
        updatedById: user.userId,
      };
      const created = await this.prisma.employeeTaxProfile.create({
        data,
        include: profileInclude,
      });
      await this.log(user, 'EMPLOYEE_TAX_PROFILE_CREATED', created, null);
      return mapProfile(created);
    } catch (error) {
      handleUnique(error);
    }
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmployeeTaxProfileDto,
  ) {
    const existing = await this.findOrThrow(user.tenantId, id);
    const effectiveFrom = dto.effectiveFrom
      ? parseDate(dto.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    const employeeId = dto.employeeId ?? existing.employeeId;
    const status = dto.status ?? existing.status;
    assertDateRange(effectiveFrom, effectiveTo);
    assertOverrideReason({
      additionalTaxAmount:
        dto.additionalTaxAmount ?? Number(existing.additionalTaxAmount),
      taxExemptionAmount:
        dto.taxExemptionAmount ?? Number(existing.taxExemptionAmount),
      taxCreditAmount: dto.taxCreditAmount ?? Number(existing.taxCreditAmount),
      overrideReason:
        dto.overrideReason !== undefined
          ? dto.overrideReason
          : existing.overrideReason,
    });
    await this.validateReferences(
      user.tenantId,
      {
        ...dto,
        employeeId,
        taxRuleId:
          dto.taxRuleId !== undefined ? dto.taxRuleId : existing.taxRuleId,
      },
      effectiveFrom,
      effectiveTo,
    );
    await this.assertNoActiveOverlap(
      user.tenantId,
      employeeId,
      status,
      effectiveFrom,
      effectiveTo,
      id,
    );

    try {
      const data: Prisma.EmployeeTaxProfileUncheckedUpdateInput = {
        ...(dto.employeeId !== undefined ? { employeeId } : {}),
        ...(dto.taxIdentificationNumber !== undefined
          ? { taxIdentificationNumber: normalize(dto.taxIdentificationNumber) }
          : {}),
        ...(dto.taxResidencyCountryCode !== undefined
          ? {
              taxResidencyCountryCode: normalizeCode(
                dto.taxResidencyCountryCode,
              ),
            }
          : {}),
        ...(dto.workTaxJurisdiction !== undefined
          ? { workTaxJurisdiction: normalize(dto.workTaxJurisdiction) }
          : {}),
        ...(dto.taxStatus !== undefined
          ? { taxStatus: normalize(dto.taxStatus) }
          : {}),
        ...(dto.taxCategory !== undefined
          ? { taxCategory: normalize(dto.taxCategory) }
          : {}),
        ...(dto.filingStatus !== undefined
          ? { filingStatus: normalize(dto.filingStatus) }
          : {}),
        ...(dto.dependentAllowances !== undefined
          ? { dependentAllowances: dto.dependentAllowances }
          : {}),
        ...(dto.taxRuleId !== undefined ? { taxRuleId: dto.taxRuleId } : {}),
        ...(dto.additionalTaxAmount !== undefined
          ? { additionalTaxAmount: decimal(dto.additionalTaxAmount) }
          : {}),
        ...(dto.taxExemptionAmount !== undefined
          ? { taxExemptionAmount: decimal(dto.taxExemptionAmount) }
          : {}),
        ...(dto.taxCreditAmount !== undefined
          ? { taxCreditAmount: decimal(dto.taxCreditAmount) }
          : {}),
        ...(dto.previousEmployerTaxableIncome !== undefined
          ? {
              previousEmployerTaxableIncome: decimal(
                dto.previousEmployerTaxableIncome,
              ),
            }
          : {}),
        ...(dto.previousEmployerTaxDeducted !== undefined
          ? {
              previousEmployerTaxDeducted: decimal(
                dto.previousEmployerTaxDeducted,
              ),
            }
          : {}),
        ...(dto.jurisdictionExtensions !== undefined
          ? {
              jurisdictionExtensions:
                dto.jurisdictionExtensions === null
                  ? Prisma.JsonNull
                  : (dto.jurisdictionExtensions as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        ...(dto.overrideReason !== undefined
          ? { overrideReason: normalize(dto.overrideReason) }
          : {}),
        ...(dto.status !== undefined ? { status } : {}),
        ...(dto.ownerUserId !== undefined
          ? { ownerUserId: dto.ownerUserId }
          : {}),
        updatedById: user.userId,
      };
      const updated = await this.prisma.employeeTaxProfile.update({
        where: { id },
        data,
        include: profileInclude,
      });
      await this.log(user, 'EMPLOYEE_TAX_PROFILE_UPDATED', updated, existing);
      return mapProfile(updated);
    } catch (error) {
      handleUnique(error);
    }
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const existing = await this.findOrThrow(user.tenantId, id);
    if (existing.status === ConfigurationStatus.INACTIVE) {
      return mapProfile(existing);
    }
    const updated = await this.prisma.employeeTaxProfile.update({
      where: { id },
      data: {
        status: ConfigurationStatus.INACTIVE,
        updatedById: user.userId,
      },
      include: profileInclude,
    });
    await this.log(user, 'EMPLOYEE_TAX_PROFILE_DEACTIVATED', updated, existing);
    return mapProfile(updated);
  }

  private findOrThrow(tenantId: string, id: string) {
    return this.prisma.employeeTaxProfile
      .findFirst({ where: { tenantId, id }, include: profileInclude })
      .then((profile) => {
        if (!profile)
          throw new NotFoundException('Employee tax profile was not found.');
        return profile;
      });
  }

  private async validateReferences(
    tenantId: string,
    dto: Pick<
      CreateEmployeeTaxProfileDto,
      | 'employeeId'
      | 'taxRuleId'
      | 'ownerUserId'
      | 'taxResidencyCountryCode'
    >,
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: dto.employeeId, isDeleted: false },
      select: { id: true },
    });
    if (!employee)
      throw new BadRequestException('Select an employee in this tenant.');

    const countryCode = normalizeCode(dto.taxResidencyCountryCode);
    if (countryCode) {
      const country = await this.prisma.country.findFirst({
        where: { code: countryCode, isActive: true },
        select: { id: true },
      });
      if (!country) {
        throw new BadRequestException(
          'Select an active tax-residency country.',
        );
      }
    }

    if (dto.taxRuleId) {
      const rule = await this.prisma.taxRule.findFirst({
        where: { tenantId, id: dto.taxRuleId, isActive: true },
        select: { id: true, effectiveFrom: true, effectiveTo: true },
      });
      if (
        !rule ||
        rule.effectiveFrom > effectiveFrom ||
        (rule.effectiveTo && (!effectiveTo || rule.effectiveTo < effectiveTo))
      ) {
        throw new BadRequestException(
          'Assigned tax policy must be active and cover the profile effective dates.',
        );
      }
    }
    if (dto.ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, id: dto.ownerUserId },
        select: { id: true },
      });
      if (!owner)
        throw new BadRequestException('Select an owner in this tenant.');
    }
  }

  private async assertNoActiveOverlap(
    tenantId: string,
    employeeId: string,
    status: ConfigurationStatus,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string,
  ) {
    if (status !== ConfigurationStatus.ACTIVE) return;
    const overlap = await this.prisma.employeeTaxProfile.findFirst({
      where: {
        tenantId,
        employeeId,
        status: ConfigurationStatus.ACTIVE,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        effectiveFrom: {
          lte: effectiveTo ?? new Date('9999-12-31T00:00:00.000Z'),
        },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        'An active employee tax profile already overlaps this effective date range.',
      );
    }
  }

  private log(
    user: AuthenticatedUser,
    action: string,
    after: Profile,
    before: Profile | null,
  ) {
    return this.audit.log({
      tenantId: user.tenantId,
      organizationId: after.employee.organizationId,
      businessUnitId: after.employee.businessUnitId,
      actorUserId: user.userId,
      action,
      entityType: 'EmployeeTaxProfile',
      entityId: after.id,
      sourceModule: 'tax-rules',
      beforeSnapshot: before ? auditSnapshot(before) : null,
      afterSnapshot: auditSnapshot(after),
    });
  }
}

function mapProfile(profile: Profile) {
  return {
    ...profile,
    employeeName:
      `${profile.employee.firstName} ${profile.employee.lastName}`.trim(),
    employeeCode: profile.employee.employeeCode,
    taxRuleName: profile.taxRule?.name ?? null,
    additionalTaxAmount: profile.additionalTaxAmount.toString(),
    taxExemptionAmount: profile.taxExemptionAmount.toString(),
    taxCreditAmount: profile.taxCreditAmount.toString(),
    previousEmployerTaxableIncome:
      profile.previousEmployerTaxableIncome.toString(),
    previousEmployerTaxDeducted: profile.previousEmployerTaxDeducted.toString(),
  };
}

function auditSnapshot(profile: Profile) {
  return {
    ...mapProfile(profile),
    taxIdentificationNumber: profile.taxIdentificationNumber
      ? `***${profile.taxIdentificationNumber.slice(-4)}`
      : null,
  };
}

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException('Enter a valid date.');
  return date;
}

function parseOptionalDate(value?: string | null) {
  return value ? parseDate(value) : null;
}

function assertDateRange(start: Date, end: Date | null) {
  if (end && end < start) {
    throw new BadRequestException(
      'Effective end cannot be earlier than effective start.',
    );
  }
}

function assertOverrideReason(input: {
  additionalTaxAmount?: number;
  taxExemptionAmount?: number;
  taxCreditAmount?: number;
  overrideReason?: string | null;
}) {
  const hasOverride =
    Number(input.additionalTaxAmount ?? 0) > 0 ||
    Number(input.taxExemptionAmount ?? 0) > 0 ||
    Number(input.taxCreditAmount ?? 0) > 0;
  if (hasOverride && !input.overrideReason?.trim()) {
    throw new BadRequestException(
      'Override reason is required for additional tax, exemptions, or credits.',
    );
  }
}

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeCode(value?: string | null) {
  return normalize(value)?.toUpperCase() ?? null;
}

function decimal(value?: number) {
  return new Prisma.Decimal(value ?? 0);
}

function handleUnique(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'An employee tax profile already starts on this effective date.',
    );
  }
  throw error;
}
