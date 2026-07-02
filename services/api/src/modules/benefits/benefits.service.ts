import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalModuleKey,
  ApprovalRequestStatus,
  BenefitPolicyStatus,
  BenefitRenewalPeriod,
  BenefitValueType,
  EmployeeBenefitAssignmentSource,
  EmployeeBenefitStatus,
  PayrollRunLineItemCategory,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalMatrixResolverService } from '../approvals/approval-matrix-resolver.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import {
  BenefitEligibilityService,
  calculateExpiryDate,
  calculateRenewalDate,
  effectiveBenefitStatus,
} from './benefit-eligibility.service';
import {
  AssignBenefitDto,
  BenefitAssignmentQueryDto,
  ChangeBenefitAssignmentDto,
  ConsumeBenefitDto,
  CreateBenefitPolicyDto,
  UpdateBenefitPolicyDto,
} from './dto/benefit.dto';

const assignmentInclude = {
  benefitPolicy: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      userId: true,
    },
  },
  consumptions: { orderBy: { consumedAt: 'desc' as const }, take: 50 },
  approvalRequest: { select: { id: true, status: true, currentStepId: true } },
} satisfies Prisma.EmployeeBenefitAssignmentInclude;

type AssignmentWithRelations = Prisma.EmployeeBenefitAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

