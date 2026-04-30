import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessTripApprovalStatus,
  BusinessTripStatus,
  Prisma,
  TravelAllowanceCalculationBasis,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BusinessTripActionDto,
  BusinessTripQueryDto,
  CreateBusinessTripDto,
  RejectBusinessTripDto,
  UpdateBusinessTripDto,
} from './dto/business-trip.dto';
import {
  CreateTravelAllowancePolicyDto,
  CreateTravelAllowanceRuleDto,
  UpdateTravelAllowancePolicyDto,
  UpdateTravelAllowanceRuleDto,
} from './dto/travel-allowance-policy.dto';
import { TravelAllowanceResolverService } from './travel-allowance-resolver.service';

const tripInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      employeeLevelId: true,
    },
  },
  allowances: {
    include: { travelAllowanceRule: true },
    orderBy: [{ createdAt: 'asc' }],
  },
  approvals: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.BusinessTripInclude;

const policyInclude = {
  employeeLevel: { select: { id: true, code: true, name: true } },
  rules: { orderBy: [{ isActive: 'desc' }, { allowanceType: 'asc' }] },
} satisfies Prisma.TravelAllowancePolicyInclude;

type TripWithRelations = Prisma.BusinessTripGetPayload<{
  include: typeof tripInclude;
}>;

