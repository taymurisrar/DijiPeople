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
import {
  CreateOvertimePolicyDto,
  CreateTimePayrollPolicyDto,
  UpdateOvertimePolicyDto,
  UpdateTimePayrollPolicyDto,
} from './dto/time-payroll-policy.dto';

const timePolicyInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
} satisfies Prisma.TimePayrollPolicyInclude;

const overtimePolicyInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
} satisfies Prisma.OvertimePolicyInclude;

@Injectable()
export class TimePayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listTimePolicies(user: AuthenticatedUser) {
    return this.prisma.timePayrollPolicy.findMany({
      where: { tenantId: user.tenantId },
      include: timePolicyInclude,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async getTimePolicy(user: AuthenticatedUser, id: string) {
    return this.findTimePolicyOrThrow(user.tenantId, id);
  }

  async createTimePolicy(user: AuthenticatedUser, dto: CreateTimePayrollPolicyDto) {
    await this.assertReferences(user.tenantId, dto.employeeLevelId, dto.businessUnitId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const created = await this.prisma.timePayrollPolicy.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          employeeLevelId: dto.employeeLevelId ?? null,
          businessUnitId: dto.businessUnitId ?? null,
          countryCode: normalizeOptionalCountry(dto.countryCode),
          mode: dto.mode,
          useAttendanceForPayroll: dto.useAttendanceForPayroll ?? true,
          useTimesheetForPayroll: dto.useTimesheetForPayroll ?? false,
          requireAttendanceApproval: dto.requireAttendanceApproval ?? false,
          requireTimesheetApproval: dto.requireTimesheetApproval ?? true,
          detectNoShow: dto.detectNoShow ?? true,
          deductNoShow: dto.deductNoShow ?? true,
          overtimeEnabled: dto.overtimeEnabled ?? false,
          standardHoursPerDay: new Prisma.Decimal(dto.standardHoursPerDay),
          standardWorkingDaysPerMonth:
            dto.standardWorkingDaysPerMonth === undefined || dto.standardWorkingDaysPerMonth === null
              ? null
              : new Prisma.Decimal(dto.standardWorkingDaysPerMonth),
          prorationBasis: dto.prorationBasis,
          isActive: dto.isActive ?? true,
          effectiveFrom,
          effectiveTo,
        },
        include: timePolicyInclude,
      });
      await this.audit(user, 'TIME_PAYROLL_POLICY_CREATED', 'TimePayrollPolicy', created.id, null, created);
      return mapTimePolicy(created);
    } catch (error) {
      handleUnique(error, 'Time payroll policy code already exists.');
    }
  }

  async updateTimePolicy(user: AuthenticatedUser, id: string, dto: UpdateTimePayrollPolicyDto) {
    const existing = await this.findTimePolicyOrThrow(user.tenantId, id);
    await this.assertReferences(user.tenantId, dto.employeeLevelId, dto.businessUnitId);
    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo !== undefined ? parseOptionalDate(dto.effectiveTo) : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const updated = await this.prisma.timePayrollPolicy.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
          ...(dto.employeeLevelId !== undefined ? { employeeLevelId: dto.employeeLevelId } : {}),
          ...(dto.businessUnitId !== undefined ? { businessUnitId: dto.businessUnitId } : {}),
          ...(dto.countryCode !== undefined ? { countryCode: normalizeOptionalCountry(dto.countryCode) } : {}),
          ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
          ...(dto.useAttendanceForPayroll !== undefined ? { useAttendanceForPayroll: dto.useAttendanceForPayroll } : {}),
          ...(dto.useTimesheetForPayroll !== undefined ? { useTimesheetForPayroll: dto.useTimesheetForPayroll } : {}),
          ...(dto.requireAttendanceApproval !== undefined ? { requireAttendanceApproval: dto.requireAttendanceApproval } : {}),
          ...(dto.requireTimesheetApproval !== undefined ? { requireTimesheetApproval: dto.requireTimesheetApproval } : {}),
          ...(dto.detectNoShow !== undefined ? { detectNoShow: dto.detectNoShow } : {}),
          ...(dto.deductNoShow !== undefined ? { deductNoShow: dto.deductNoShow } : {}),
          ...(dto.overtimeEnabled !== undefined ? { overtimeEnabled: dto.overtimeEnabled } : {}),
          ...(dto.standardHoursPerDay !== undefined ? { standardHoursPerDay: new Prisma.Decimal(dto.standardHoursPerDay) } : {}),
          ...(dto.standardWorkingDaysPerMonth !== undefined
            ? {
                standardWorkingDaysPerMonth:
                  dto.standardWorkingDaysPerMonth === null
                    ? null
                    : new Prisma.Decimal(dto.standardWorkingDaysPerMonth),
              }
            : {}),
          ...(dto.prorationBasis !== undefined ? { prorationBasis: dto.prorationBasis } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        },
        include: timePolicyInclude,
      });
      await this.audit(user, 'TIME_PAYROLL_POLICY_UPDATED', 'TimePayrollPolicy', id, existing, updated);
      return mapTimePolicy(updated);
    } catch (error) {
      handleUnique(error, 'Time payroll policy code already exists.');
    }
  }

  async deactivateTimePolicy(user: AuthenticatedUser, id: string) {
    const existing = await this.findTimePolicyOrThrow(user.tenantId, id);
    const updated = await this.prisma.timePayrollPolicy.update({
      where: { id },
      data: { isActive: false },
      include: timePolicyInclude,
    });
    await this.audit(user, 'TIME_PAYROLL_POLICY_DEACTIVATED', 'TimePayrollPolicy', id, existing, updated);
    return mapTimePolicy(updated);
  }

  listOvertimePolicies(user: AuthenticatedUser) {
    return this.prisma.overtimePolicy.findMany({
      where: { tenantId: user.tenantId },
      include: overtimePolicyInclude,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async getOvertimePolicy(user: AuthenticatedUser, id: string) {
    return this.findOvertimePolicyOrThrow(user.tenantId, id);
  }

  async createOvertimePolicy(user: AuthenticatedUser, dto: CreateOvertimePolicyDto) {
    await this.assertReferences(user.tenantId, dto.employeeLevelId, dto.businessUnitId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const created = await this.prisma.overtimePolicy.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          employeeLevelId: dto.employeeLevelId ?? null,
          businessUnitId: dto.businessUnitId ?? null,
          calculationPeriod: dto.calculationPeriod,
          thresholdHours: new Prisma.Decimal(dto.thresholdHours),
          rateMultiplier: new Prisma.Decimal(dto.rateMultiplier),
          requiresApproval: dto.requiresApproval ?? true,
          isActive: dto.isActive ?? true,
          effectiveFrom,
          effectiveTo,
        },
        include: overtimePolicyInclude,
      });
      await this.audit(user, 'OVERTIME_POLICY_CREATED', 'OvertimePolicy', created.id, null, created);
      return mapOvertimePolicy(created);
    } catch (error) {
      handleUnique(error, 'Overtime policy code already exists.');
    }
  }

  async updateOvertimePolicy(user: AuthenticatedUser, id: string, dto: UpdateOvertimePolicyDto) {
    const existing = await this.findOvertimePolicyOrThrow(user.tenantId, id);
    await this.assertReferences(user.tenantId, dto.employeeLevelId, dto.businessUnitId);
    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo !== undefined ? parseOptionalDate(dto.effectiveTo) : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const updated = await this.prisma.overtimePolicy.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
          ...(dto.employeeLevelId !== undefined ? { employeeLevelId: dto.employeeLevelId } : {}),
          ...(dto.businessUnitId !== undefined ? { businessUnitId: dto.businessUnitId } : {}),
          ...(dto.calculationPeriod !== undefined ? { calculationPeriod: dto.calculationPeriod } : {}),
          ...(dto.thresholdHours !== undefined ? { thresholdHours: new Prisma.Decimal(dto.thresholdHours) } : {}),
          ...(dto.rateMultiplier !== undefined ? { rateMultiplier: new Prisma.Decimal(dto.rateMultiplier) } : {}),
          ...(dto.requiresApproval !== undefined ? { requiresApproval: dto.requiresApproval } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        },
        include: overtimePolicyInclude,
      });
      await this.audit(user, 'OVERTIME_POLICY_UPDATED', 'OvertimePolicy', id, existing, updated);
      return mapOvertimePolicy(updated);
    } catch (error) {
      handleUnique(error, 'Overtime policy code already exists.');
    }
  }

  async deactivateOvertimePolicy(user: AuthenticatedUser, id: string) {
    const existing = await this.findOvertimePolicyOrThrow(user.tenantId, id);
    const updated = await this.prisma.overtimePolicy.update({
      where: { id },
      data: { isActive: false },
      include: overtimePolicyInclude,
    });
    await this.audit(user, 'OVERTIME_POLICY_DEACTIVATED', 'OvertimePolicy', id, existing, updated);
    return mapOvertimePolicy(updated);
  }

  private async findTimePolicyOrThrow(tenantId: string, id: string) {
    const policy = await this.prisma.timePayrollPolicy.findFirst({
      where: { tenantId, id },
      include: timePolicyInclude,
    });
    if (!policy) throw new NotFoundException('Time payroll policy was not found.');
    return policy;
  }

  private async findOvertimePolicyOrThrow(tenantId: string, id: string) {
    const policy = await this.prisma.overtimePolicy.findFirst({
      where: { tenantId, id },
      include: overtimePolicyInclude,
    });
    if (!policy) throw new NotFoundException('Overtime policy was not found.');
    return policy;
  }

  private async assertReferences(
    tenantId: string,
    employeeLevelId?: string | null,
    businessUnitId?: string | null,
  ) {
    if (employeeLevelId) {
      const level = await this.prisma.employeeLevel.findFirst({
        where: { tenantId, id: employeeLevelId, isActive: true },
        select: { id: true },
      });
      if (!level) throw new BadRequestException('Active employee level was not found for this tenant.');
    }
    if (businessUnitId) {
      const businessUnit = await this.prisma.businessUnit.findFirst({
        where: { tenantId, id: businessUnitId },
        select: { id: true },
      });
      if (!businessUnit) throw new BadRequestException('Business unit was not found for this tenant.');
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

function mapTimePolicy(
  policy: Prisma.TimePayrollPolicyGetPayload<{ include: typeof timePolicyInclude }>,
) {
  return {
    ...policy,
    standardHoursPerDay: policy.standardHoursPerDay.toString(),
    standardWorkingDaysPerMonth: policy.standardWorkingDaysPerMonth?.toString() ?? null,
  };
}

function mapOvertimePolicy(
  policy: Prisma.OvertimePolicyGetPayload<{ include: typeof overtimePolicyInclude }>,
) {
  return {
    ...policy,
    thresholdHours: policy.thresholdHours.toString(),
    rateMultiplier: policy.rateMultiplier.toString(),
  };
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertEffectiveDates(effectiveFrom: Date, effectiveTo: Date | null) {
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom.');
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeOptionalCountry(value?: string | null) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