@Injectable()
export class BenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: BenefitEligibilityService,
    private readonly auditService: AuditService,
    private readonly approvalResolver: ApprovalMatrixResolverService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  async listPolicies(user: AuthenticatedUser) {
    const policies = await this.prisma.benefitPolicy.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
    });
    return policies.map((policy) => mapPolicy(policy, user));
  }

  async getPolicy(tenantId: string, id: string) {
    const policy = await this.prisma.benefitPolicy.findFirst({
      where: { tenantId, id },
    });
    if (!policy) throw new NotFoundException('Benefit policy was not found.');
    return policy;
  }

  async createPolicy(user: AuthenticatedUser, dto: CreateBenefitPolicyDto) {
    const data = await this.policyData(user.tenantId, dto);
    try {
      const policy = await this.prisma.benefitPolicy.create({
        data: {
          tenantId: user.tenantId,
          ...data,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      await this.audit(
        user,
        'BENEFIT_POLICY_CREATED',
        'BenefitPolicy',
        policy.id,
        null,
        policy,
      );
      return policy;
    } catch (error) {
      handleUnique(error, 'Benefit policy code already exists.');
    }
  }

  async updatePolicy(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBenefitPolicyDto,
  ) {
    const existing = await this.getPolicy(user.tenantId, id);
    const merged = {
      ...policyToDto(existing),
      ...definedValues(dto as object),
    } as CreateBenefitPolicyDto;
    const data = await this.policyData(user.tenantId, merged);
    try {
      const updated = await this.prisma.benefitPolicy.update({
        where: { id },
        data: { ...data, updatedById: user.userId },
      });
      await this.audit(
        user,
        'BENEFIT_POLICY_UPDATED',
        'BenefitPolicy',
        id,
        existing,
        updated,
      );
      return updated;
    } catch (error) {
      handleUnique(error, 'Benefit policy code already exists.');
    }
  }

  async listAssignments(
    user: AuthenticatedUser,
    query: BenefitAssignmentQueryDto,
    own = false,
  ) {
    const employeeId = own
      ? await this.employeeIdForUser(user)
      : query.employeeId;
    const effectiveDate = query.effectiveDate
      ? new Date(query.effectiveDate)
      : null;
    const assignments = await this.prisma.employeeBenefitAssignment.findMany({
      where: {
        tenantId: user.tenantId,
        ...(employeeId ? { employeeId } : {}),
        ...(query.benefitPolicyId
          ? { benefitPolicyId: query.benefitPolicyId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(effectiveDate
          ? {
              effectiveFrom: { lte: effectiveDate },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: effectiveDate } },
              ],
            }
          : {}),
        ...(own ? { benefitPolicy: { employeeVisible: true } } : {}),
      },
      include: assignmentInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return assignments.map((assignment) =>
      mapAssignment(assignment, user, own),
    );
  }

  async getAssignment(user: AuthenticatedUser, id: string) {
    const assignment = await this.prisma.employeeBenefitAssignment.findFirst({
      where: { id, tenantId: user.tenantId },
      include: assignmentInclude,
    });
    if (!assignment)
      throw new NotFoundException('Employee benefit assignment was not found.');
    return mapAssignment(assignment, user, false);
  }

  async assign(user: AuthenticatedUser, dto: AssignBenefitDto) {
    const [employee, policy] = await Promise.all([
      this.eligibility.employeeContext(user.tenantId, dto.employeeId),
      this.getPolicy(user.tenantId, dto.benefitPolicyId),
    ]);
    const effectiveFrom = new Date(dto.effectiveFrom);
    if (policy.status !== BenefitPolicyStatus.ACTIVE)
      throw new BadRequestException(
        'Only active benefit policies can be assigned.',
      );
    if (
      !this.eligibility.matchesPolicy(policy as never, employee, effectiveFrom)
    )
      throw new BadRequestException(
        'Employee is not eligible for this benefit policy.',
      );
    validateOverrides(policy.valueType, dto);
    const id = randomUUID();
    const requiresApproval = policy.requiresAssignmentApproval;
    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeBenefitAssignment.create({
        data: {
          id,
          tenantId: user.tenantId,
          employeeId: employee.id,
          benefitPolicyId: policy.id,
          status: requiresApproval
            ? EmployeeBenefitStatus.PENDING_APPROVAL
            : EmployeeBenefitStatus.ACTIVE,
          assignmentSource:
            dto.assignmentSource ?? EmployeeBenefitAssignmentSource.MANUAL,
          isManualOverride: dto.isManualOverride ?? true,
          fixedAmountOverride: decimalOrNull(dto.fixedAmountOverride),
          percentageOverride: decimalOrNull(dto.percentageOverride),
          currencyCodeOverride: normalizeOptionalCode(dto.currencyCodeOverride),
          effectiveFrom,
          effectiveTo: dateOrNull(dto.effectiveTo),
          renewalDate: calculateRenewalDate(
            effectiveFrom,
            policy.renewalPeriod,
            policy.renewalIntervalMonths,
          ),
          expiryDate: calculateExpiryDate(
            effectiveFrom,
            policy.expiresAfterMonths,
          ),
          allocatedBalance:
            decimalOrNull(dto.allocatedBalance) ?? policy.defaultBalance,
          notes: clean(dto.notes),
          createdById: user.userId,
          updatedById: user.userId,
        },
        include: assignmentInclude,
      });
      if (!requiresApproval) return created;
      return this.startApproval(user, created, 'ASSIGN', {}, employee, tx);
    });
    await this.audit(
      user,
      'EMPLOYEE_BENEFIT_ASSIGNED',
      'EmployeeBenefitAssignment',
      id,
      null,
      assignment,
    );
    return mapAssignment(assignment, user, false);
  }

  async assignDefaults(
    user: AuthenticatedUser,
    employeeId: string,
    source: EmployeeBenefitAssignmentSource,
    effectiveDate: Date,
  ) {
    const policies = await this.eligibility.resolveEligiblePolicies({
      tenantId: user.tenantId,
      employeeId,
      effectiveDate,
      source,
    });
    const created: unknown[] = [];
    for (const policy of policies) {
      const existing = await this.prisma.employeeBenefitAssignment.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId,
          benefitPolicyId: policy.id,
          status: { notIn: ['EXPIRED', 'CANCELLED'] },
        },
        select: { id: true },
      });
      if (existing) continue;
      created.push(
        await this.assign(user, {
          employeeId,
          benefitPolicyId: policy.id,
          assignmentSource: source,
          isManualOverride: false,
          effectiveFrom: effectiveDate.toISOString(),
        }),
      );
    }
    return { assignedCount: created.length, items: created };
  }

  suspend(
    user: AuthenticatedUser,
    id: string,
    dto: ChangeBenefitAssignmentDto,
  ) {
    return this.requestChange(user, id, 'SUSPEND', dto);
  }

  cancel(user: AuthenticatedUser, id: string, dto: ChangeBenefitAssignmentDto) {
    return this.requestChange(user, id, 'CANCEL', dto);
  }

  override(
    user: AuthenticatedUser,
    id: string,
    dto: ChangeBenefitAssignmentDto,
  ) {
    return this.requestChange(user, id, 'OVERRIDE', dto);
  }

  async actionApproval(
    user: AuthenticatedUser,
    id: string,
    action: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    const assignment = await this.assignment(user.tenantId, id);
    if (!assignment.approvalRequestId || !assignment.pendingAction)
      throw new ConflictException(
        'Benefit assignment has no pending approval.',
      );
    const pendingAction = assignment.pendingAction;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await this.approvalsService.action(
        {
          user,
          approvalRequestId: assignment.approvalRequestId!,
          action,
          comment,
        },
        tx,
      );
      if (result.status === ApprovalRequestStatus.PENDING) return assignment;
      const rejected = result.status === ApprovalRequestStatus.REJECTED;
      return tx.employeeBenefitAssignment.update({
        where: { id },
        data: rejected
          ? {
              status:
                pendingAction === 'ASSIGN'
                  ? EmployeeBenefitStatus.CANCELLED
                  : assignment.status,
              pendingAction: null,
              pendingPayload: Prisma.DbNull,
              updatedById: user.userId,
            }
          : {
              ...applyChange(pendingAction, assignment.pendingPayload),
              pendingAction: null,
              pendingPayload: Prisma.DbNull,
              updatedById: user.userId,
            },
        include: assignmentInclude,
      });
    });
    await this.audit(
      user,
      `EMPLOYEE_BENEFIT_APPROVAL_${action}`,
      'EmployeeBenefitAssignment',
      id,
      assignment,
      updated,
    );
    return mapAssignment(updated, user, false);
  }

  async consume(user: AuthenticatedUser, id: string, dto: ConsumeBenefitDto) {
    const assignment = await this.assignment(user.tenantId, id);
    if (
      effectiveBenefitStatus(assignment, new Date()) !==
      EmployeeBenefitStatus.ACTIVE
    )
      throw new ConflictException('Only an active benefit can be consumed.');
    const amount = new Prisma.Decimal(dto.amount);
    const next = assignment.consumedBalance.plus(amount);
    if (assignment.allocatedBalance && next.gt(assignment.allocatedBalance))
      throw new ConflictException(
        'Benefit consumption exceeds the allocated balance.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.benefitConsumption.create({
        data: {
          tenantId: user.tenantId,
          employeeBenefitAssignmentId: id,
          amount,
          consumedAt: dto.consumedAt ? new Date(dto.consumedAt) : new Date(),
          sourceType: clean(dto.sourceType),
          sourceId: clean(dto.sourceId),
          notes: clean(dto.notes),
          createdById: user.userId,
        },
      });
      return tx.employeeBenefitAssignment.update({
        where: { id },
        data: { consumedBalance: next, updatedById: user.userId },
        include: assignmentInclude,
      });
    });
    await this.audit(
      user,
      'EMPLOYEE_BENEFIT_CONSUMED',
      'EmployeeBenefitAssignment',
      id,
      assignment,
      updated,
    );
    return mapAssignment(updated, user, false);
  }

  async renewDueAssignments(user: AuthenticatedUser, effectiveDate: Date) {
    const expiring = await this.prisma.employeeBenefitAssignment.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
        OR: [
          { expiryDate: { lt: effectiveDate } },
          { effectiveTo: { lt: effectiveDate } },
        ],
      },
    });
    for (const assignment of expiring) {
      const updated = await this.prisma.employeeBenefitAssignment.update({
        where: { id: assignment.id },
        data: {
          status: EmployeeBenefitStatus.EXPIRED,
          updatedById: user.userId,
        },
      });
      await this.audit(
        user,
        'EMPLOYEE_BENEFIT_EXPIRED',
        'EmployeeBenefitAssignment',
        assignment.id,
        assignment,
        updated,
      );
    }
    const due = await this.prisma.employeeBenefitAssignment.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
        renewalDate: { lte: effectiveDate },
      },
      include: { benefitPolicy: true },
    });
    for (const assignment of due) {
      await this.prisma.employeeBenefitAssignment.update({
        where: { id: assignment.id },
        data: {
          consumedBalance: 0,
          allocatedBalance: assignment.benefitPolicy.defaultBalance,
          renewalDate: nextRenewalAfter(
            assignment.renewalDate ?? effectiveDate,
            assignment.benefitPolicy.renewalPeriod,
            assignment.benefitPolicy.renewalIntervalMonths,
            effectiveDate,
          ),
          updatedById: user.userId,
        },
      });
      await this.audit(
        user,
        'EMPLOYEE_BENEFIT_RENEWED',
        'EmployeeBenefitAssignment',
        assignment.id,
        assignment,
        { consumedBalance: 0 },
      );
    }
    return { renewedCount: due.length, expiredCount: expiring.length };
  }

  async resolvePayrollBenefits(input: {
    tenantId: string;
    employeeId: string;
    effectiveDate: Date;
    baseCompensation: Prisma.Decimal;
    currencyCode: string;
  }) {
    const eligiblePolicies =
      await this.eligibility.resolveEligiblePolicies(input);
    const eligibleIds = new Set(eligiblePolicies.map((policy) => policy.id));
    const assignments = await this.prisma.employeeBenefitAssignment.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: 'ACTIVE',
        effectiveFrom: { lte: input.effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: input.effectiveDate } },
        ],
        AND: [
          {
            OR: [
              { expiryDate: null },
              { expiryDate: { gte: input.effectiveDate } },
            ],
          },
        ],
      },
      include: { benefitPolicy: true },
    });
    const active = assignments.filter((item) =>
      eligibleIds.has(item.benefitPolicyId),
    );
    const blockers: Array<{ code: string; message: string; policyId: string }> =
      [];
    for (const policy of eligiblePolicies.filter(
      (item) => item.requiredForPayroll,
    )) {
      if (!active.some((item) => item.benefitPolicyId === policy.id))
        blockers.push({
          code: 'REQUIRED_BENEFIT_ASSIGNMENT_MISSING',
          message: `Required benefit ${policy.name} is not assigned.`,
          policyId: policy.id,
        });
    }
    const snapshots: BenefitPayrollSnapshot[] = [];
    const lineItems: BenefitPayrollLineItem[] = [];
    for (const assignment of active) {
      const policy = assignment.benefitPolicy;
      if (!policy.payrollVisible) continue;
      const currencyCode =
        assignment.currencyCodeOverride ??
        policy.currencyCode ??
        input.currencyCode;
      if (!policy.payrollCategory || currencyCode !== input.currencyCode) {
        blockers.push({
          code: 'INVALID_BENEFIT_PAYROLL_CONFIGURATION',
          message: `Benefit ${policy.name} has an invalid payroll category or currency.`,
          policyId: policy.id,
        });
        continue;
      }
      const amount = this.eligibility
        .calculateAmount({
          policy,
          fixedAmountOverride: assignment.fixedAmountOverride,
          percentageOverride: assignment.percentageOverride,
          baseCompensation: input.baseCompensation,
        })
        .toDecimalPlaces(2);
      const snapshot: BenefitPayrollSnapshot = {
        assignmentId: assignment.id,
        policyId: policy.id,
        policyCode: policy.code,
        policyName: policy.name,
        benefitType: policy.benefitType,
        valueType: policy.valueType,
        amount: amount.toString(),
        currencyCode,
        payrollCategory: policy.payrollCategory,
        taxable: policy.taxable,
        payslipVisible: policy.payslipVisible,
        affectsGrossPay: policy.affectsGrossPay,
        affectsNetPay: policy.affectsNetPay,
        effectiveDate: input.effectiveDate.toISOString(),
        allocatedBalance: assignment.allocatedBalance?.toString() ?? null,
        consumedBalance: assignment.consumedBalance.toString(),
      };
      snapshots.push(snapshot);
      lineItems.push({
        payComponentId: null,
        category: policy.payrollCategory,
        sourceType: 'BENEFIT',
        sourceId: assignment.id,
        label: policy.name,
        quantity: null,
        rate:
          policy.valueType === BenefitValueType.PERCENTAGE
            ? (assignment.percentageOverride ?? policy.percentage)
            : null,
        amount,
        currencyCode,
        isTaxable: policy.taxable,
        affectsGrossPay: policy.affectsGrossPay,
        affectsNetPay: policy.affectsNetPay,
        displayOnPayslip: policy.payslipVisible,
        displayOrder: 650,
      });
    }
    return { blockers, snapshots, lineItems };
  }

  private async requestChange(
    user: AuthenticatedUser,
    id: string,
    action: 'SUSPEND' | 'CANCEL' | 'OVERRIDE',
    dto: ChangeBenefitAssignmentDto,
  ) {
    const assignment = await this.assignment(user.tenantId, id);
    if (assignment.pendingAction)
      throw new ConflictException(
        'Benefit assignment already has a pending change.',
      );
    const payload = changePayload(dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (!assignment.benefitPolicy.requiresChangeApproval) {
        return tx.employeeBenefitAssignment.update({
          where: { id },
          data: { ...applyChange(action, payload), updatedById: user.userId },
          include: assignmentInclude,
        });
      }
      const employee = await this.eligibility.employeeContext(
        user.tenantId,
        assignment.employeeId,
      );
      return this.startApproval(
        user,
        assignment,
        action,
        payload,
        employee,
        tx,
      );
    });
    await this.audit(
      user,
      `EMPLOYEE_BENEFIT_${action}_REQUESTED`,
      'EmployeeBenefitAssignment',
      id,
      assignment,
      updated,
    );
    return mapAssignment(updated, user, false);
  }

  private async startApproval(
    user: AuthenticatedUser,
    assignment: AssignmentWithRelations,
    action: string,
    payload: Record<string, unknown>,
    employee: Awaited<ReturnType<BenefitEligibilityService['employeeContext']>>,
    tx: Prisma.TransactionClient,
  ) {
    const amount =
      assignment.fixedAmountOverride ?? assignment.benefitPolicy.fixedAmount;
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId: user.tenantId,
      moduleKey: ApprovalModuleKey.BENEFIT_ASSIGNMENT,
      recordType: 'employeeBenefitChange',
      requesterEmployee: employee,
      scopeContext: {
        organizationId: employee.businessUnit?.organizationId,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
        employeeId: employee.id,
      },
      conditionContext: {
        amount: amount?.toString(),
        currencyCode:
          assignment.currencyCodeOverride ??
          assignment.benefitPolicy.currencyCode,
        values: { benefitPolicyId: assignment.benefitPolicyId, action },
      },
    });
    const approval = await this.approvalsService.createWorkflow(
      {
        user,
        moduleKey: 'benefit',
        entityType: 'employeeBenefitChange',
        entityId: randomUUID(),
        title: `${action} ${assignment.benefitPolicy.name}`,
        submittedForEmployeeId: assignment.employeeId,
        steps: route,
        metadata: {
          assignmentId: assignment.id,
          benefitPolicyId: assignment.benefitPolicyId,
          action,
          payload: payload as Prisma.InputJsonValue,
        },
      },
      tx,
    );
    return tx.employeeBenefitAssignment.update({
      where: { id: assignment.id },
      data: {
        pendingAction: action,
        pendingPayload: payload as Prisma.InputJsonValue,
        approvalRequestId: approval.id,
      },
      include: assignmentInclude,
    });
  }

  private async assignment(tenantId: string, id: string) {
    const assignment = await this.prisma.employeeBenefitAssignment.findFirst({
      where: { tenantId, id },
      include: assignmentInclude,
    });
    if (!assignment)
      throw new NotFoundException('Employee benefit assignment was not found.');
    return assignment;
  }

  private async policyData(tenantId: string, dto: CreateBenefitPolicyDto) {
    validatePolicy(dto);
    await this.validateScopeReferences(tenantId, dto);
    return {
      code: normalizeCode(dto.code),
      name: dto.name.trim(),
      description: clean(dto.description),
      benefitType: dto.benefitType,
      valueType: dto.valueType,
      fixedAmount:
        dto.valueType === BenefitValueType.FIXED_AMOUNT
          ? decimalOrNull(dto.fixedAmount)
          : null,
      percentage:
        dto.valueType === BenefitValueType.PERCENTAGE
          ? decimalOrNull(dto.percentage)
          : null,
      currencyCode: normalizeOptionalCode(dto.currencyCode),
      payrollCategory: dto.payrollCategory ?? null,
      payrollVisible: dto.payrollVisible ?? false,
      affectsGrossPay: dto.affectsGrossPay ?? false,
      affectsNetPay: dto.affectsNetPay ?? false,
      taxable: dto.taxable ?? false,
      payslipVisible: dto.payslipVisible ?? true,
      employeeVisible: dto.employeeVisible ?? true,
      sensitive: dto.sensitive ?? false,
      requiredForPayroll: dto.requiredForPayroll ?? false,
      defaultBalance: decimalOrNull(dto.defaultBalance),
      renewalPeriod: dto.renewalPeriod ?? BenefitRenewalPeriod.NONE,
      renewalIntervalMonths: dto.renewalIntervalMonths ?? null,
      expiresAfterMonths: dto.expiresAfterMonths ?? null,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dateOrNull(dto.effectiveTo),
      organizationId: dto.organizationId ?? null,
      countryCode: normalizeOptionalCode(dto.countryCode),
      businessUnitId: dto.businessUnitId ?? null,
      departmentId: dto.departmentId ?? null,
      locationId: dto.locationId ?? null,
      employeeLevelId: dto.employeeLevelId ?? null,
      employeeType: dto.employeeType ?? null,
      requiresProbationCompletion: dto.requiresProbationCompletion ?? false,
      autoAssignOnHire: dto.autoAssignOnHire ?? false,
      autoAssignOnPromotion: dto.autoAssignOnPromotion ?? false,
      requiresAssignmentApproval: dto.requiresAssignmentApproval ?? false,
      requiresChangeApproval: dto.requiresChangeApproval ?? false,
      eligibilityRules:
        dto.eligibilityRules === undefined
          ? Prisma.DbNull
          : (dto.eligibilityRules as Prisma.InputJsonValue),
      status: dto.status ?? BenefitPolicyStatus.ACTIVE,
    };
  }

  private async validateScopeReferences(
    tenantId: string,
    dto: CreateBenefitPolicyDto,
  ) {
    const checks: Array<Promise<unknown>> = [];
    if (dto.organizationId)
      checks.push(
        this.prisma.organization.findFirst({
          where: { tenantId, id: dto.organizationId },
        }),
      );
    if (dto.businessUnitId)
      checks.push(
        this.prisma.businessUnit.findFirst({
          where: { tenantId, id: dto.businessUnitId },
        }),
      );
    if (dto.departmentId)
      checks.push(
        this.prisma.department.findFirst({
          where: { tenantId, id: dto.departmentId },
        }),
      );
    if (dto.locationId)
      checks.push(
        this.prisma.location.findFirst({
          where: { tenantId, id: dto.locationId },
        }),
      );
    if (dto.employeeLevelId)
      checks.push(
        this.prisma.employeeLevel.findFirst({
          where: { tenantId, id: dto.employeeLevelId },
        }),
      );
    const results = await Promise.all(checks);
    if (results.some((result) => !result))
      throw new BadRequestException(
        'Benefit policy scope does not belong to this tenant.',
      );
  }

  private async employeeIdForUser(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!employee)
      throw new ForbiddenException(
        'No employee profile is linked to this user.',
      );
    return employee.id;
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
      sourceModule: 'benefits',
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