@Injectable()
export class BusinessTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly resolver: TravelAllowanceResolverService,
  ) {}

  async createTrip(
    user: AuthenticatedUser,
    dto: CreateBusinessTripDto,
    self = false,
  ) {
    const employeeId = self
      ? (await this.findEmployeeForUser(user.tenantId, user.userId)).id
      : (dto.employeeId ??
        (await this.findEmployeeForUser(user.tenantId, user.userId)).id);
    await this.assertEmployeeInTenant(user.tenantId, employeeId);
    const startDate = parseDate(dto.startDate);
    const endDate = parseDate(dto.endDate);
    assertDateRange(startDate, endDate);

    const created = await this.prisma.businessTrip.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        requestedByUserId: user.userId,
        title: dto.title.trim(),
        purpose: emptyToNull(dto.purpose),
        originCountry: emptyToNull(dto.originCountry),
        originCity: emptyToNull(dto.originCity),
        destinationCountry: dto.destinationCountry.trim(),
        destinationCity: dto.destinationCity.trim(),
        startDate,
        endDate,
        currencyCode: normalizeCurrency(dto.currencyCode),
      },
      include: tripInclude,
    });
    await this.audit(user, 'BUSINESS_TRIP_CREATED', 'BusinessTrip', created.id, null, created);
    return mapTrip(created);
  }

  async listTrips(user: AuthenticatedUser, query: BusinessTripQueryDto) {
    const trips = await this.prisma.businessTrip.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: tripInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return trips.map(mapTrip);
  }

  async listMyTrips(user: AuthenticatedUser) {
    const employee = await this.findEmployeeForUser(user.tenantId, user.userId);
    const trips = await this.prisma.businessTrip.findMany({
      where: { tenantId: user.tenantId, employeeId: employee.id },
      include: tripInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return trips.map(mapTrip);
  }

  async getTrip(user: AuthenticatedUser, id: string, self = false) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (self) await this.assertSelfTrip(user, trip.employeeId);
    return mapTrip(trip);
  }

  async updateTrip(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBusinessTripDto,
    self = false,
  ) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (self) await this.assertSelfTrip(user, trip.employeeId);
    this.assertDraftEditable(trip);
    const startDate = dto.startDate ? parseDate(dto.startDate) : trip.startDate;
    const endDate = dto.endDate ? parseDate(dto.endDate) : trip.endDate;
    assertDateRange(startDate, endDate);

    const updated = await this.prisma.businessTrip.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.purpose !== undefined ? { purpose: emptyToNull(dto.purpose) } : {}),
        ...(dto.originCountry !== undefined ? { originCountry: emptyToNull(dto.originCountry) } : {}),
        ...(dto.originCity !== undefined ? { originCity: emptyToNull(dto.originCity) } : {}),
        ...(dto.destinationCountry !== undefined ? { destinationCountry: dto.destinationCountry.trim() } : {}),
        ...(dto.destinationCity !== undefined ? { destinationCity: dto.destinationCity.trim() } : {}),
        ...(dto.startDate !== undefined ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.currencyCode !== undefined ? { currencyCode: normalizeCurrency(dto.currencyCode) } : {}),
      },
      include: tripInclude,
    });
    await this.audit(user, 'BUSINESS_TRIP_UPDATED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async submitTrip(user: AuthenticatedUser, id: string, self = false) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (self) await this.assertSelfTrip(user, trip.employeeId);
    if (trip.status !== BusinessTripStatus.DRAFT) {
      throw new ConflictException('Only draft trips can be submitted.');
    }
    const updated = await this.prisma.businessTrip.update({
      where: { id },
      data: { status: BusinessTripStatus.SUBMITTED, submittedAt: new Date() },
      include: tripInclude,
    });
    await this.audit(user, 'BUSINESS_TRIP_SUBMITTED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async approveTrip(
    user: AuthenticatedUser,
    id: string,
    dto: BusinessTripActionDto,
  ) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (trip.status !== BusinessTripStatus.SUBMITTED) {
      throw new ConflictException('Only submitted trips can be approved.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.businessTripApproval.create({
        data: {
          tenantId: user.tenantId,
          businessTripId: id,
          status: BusinessTripApprovalStatus.APPROVED,
          actorUserId: user.userId,
          comments: dto.comments?.trim(),
        },
      });
      return tx.businessTrip.update({
        where: { id },
        data: { status: BusinessTripStatus.APPROVED, approvedAt: new Date() },
        include: tripInclude,
      });
    });
    await this.calculateTripAllowance(user, id);
    await this.audit(user, 'BUSINESS_TRIP_APPROVED', 'BusinessTrip', id, trip, updated);
    return this.getTrip(user, id);
  }

  async rejectTrip(user: AuthenticatedUser, id: string, dto: RejectBusinessTripDto) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (trip.status !== BusinessTripStatus.SUBMITTED) {
      throw new ConflictException('Only submitted trips can be rejected.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.businessTripApproval.create({
        data: {
          tenantId: user.tenantId,
          businessTripId: id,
          status: BusinessTripApprovalStatus.REJECTED,
          actorUserId: user.userId,
          comments: dto.reason.trim(),
        },
      });
      return tx.businessTrip.update({
        where: { id },
        data: {
          status: BusinessTripStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason.trim(),
        },
        include: tripInclude,
      });
    });
    await this.audit(user, 'BUSINESS_TRIP_REJECTED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async cancelTrip(user: AuthenticatedUser, id: string, self = false) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (self) await this.assertSelfTrip(user, trip.employeeId);
    if (
      trip.status === BusinessTripStatus.INCLUDED_IN_PAYROLL ||
      trip.status === BusinessTripStatus.PAID
    ) {
      throw new ConflictException('Trips included in payroll cannot be cancelled.');
    }
    const updated = await this.prisma.businessTrip.update({
      where: { id },
      data: { status: BusinessTripStatus.CANCELLED },
      include: tripInclude,
    });
    await this.audit(user, 'BUSINESS_TRIP_CANCELLED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async completeTrip(user: AuthenticatedUser, id: string) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (trip.status !== BusinessTripStatus.APPROVED) {
      throw new ConflictException('Only approved trips can be completed.');
    }
    const updated = await this.prisma.businessTrip.update({
      where: { id },
      data: { status: BusinessTripStatus.COMPLETED },
      include: tripInclude,
    });
    await this.audit(user, 'BUSINESS_TRIP_COMPLETED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async calculateTripAllowance(user: AuthenticatedUser, id: string) {
    const trip = await this.findTripOrThrow(user.tenantId, id);
    if (trip.status !== BusinessTripStatus.APPROVED && trip.status !== BusinessTripStatus.COMPLETED) {
      throw new ConflictException('Only approved or completed trips can be calculated.');
    }
    if (trip.allowances.some((allowance) => allowance.payrollRunEmployeeId)) {
      throw new ConflictException('Trips included in payroll cannot be recalculated.');
    }
    const policy = await this.resolver.resolveAllowancePolicy({
      tenantId: user.tenantId,
      employeeId: trip.employeeId,
      employeeLevelId: trip.employee.employeeLevelId,
      destinationCountry: trip.destinationCountry,
      destinationCity: trip.destinationCity,
      effectiveDate: trip.startDate,
    });
    if (!policy) {
      throw new BadRequestException('No active travel allowance policy matched this trip.');
    }

    const tripDays = new Prisma.Decimal(countInclusiveDays(trip.startDate, trip.endDate));
    const data = policy.rules.map((rule) => {
      const quantity = quantityForBasis(rule.calculationBasis, tripDays);
      return {
        tenantId: user.tenantId,
        businessTripId: trip.id,
        travelAllowanceRuleId: rule.id,
        allowanceType: rule.allowanceType,
        calculationBasis: rule.calculationBasis,
        quantity,
        rate: rule.amount,
        amount: new Prisma.Decimal(rule.amount).mul(quantity),
        currencyCode: normalizeCurrency(rule.currencyCode || policy.currencyCode),
      };
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.businessTripAllowance.deleteMany({
        where: { tenantId: user.tenantId, businessTripId: id, payrollRunEmployeeId: null },
      });
      if (data.length) {
        await tx.businessTripAllowance.createMany({ data });
      }
      const total = data.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      return tx.businessTrip.update({
        where: { id },
        data: { estimatedAllowance: total, approvedAllowance: total },
        include: tripInclude,
      });
    });
    await this.audit(user, 'BUSINESS_TRIP_ALLOWANCE_CALCULATED', 'BusinessTrip', id, trip, updated);
    return mapTrip(updated);
  }

  async listPolicies(user: AuthenticatedUser) {
    return this.prisma.travelAllowancePolicy.findMany({
      where: { tenantId: user.tenantId },
      include: policyInclude,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async getPolicy(user: AuthenticatedUser, id: string) {
    const policy = await this.findPolicyOrThrow(user.tenantId, id);
    return mapPolicy(policy);
  }

  async createPolicy(user: AuthenticatedUser, dto: CreateTravelAllowancePolicyDto) {
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const created = await this.prisma.travelAllowancePolicy.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          employeeLevelId: dto.employeeLevelId ?? null,
          countryCode: normalizeOptionalLookup(dto.countryCode),
          city: normalizeOptionalCity(dto.city),
          currencyCode: normalizeCurrency(dto.currencyCode),
          isActive: dto.isActive ?? true,
          effectiveFrom,
          effectiveTo,
        },
        include: policyInclude,
      });
      await this.audit(user, 'TADA_POLICY_CREATED', 'TravelAllowancePolicy', created.id, null, created);
      return mapPolicy(created);
    } catch (error) {
      handleUnique(error, 'Travel allowance policy code already exists.');
    }
  }

  async updatePolicy(user: AuthenticatedUser, id: string, dto: UpdateTravelAllowancePolicyDto) {
    const existing = await this.findPolicyOrThrow(user.tenantId, id);
    await this.assertEmployeeLevel(user.tenantId, dto.employeeLevelId);
    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo !== undefined ? parseOptionalDate(dto.effectiveTo) : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    try {
      const updated = await this.prisma.travelAllowancePolicy.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
          ...(dto.employeeLevelId !== undefined ? { employeeLevelId: dto.employeeLevelId } : {}),
          ...(dto.countryCode !== undefined ? { countryCode: normalizeOptionalLookup(dto.countryCode) } : {}),
          ...(dto.city !== undefined ? { city: normalizeOptionalCity(dto.city) } : {}),
          ...(dto.currencyCode !== undefined ? { currencyCode: normalizeCurrency(dto.currencyCode) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        },
        include: policyInclude,
      });
      await this.audit(user, 'TADA_POLICY_UPDATED', 'TravelAllowancePolicy', id, existing, updated);
      return mapPolicy(updated);
    } catch (error) {
      handleUnique(error, 'Travel allowance policy code already exists.');
    }
  }

  async deactivatePolicy(user: AuthenticatedUser, id: string) {
    const existing = await this.findPolicyOrThrow(user.tenantId, id);
    const used = await this.prisma.businessTripAllowance.count({
      where: {
        tenantId: user.tenantId,
        travelAllowanceRule: { policyId: id },
        payrollRunEmployeeId: { not: null },
      },
    });
    if (used > 0 && existing.isActive) {
      throw new ConflictException(
        'Travel allowance policies used by payroll cannot be deactivated.',
      );
    }
    if (!existing.isActive) return mapPolicy(existing);
    const updated = await this.prisma.travelAllowancePolicy.update({
      where: { id },
      data: { isActive: false },
      include: policyInclude,
    });
    await this.audit(user, 'TADA_POLICY_DEACTIVATED', 'TravelAllowancePolicy', id, existing, updated);
    return mapPolicy(updated);
  }

  async createRule(user: AuthenticatedUser, policyId: string, dto: CreateTravelAllowanceRuleDto) {
    const policy = await this.findPolicyOrThrow(user.tenantId, policyId);
    const created = await this.prisma.travelAllowanceRule.create({
      data: {
        tenantId: user.tenantId,
        policyId: policy.id,
        allowanceType: dto.allowanceType,
        calculationBasis: dto.calculationBasis,
        amount: new Prisma.Decimal(dto.amount),
        currencyCode: normalizeCurrency(dto.currencyCode),
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit(user, 'TADA_POLICY_RULE_CREATED', 'TravelAllowanceRule', created.id, null, created);
    return this.getPolicy(user, policyId);
  }

  async updateRule(user: AuthenticatedUser, policyId: string, ruleId: string, dto: UpdateTravelAllowanceRuleDto) {
    await this.findPolicyOrThrow(user.tenantId, policyId);
    const existing = await this.findRuleOrThrow(user.tenantId, policyId, ruleId);
    const updated = await this.prisma.travelAllowanceRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.allowanceType !== undefined ? { allowanceType: dto.allowanceType } : {}),
        ...(dto.calculationBasis !== undefined ? { calculationBasis: dto.calculationBasis } : {}),
        ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(dto.currencyCode !== undefined ? { currencyCode: normalizeCurrency(dto.currencyCode) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit(user, 'TADA_POLICY_RULE_UPDATED', 'TravelAllowanceRule', ruleId, existing, updated);
    return this.getPolicy(user, policyId);
  }

  async deactivateRule(user: AuthenticatedUser, policyId: string, ruleId: string) {
    await this.findPolicyOrThrow(user.tenantId, policyId);
    const existing = await this.findRuleOrThrow(user.tenantId, policyId, ruleId);
    const updated = await this.prisma.travelAllowanceRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });
    await this.audit(user, 'TADA_POLICY_RULE_DEACTIVATED', 'TravelAllowanceRule', ruleId, existing, updated);
    return this.getPolicy(user, policyId);
  }

  private async findTripOrThrow(tenantId: string, id: string) {
    const trip = await this.prisma.businessTrip.findFirst({
      where: { tenantId, id },
      include: tripInclude,
    });
    if (!trip) throw new NotFoundException('Business trip was not found.');
    return trip;
  }

  private async findPolicyOrThrow(tenantId: string, id: string) {
    const policy = await this.prisma.travelAllowancePolicy.findFirst({
      where: { tenantId, id },
      include: policyInclude,
    });
    if (!policy) throw new NotFoundException('Travel allowance policy was not found.');
    return policy;
  }

  private async findRuleOrThrow(tenantId: string, policyId: string, id: string) {
    const rule = await this.prisma.travelAllowanceRule.findFirst({
      where: { tenantId, policyId, id },
    });
    if (!rule) throw new NotFoundException('Travel allowance rule was not found.');
    return rule;
  }

  private assertDraftEditable(trip: TripWithRelations) {
    if (trip.status !== BusinessTripStatus.DRAFT) {
      throw new ConflictException('Only draft business trips can be edited.');
    }
  }

  private async assertSelfTrip(user: AuthenticatedUser, employeeId: string) {
    const employee = await this.findEmployeeForUser(user.tenantId, user.userId);
    if (employee.id !== employeeId) {
      throw new ForbiddenException('You can only access your own business trips.');
    }
  }

  private async findEmployeeForUser(tenantId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('No employee profile is linked to this user.');
    return employee;
  }

  private async assertEmployeeInTenant(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Employee was not found for this tenant.');
  }

  private async assertEmployeeLevel(tenantId: string, employeeLevelId?: string | null) {
    if (!employeeLevelId) return;
    const level = await this.prisma.employeeLevel.findFirst({
      where: { tenantId, id: employeeLevelId, isActive: true },
      select: { id: true },
    });
    if (!level) throw new BadRequestException('Active employee level was not found for this tenant.');
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

function mapTrip(trip: TripWithRelations) {
  return {
    ...trip,
    estimatedAllowance: trip.estimatedAllowance.toString(),
    approvedAllowance: trip.approvedAllowance.toString(),
    allowances: trip.allowances.map((allowance) => ({
      ...allowance,
      quantity: allowance.quantity.toString(),
      rate: allowance.rate.toString(),
      amount: allowance.amount.toString(),
    })),
  };
}

function mapPolicy(
  policy: Prisma.TravelAllowancePolicyGetPayload<{ include: typeof policyInclude }>,
) {
  return {
    ...policy,
    rules: policy.rules.map((rule) => ({
      ...rule,
      amount: rule.amount.toString(),
    })),
  };
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertDateRange(startDate: Date, endDate: Date) {
  if (endDate < startDate) {
    throw new BadRequestException('endDate must be greater than or equal to startDate.');
  }
}

function assertEffectiveDates(effectiveFrom: Date, effectiveTo: Date | null) {
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom.');
  }
}

function countInclusiveDays(startDate: Date, endDate: Date) {
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.floor((end - start) / 86_400_000) + 1;
}

function quantityForBasis(
  basis: TravelAllowanceCalculationBasis,
  tripDays: Prisma.Decimal,
) {
  if (basis === TravelAllowanceCalculationBasis.PER_TRIP) return new Prisma.Decimal(1);
  if (basis === TravelAllowanceCalculationBasis.PER_NIGHT) {
    const nights = tripDays.minus(1);
    return nights.gt(1) ? nights : new Prisma.Decimal(1);
  }
  return tripDays;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalLookup(value?: string | null) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function normalizeOptionalCity(value?: string | null) {
  const trimmed = value?.trim();
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
