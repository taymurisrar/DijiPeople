import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BenefitRenewalPeriod,
  BenefitValueType,
  EmployeeBenefitAssignmentSource,
  EmployeeBenefitStatus,
  EmployeeEmploymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const policyInclude = {
  organization: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, country: true } },
  employeeLevel: { select: { id: true, name: true, code: true } },
} satisfies Prisma.BenefitPolicyInclude;

export type BenefitPolicyWithScope = Prisma.BenefitPolicyGetPayload<{
  include: typeof policyInclude;
}>;

export type BenefitEmployeeContext = {
  id: string;
  employmentStatus: EmployeeEmploymentStatus;
  employeeType: string | null;
  contractType: string | null;
  workMode: string | null;
  hireDate: Date;
  confirmationDate: Date | null;
  probationEndDate: Date | null;
  departmentId: string | null;
  businessUnitId: string | null;
  employeeLevelId: string | null;
  locationId: string | null;
  managerEmployeeId: string | null;
  country: string | null;
  businessUnit: { organizationId: string } | null;
  location: { country: string } | null;
  countryLookup: { code: string } | null;
  manager: { id: string; userId: string | null } | null;
};

@Injectable()
export class BenefitEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async employeeContext(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId, isDeleted: false },
      select: {
        id: true,
        employmentStatus: true,
        employeeType: true,
        contractType: true,
        workMode: true,
        hireDate: true,
        confirmationDate: true,
        probationEndDate: true,
        departmentId: true,
        businessUnitId: true,
        employeeLevelId: true,
        locationId: true,
        managerEmployeeId: true,
        country: true,
        businessUnit: { select: { organizationId: true } },
        location: { select: { country: true } },
        countryLookup: { select: { code: true } },
        manager: { select: { id: true, userId: true } },
      },
    });
    if (!employee) throw new BadRequestException('Employee was not found.');
    return employee;
  }

  async resolveEligiblePolicies(input: {
    tenantId: string;
    employeeId: string;
    effectiveDate: Date;
    source?: EmployeeBenefitAssignmentSource;
  }) {
    const [employee, policies] = await Promise.all([
      this.employeeContext(input.tenantId, input.employeeId),
      this.prisma.benefitPolicy.findMany({
        where: {
          tenantId: input.tenantId,
          status: 'ACTIVE',
          effectiveFrom: { lte: input.effectiveDate },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.effectiveDate } },
          ],
        },
        include: policyInclude,
        orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
      }),
    ]);
    return policies.filter(
      (policy) =>
        this.matchesPolicy(policy, employee, input.effectiveDate) &&
        matchesAssignmentSource(policy, input.source),
    );
  }

  matchesPolicy(
    policy: BenefitPolicyWithScope,
    employee: BenefitEmployeeContext,
    effectiveDate: Date,
  ) {
    const organizationId = employee.businessUnit?.organizationId ?? null;
    const countryCode = (
      employee.location?.country ??
      employee.countryLookup?.code ??
      employee.country
    )?.toUpperCase();
    if (policy.organizationId && policy.organizationId !== organizationId)
      return false;
    if (policy.countryCode && policy.countryCode !== countryCode) return false;
    if (
      policy.businessUnitId &&
      policy.businessUnitId !== employee.businessUnitId
    )
      return false;
    if (policy.departmentId && policy.departmentId !== employee.departmentId)
      return false;
    if (policy.locationId && policy.locationId !== employee.locationId)
      return false;
    if (
      policy.employeeLevelId &&
      policy.employeeLevelId !== employee.employeeLevelId
    )
      return false;
    if (policy.employeeType && policy.employeeType !== employee.employeeType)
      return false;
    if (
      policy.requiresProbationCompletion &&
      !hasCompletedProbation(employee, effectiveDate)
    )
      return false;
    return matchesJsonRules(policy.eligibilityRules, employee, effectiveDate);
  }

  calculateAmount(input: {
    policy: Pick<
      BenefitPolicyWithScope,
      'valueType' | 'fixedAmount' | 'percentage'
    >;
    fixedAmountOverride?: Prisma.Decimal | null;
    percentageOverride?: Prisma.Decimal | null;
    baseCompensation: Prisma.Decimal;
  }) {
    if (
      input.fixedAmountOverride !== undefined &&
      input.fixedAmountOverride !== null
    )
      return input.fixedAmountOverride;
    if (
      input.percentageOverride !== undefined &&
      input.percentageOverride !== null
    )
      return input.baseCompensation.mul(input.percentageOverride).div(100);
    if (input.policy.valueType === BenefitValueType.FIXED_AMOUNT)
      return input.policy.fixedAmount ?? new Prisma.Decimal(0);
    return input.baseCompensation
      .mul(input.policy.percentage ?? new Prisma.Decimal(0))
      .div(100);
  }
}

export function effectiveBenefitStatus(
  assignment: {
    status: EmployeeBenefitStatus;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    expiryDate: Date | null;
  },
  date: Date,
) {
  if (assignment.status !== EmployeeBenefitStatus.ACTIVE)
    return assignment.status;
  if (
    assignment.effectiveFrom > date ||
    (assignment.effectiveTo && assignment.effectiveTo < date) ||
    (assignment.expiryDate && assignment.expiryDate < date)
  )
    return EmployeeBenefitStatus.EXPIRED;
  return EmployeeBenefitStatus.ACTIVE;
}

export function calculateRenewalDate(
  effectiveFrom: Date,
  period: BenefitRenewalPeriod,
  customMonths?: number | null,
) {
  const months =
    period === BenefitRenewalPeriod.MONTHLY
      ? 1
      : period === BenefitRenewalPeriod.QUARTERLY
        ? 3
        : period === BenefitRenewalPeriod.ANNUAL
          ? 12
          : period === BenefitRenewalPeriod.CUSTOM
            ? customMonths
            : null;
  return months ? addMonths(effectiveFrom, months) : null;
}

export function calculateExpiryDate(
  effectiveFrom: Date,
  expiresAfterMonths?: number | null,
) {
  return expiresAfterMonths
    ? addMonths(effectiveFrom, expiresAfterMonths)
    : null;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function hasCompletedProbation(employee: BenefitEmployeeContext, date: Date) {
  if (employee.probationEndDate) return employee.probationEndDate <= date;
  return employee.employmentStatus !== EmployeeEmploymentStatus.PROBATION;
}

function matchesAssignmentSource(
  policy: BenefitPolicyWithScope,
  source?: EmployeeBenefitAssignmentSource,
) {
  if (source === EmployeeBenefitAssignmentSource.HIRING)
    return policy.autoAssignOnHire;
  if (source === EmployeeBenefitAssignmentSource.PROMOTION)
    return policy.autoAssignOnPromotion;
  return true;
}

function matchesJsonRules(
  value: Prisma.JsonValue | null,
  employee: BenefitEmployeeContext,
  date: Date,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const rules = value as Record<string, unknown>;
  if (
    Array.isArray(rules.employmentStatuses) &&
    !rules.employmentStatuses.includes(employee.employmentStatus)
  )
    return false;
  if (
    Array.isArray(rules.contractTypes) &&
    !rules.contractTypes.includes(employee.contractType)
  )
    return false;
  if (
    Array.isArray(rules.workModes) &&
    !rules.workModes.includes(employee.workMode)
  )
    return false;
  if (typeof rules.minimumServiceMonths === 'number') {
    const serviceDate = new Date(employee.hireDate);
    serviceDate.setUTCMonth(
      serviceDate.getUTCMonth() + rules.minimumServiceMonths,
    );
    if (serviceDate > date) return false;
  }
  return true;
}