export type BenefitPayrollSnapshot = {
  assignmentId: string;
  policyId: string;
  policyCode: string;
  policyName: string;
  benefitType: string;
  valueType: string;
  amount: string;
  currencyCode: string;
  payrollCategory: PayrollRunLineItemCategory;
  taxable: boolean;
  payslipVisible: boolean;
  affectsGrossPay: boolean;
  affectsNetPay: boolean;
  effectiveDate: string;
  allocatedBalance: string | null;
  consumedBalance: string;
};

export type BenefitPayrollLineItem = {
  payComponentId: null;
  category: PayrollRunLineItemCategory;
  sourceType: 'BENEFIT';
  sourceId: string;
  label: string;
  quantity: null;
  rate: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  currencyCode: string;
  isTaxable: boolean;
  affectsGrossPay: boolean;
  affectsNetPay: boolean;
  displayOnPayslip: boolean;
  displayOrder: number;
};

function validatePolicy(dto: CreateBenefitPolicyDto) {
  if (
    dto.valueType === BenefitValueType.FIXED_AMOUNT &&
    dto.fixedAmount === undefined
  )
    throw new BadRequestException('Fixed amount benefit requires fixedAmount.');
  if (
    dto.valueType === BenefitValueType.PERCENTAGE &&
    dto.percentage === undefined
  )
    throw new BadRequestException('Percentage benefit requires percentage.');
  if (dto.payrollVisible && !dto.payrollCategory)
    throw new BadRequestException(
      'Payroll-visible benefit requires payrollCategory.',
    );
  if (
    dto.effectiveTo &&
    new Date(dto.effectiveTo) < new Date(dto.effectiveFrom)
  )
    throw new BadRequestException(
      'effectiveTo cannot be before effectiveFrom.',
    );
  if (
    dto.renewalPeriod === BenefitRenewalPeriod.CUSTOM &&
    !dto.renewalIntervalMonths
  )
    throw new BadRequestException(
      'Custom renewal requires renewalIntervalMonths.',
    );
}

function validateOverrides(valueType: BenefitValueType, dto: AssignBenefitDto) {
  if (
    dto.fixedAmountOverride !== undefined &&
    dto.percentageOverride !== undefined
  )
    throw new BadRequestException(
      'Choose either fixed or percentage override.',
    );
  if (
    valueType === BenefitValueType.FIXED_AMOUNT &&
    dto.percentageOverride !== undefined
  )
    throw new BadRequestException(
      'Fixed benefit cannot use percentage override.',
    );
  if (
    valueType === BenefitValueType.PERCENTAGE &&
    dto.fixedAmountOverride !== undefined
  )
    throw new BadRequestException(
      'Percentage benefit cannot use fixed override.',
    );
}

function mapAssignment(
  assignment: AssignmentWithRelations,
  user: AuthenticatedUser,
  own: boolean,
) {
  const canReadSensitive = hasPermission(user, 'benefits.read-sensitive');
  const hidden = assignment.benefitPolicy.sensitive && !canReadSensitive;
  return {
    ...assignment,
    status: effectiveBenefitStatus(assignment, new Date()),
    fixedAmountOverride: hidden
      ? null
      : (assignment.fixedAmountOverride?.toString() ?? null),
    percentageOverride: hidden
      ? null
      : (assignment.percentageOverride?.toString() ?? null),
    allocatedBalance: hidden
      ? null
      : (assignment.allocatedBalance?.toString() ?? null),
    consumedBalance: hidden ? null : assignment.consumedBalance.toString(),
    remainingBalance:
      hidden || !assignment.allocatedBalance
        ? null
        : assignment.allocatedBalance
            .minus(assignment.consumedBalance)
            .toString(),
    benefitPolicy: {
      ...assignment.benefitPolicy,
      fixedAmount: hidden
        ? null
        : (assignment.benefitPolicy.fixedAmount?.toString() ?? null),
      percentage: hidden
        ? null
        : (assignment.benefitPolicy.percentage?.toString() ?? null),
      defaultBalance: hidden
        ? null
        : (assignment.benefitPolicy.defaultBalance?.toString() ?? null),
      eligibilityRules: own
        ? undefined
        : assignment.benefitPolicy.eligibilityRules,
    },
    pendingPayload: own ? undefined : assignment.pendingPayload,
  };
}

function applyChange(
  action: string,
  payload: Prisma.JsonValue | Record<string, unknown> | null,
) {
  const values =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  if (action === 'ASSIGN') return { status: EmployeeBenefitStatus.ACTIVE };
  if (action === 'SUSPEND') return { status: EmployeeBenefitStatus.SUSPENDED };
  if (action === 'CANCEL') return { status: EmployeeBenefitStatus.CANCELLED };
  if (action === 'OVERRIDE')
    return {
      isManualOverride: true,
      ...(values.fixedAmountOverride !== undefined
        ? {
            fixedAmountOverride: decimalFromJson(values.fixedAmountOverride),
          }
        : {}),
      ...(values.percentageOverride !== undefined
        ? {
            percentageOverride: decimalFromJson(values.percentageOverride),
          }
        : {}),
      ...(typeof values.currencyCodeOverride === 'string'
        ? { currencyCodeOverride: values.currencyCodeOverride }
        : {}),
      ...(typeof values.effectiveTo === 'string'
        ? { effectiveTo: new Date(values.effectiveTo) }
        : {}),
    };
  throw new BadRequestException('Unsupported benefit assignment action.');
}

function changePayload(dto: ChangeBenefitAssignmentDto) {
  return definedValues({
    fixedAmountOverride: dto.fixedAmountOverride,
    percentageOverride: dto.percentageOverride,
    currencyCodeOverride: normalizeOptionalCode(dto.currencyCodeOverride),
    effectiveTo: dto.effectiveTo,
    reason: clean(dto.reason),
  });
}

function decimalFromJson(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new BadRequestException('Benefit override amount is invalid.');
  return new Prisma.Decimal(value);
}

function policyToDto(policy: Prisma.BenefitPolicyGetPayload<object>) {
  return {
    ...policy,
    fixedAmount: policy.fixedAmount ? Number(policy.fixedAmount) : undefined,
    percentage: policy.percentage ? Number(policy.percentage) : undefined,
    defaultBalance: policy.defaultBalance
      ? Number(policy.defaultBalance)
      : undefined,
    effectiveFrom: policy.effectiveFrom.toISOString(),
    effectiveTo: policy.effectiveTo?.toISOString(),
    eligibilityRules:
      policy.eligibilityRules &&
      typeof policy.eligibilityRules === 'object' &&
      !Array.isArray(policy.eligibilityRules)
        ? (policy.eligibilityRules as Record<string, unknown>)
        : undefined,
  };
}

function definedValues(value: object) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function decimalOrNull(value?: number | null) {
  return value === undefined || value === null
    ? null
    : new Prisma.Decimal(value);
}
function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}
function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}
function normalizeOptionalCode(value?: string | null) {
  return value?.trim().toUpperCase() || null;
}
function clean(value?: string | null) {
  return value?.trim() || null;
}
function handleUnique(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    throw new ConflictException(message);
  throw error;
}

function mapPolicy(
  policy: Prisma.BenefitPolicyGetPayload<object>,
  user: AuthenticatedUser,
) {
  if (!policy.sensitive || hasPermission(user, 'benefits.read-sensitive'))
    return policy;
  return {
    ...policy,
    fixedAmount: null,
    percentage: null,
    defaultBalance: null,
  };
}

function hasPermission(user: AuthenticatedUser, key: string) {
  return (
    user.permissionKeys?.includes('*') === true ||
    user.permissionKeys?.includes(key) === true
  );
}

function nextRenewalAfter(
  current: Date,
  period: BenefitRenewalPeriod,
  customMonths: number | null,
  effectiveDate: Date,
) {
  let next = calculateRenewalDate(current, period, customMonths);
  while (next && next <= effectiveDate) {
    next = calculateRenewalDate(next, period, customMonths);
  }
  return next;
}
