import {
  ApprovalAssignmentStatus,
  ApprovalRequestStatus,
  GenericApprovalStepStatus,
  LeaveApprovalStepStatus,
  LeaveRequestStatus,
  NotificationRecipientResolverType,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateLeavePolicyRuleDto } from './dto/create-leave-policy-rule.dto';
import { UpdateLeavePolicyRuleDto } from './dto/update-leave-policy-rule.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildCsvFile,
  buildCsvTemplate,
  csvDate,
  type CsvFile,
} from '../../common/utils/csv.util';
import { hasElevatedTenantRole } from '../../common/security/elevated-tenant-roles';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { AuditService } from '../audit/audit.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { UsersRepository } from '../users/users.repository';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { CreateLeavePolicyAssignmentDto } from './dto/create-leave-policy-assignment.dto';
import { LeaveEntitlementService } from './leave-entitlement.service';
import { LeavePolicyResolverService } from './leave-policy-resolver.service';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { SubmitLeaveRequestDto } from './dto/submit-leave-request.dto';
import { UpdateLeavePolicyAssignmentDto } from './dto/update-leave-policy-assignment.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveRepository, LeaveRequestWithRelations } from './leave.repository';
import { ApprovalMatrixResolverService } from '../approvals/approval-matrix-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';

const ApprovalModes = {
  ANY_ONE: 'ANY_ONE',
  ALL: 'ALL',
} as const;

const ApprovalModules = {
  LEAVE_REQUEST: 'LEAVE_REQUEST',
} as const;

const ApprovalScopes = {
  TENANT: 'TENANT',
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  DEPARTMENT: 'DEPARTMENT',
  EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
  EMPLOYEE: 'EMPLOYEE',
} as const;

function mapLeaveToApprovalStatus(status: LeaveRequestStatus) {
  if (status === LeaveRequestStatus.APPROVED)
    return ApprovalRequestStatus.APPROVED;
  if (status === LeaveRequestStatus.REJECTED)
    return ApprovalRequestStatus.REJECTED;
  if (status === LeaveRequestStatus.CANCELLED)
    return ApprovalRequestStatus.CANCELLED;
  return ApprovalRequestStatus.PENDING;
}

function mapLeaveStepStatus(status: LeaveApprovalStepStatus) {
  if (status === LeaveApprovalStepStatus.APPROVED)
    return GenericApprovalStepStatus.APPROVED;
  if (status === LeaveApprovalStepStatus.REJECTED)
    return GenericApprovalStepStatus.REJECTED;
  if (status === LeaveApprovalStepStatus.SKIPPED)
    return GenericApprovalStepStatus.SKIPPED;
  if (status === LeaveApprovalStepStatus.CANCELLED)
    return GenericApprovalStepStatus.SKIPPED;
  return GenericApprovalStepStatus.PENDING;
}

function mapLeaveAssignmentStatus(status: LeaveApprovalStepStatus) {
  if (status === LeaveApprovalStepStatus.APPROVED)
    return ApprovalAssignmentStatus.APPROVED;
  if (status === LeaveApprovalStepStatus.REJECTED)
    return ApprovalAssignmentStatus.REJECTED;
  if (status === LeaveApprovalStepStatus.SKIPPED)
    return ApprovalAssignmentStatus.SUPERSEDED;
  if (status === LeaveApprovalStepStatus.CANCELLED)
    return ApprovalAssignmentStatus.EXPIRED;
  return ApprovalAssignmentStatus.PENDING;
}

/**
 * The scope fields a leave-policy assignment is validated against.
 *
 * Both the create DTO and an existing row feed these helpers, and the two
 * disagree about how "not set" is spelled: a DTO omits a field (`undefined`),
 * a row stores `null`. The helpers have always treated both the same way — the
 * types were narrower than the code, and `(this.prisma as any)` was hiding the
 * mismatch rather than resolving it.
 */
type LeavePolicyAssignmentShape = {
  scopeType: CreateLeavePolicyAssignmentDto['scopeType'];
  scopeId?: string | null;
  organizationId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  employeeLevelId?: string | null;
  employeeId?: string | null;
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRepository: LeaveRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
    private readonly approvalResolver: ApprovalMatrixResolverService,
    private readonly notificationsService: NotificationsService,
    private readonly policyResolver: LeavePolicyResolverService,
    private readonly entitlementService: LeaveEntitlementService,
  ) {}

  findLeaveTypes(tenantId: string, query: ListLeaveConfigDto) {
    return this.leaveRepository.findLeaveTypes(tenantId, query);
  }

  async findLeaveTypeById(tenantId: string, id: string) {
    const leaveType = await this.leaveRepository.findLeaveTypeById(
      tenantId,
      id,
    );

    if (!leaveType) {
      throw new NotFoundException('Leave type was not found for this tenant.');
    }

    return leaveType;
  }

  async listLeaveTypePolicyRules(tenantId: string, id: string) {
    await this.findLeaveTypeById(tenantId, id);
    return this.leaveRepository.listLeavePolicyRulesByLeaveType(tenantId, id);
  }

  async listLeaveTypeUsage(tenantId: string, id: string) {
    await this.findLeaveTypeById(tenantId, id);
    const [leaveRequests, leaveBalances, leaveConsumptionRecords, policyRules] =
      await Promise.all([
        this.prisma.leaveRequest.count({
          where: { tenantId, leaveTypeId: id },
        }),
        this.prisma.leaveBalance.count({
          where: { tenantId, leaveTypeId: id },
        }),
        this.prisma.leaveConsumptionRecord.count({
          where: { tenantId, leaveTypeId: id },
        }),
        this.prisma.leavePolicyRule.count({
          where: { tenantId, leaveTypeId: id },
        }),
      ]);
    return [
      { source: 'Leave Requests', count: leaveRequests },
      { source: 'Leave Balances', count: leaveBalances },
      { source: 'Leave Consumption Records', count: leaveConsumptionRecords },
      { source: 'Leave Policy Rules', count: policyRules },
    ];
  }

  async createLeaveType(
    currentUser: AuthenticatedUser,
    dto: CreateLeaveTypeDto,
  ) {
    this.validateLeaveType(dto);
    try {
      return await this.leaveRepository.createLeaveType({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        code: normalizeCode(dto.code ?? dto.name),
        category: dto.category.trim(),
        description: normalizeOptionalText(dto.description),
        isPaid: dto.isPaid ?? true,
        affectsPayroll: dto.affectsPayroll ?? false,
        consumesBalance: dto.consumesBalance ?? true,
        employeeRequestAllowed: dto.employeeRequestAllowed ?? true,
        requiresAttachment: dto.requiresAttachment ?? false,
        allowHalfDay: dto.allowHalfDay ?? true,
        allowHourlyLeave: dto.allowHourlyLeave ?? false,
        requiresApproval: dto.requiresApproval ?? true,
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Leave type');
    }
  }

  async updateLeaveType(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateLeaveTypeDto,
  ) {
    const existing = await this.findLeaveTypeById(currentUser.tenantId, id);
    this.validateLeaveType({
      name: dto.name ?? existing.name,
      code: dto.code ?? existing.code,
      category: dto.category ?? existing.category,
      isPaid: dto.isPaid ?? existing.isPaid,
      affectsPayroll: dto.affectsPayroll ?? existing.affectsPayroll,
      consumesBalance: dto.consumesBalance ?? existing.consumesBalance,
      employeeRequestAllowed:
        dto.employeeRequestAllowed ?? existing.employeeRequestAllowed,
      requiresAttachment: dto.requiresAttachment ?? existing.requiresAttachment,
      allowHalfDay: dto.allowHalfDay ?? existing.allowHalfDay,
      allowHourlyLeave: dto.allowHourlyLeave ?? existing.allowHourlyLeave,
      requiresApproval: dto.requiresApproval ?? existing.requiresApproval,
      isActive: dto.isActive ?? existing.isActive,
    });
    const result = await this.leaveRepository.updateLeaveType(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined
          ? { code: dto.code?.trim().toUpperCase() ?? null }
          : {}),
        ...(dto.category !== undefined
          ? { category: dto.category.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: normalizeOptionalText(dto.description) }
          : {}),
        ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
        ...(dto.affectsPayroll !== undefined
          ? { affectsPayroll: dto.affectsPayroll }
          : {}),
        ...(dto.consumesBalance !== undefined
          ? { consumesBalance: dto.consumesBalance }
          : {}),
        ...(dto.employeeRequestAllowed !== undefined
          ? { employeeRequestAllowed: dto.employeeRequestAllowed }
          : {}),
        ...(dto.requiresAttachment !== undefined
          ? { requiresAttachment: dto.requiresAttachment }
          : {}),
        ...(dto.allowHalfDay !== undefined
          ? { allowHalfDay: dto.allowHalfDay }
          : {}),
        ...(dto.allowHourlyLeave !== undefined
          ? { allowHourlyLeave: dto.allowHourlyLeave }
          : {}),
        ...(dto.requiresApproval !== undefined
          ? { requiresApproval: dto.requiresApproval }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Leave type was not found for this tenant.');
    }

    return this.findLeaveTypeById(currentUser.tenantId, id);
  }

  async deactivateLeaveType(currentUser: AuthenticatedUser, id: string) {
    await this.findLeaveTypeById(currentUser.tenantId, id);
    const [policyRules, leaveRequests, leaveBalances, consumptionRecords] =
      await Promise.all([
        this.prisma.leavePolicyRule.count({
          where: { tenantId: currentUser.tenantId, leaveTypeId: id },
        }),
        this.prisma.leaveRequest.count({
          where: { tenantId: currentUser.tenantId, leaveTypeId: id },
        }),
        this.prisma.leaveBalance.count({
          where: { tenantId: currentUser.tenantId, leaveTypeId: id },
        }),
        this.prisma.leaveConsumptionRecord.count({
          where: { tenantId: currentUser.tenantId, leaveTypeId: id },
        }),
      ]);
    if (policyRules + leaveRequests + leaveBalances + consumptionRecords > 0) {
      throw new ConflictException(
        'Leave type cannot be deleted while policy rules, requests, balances, or consumption records reference it.',
      );
    }
    return this.updateLeaveType(currentUser, id, { isActive: false });
  }

  findLeavePolicies(tenantId: string, query: ListLeaveConfigDto) {
    return this.leaveRepository.findLeavePolicies(tenantId, query);
  }

  async findLeavePolicyById(tenantId: string, id: string) {
    const leavePolicy = await this.leaveRepository.findLeavePolicyById(
      tenantId,
      id,
    );

    if (!leavePolicy) {
      throw new NotFoundException(
        'Leave policy was not found for this tenant.',
      );
    }

    return leavePolicy;
  }

  async createLeavePolicy(
    currentUser: AuthenticatedUser,
    dto: CreateLeavePolicyDto,
  ) {
    try {
      return await this.leaveRepository.createLeavePolicy({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        description: normalizeOptionalText(dto.description),
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Leave policy');
    }
  }

  async updateLeavePolicy(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateLeavePolicyDto,
  ) {
    await this.findLeavePolicyById(currentUser.tenantId, id);

    const result = await this.leaveRepository.updateLeavePolicy(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: normalizeOptionalText(dto.description) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException(
        'Leave policy was not found for this tenant.',
      );
    }

    return this.findLeavePolicyById(currentUser.tenantId, id);
  }

  async deactivateLeavePolicy(currentUser: AuthenticatedUser, id: string) {
    await this.findLeavePolicyById(currentUser.tenantId, id);
    const [rules, assignments] = await Promise.all([
      this.prisma.leavePolicyRule.count({
        where: { tenantId: currentUser.tenantId, leavePolicyId: id },
      }),
      this.prisma.leavePolicyAssignment.count({
        where: { tenantId: currentUser.tenantId, leavePolicyId: id },
      }),
    ]);
    if (rules + assignments > 0) {
      throw new ConflictException(
        'Leave policy cannot be deleted while rules or assignments reference it.',
      );
    }
    return this.updateLeavePolicy(currentUser, id, { isActive: false });
  }

  async submitLeaveRequest(
    currentUser: AuthenticatedUser,
    dto: SubmitLeaveRequestDto,
  ) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    const leaveType = await this.leaveRepository.findLeaveTypeById(
      currentUser.tenantId,
      dto.leaveTypeId,
    );

    if (!leaveType || !leaveType.isActive) {
      throw new BadRequestException(
        'Selected leave type is not active for this tenant.',
      );
    }

    if (!leaveType.employeeRequestAllowed) {
      throw new BadRequestException(
        'Selected leave type is not available for employee requests.',
      );
    }

    const leavePolicy = await this.resolveApplicableLeavePolicy(
      currentUser.tenantId,
      employee,
      new Date(),
    );

    const { startDate, endDate, totalDays } = this.validateAndCalculateRange(
      dto.startDate,
      dto.endDate,
    );

    await this.assertNoOverlappingLeave(
      currentUser.tenantId,
      employee.id,
      startDate,
      endDate,
    );

    const leavePolicyRule = await this.resolveLeavePolicyRuleForRequest(
      currentUser.tenantId,
      leavePolicy?.id ?? null,
      leaveType.id,
    );
    await this.validateLeaveRequestAgainstPolicy(
      currentUser.tenantId,
      employee.id,
      leaveType,
      leavePolicyRule,
      totalDays,
      Boolean(dto.attachmentReference?.trim()),
    );

    const approvalSteps =
      leavePolicyRule?.approvalRequired !== false
        ? await this.buildApprovalSteps(
            currentUser.tenantId,
            employee,
            leavePolicy?.id ?? null,
            leaveType.id,
            totalDays,
            currentUser.userId,
          )
        : [];

    const leaveRequest = await this.prisma.$transaction(async (tx) => {
      const created = await this.leaveRepository.createLeaveRequest(
        {
          tenantId: currentUser.tenantId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          totalDays,
          reason: dto.reason?.trim(),
          status:
            approvalSteps.length > 0
              ? LeaveRequestStatus.PENDING
              : LeaveRequestStatus.APPROVED,
          attachmentRequired:
            leaveType.requiresAttachment ||
            (leavePolicyRule?.requiresDocumentAfterDays !== null &&
              leavePolicyRule?.requiresDocumentAfterDays !== undefined &&
              totalDays.greaterThan(
                new Prisma.Decimal(leavePolicyRule.requiresDocumentAfterDays),
              )),
          attachmentReference: dto.attachmentReference?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        approvalSteps,
        tx,
      );

      if (created.status === LeaveRequestStatus.APPROVED) {
        await this.recordApprovedLeaveConsumption(created, tx);
      }

      return created;
    });

    await this.notifyPendingApprovers(leaveRequest, currentUser);
    await this.syncGenericLeaveApproval(leaveRequest, currentUser, 'SUBMITTED');

    return this.mapLeaveRequest(leaveRequest, currentUser);
  }

  private async resolveLeavePolicyRuleForRequest(
    tenantId: string,
    leavePolicyId: string | null,
    leaveTypeId: string,
  ) {
    if (!leavePolicyId) return null;
    const rules = await this.leaveRepository.listActiveLeavePolicyRules(
      tenantId,
      leavePolicyId,
    );
    const rule = rules.find((item) => item.leaveTypeId === leaveTypeId);
    if (!rule) {
      throw new BadRequestException(
        'Selected leave type is not configured in the assigned leave policy.',
      );
    }
    return rule;
  }

  private async validateLeaveRequestAgainstPolicy(
    tenantId: string,
    employeeId: string,
    leaveType: {
      id: string;
      consumesBalance: boolean;
      requiresAttachment: boolean;
    },
    rule:
      | Awaited<
          ReturnType<LeaveRepository['listActiveLeavePolicyRules']>
        >[number]
      | null,
    totalDays: Prisma.Decimal,
    hasAttachment: boolean,
  ) {
    if (leaveType.requiresAttachment && !hasAttachment) {
      throw new BadRequestException(
        'An attachment is required for this leave type.',
      );
    }

    if (
      rule?.requiresDocumentAfterDays !== null &&
      rule?.requiresDocumentAfterDays !== undefined &&
      totalDays.greaterThan(
        new Prisma.Decimal(rule.requiresDocumentAfterDays),
      ) &&
      !hasAttachment
    ) {
      throw new BadRequestException(
        'An attachment is required for this leave duration.',
      );
    }

    if (
      rule?.maxConsecutiveDays &&
      totalDays.greaterThan(rule.maxConsecutiveDays)
    ) {
      throw new BadRequestException(
        'Leave request exceeds the maximum consecutive days allowed by policy.',
      );
    }

    if (
      rule?.minimumConsecutiveDays &&
      totalDays.lessThan(rule.minimumConsecutiveDays)
    ) {
      throw new BadRequestException(
        'Leave request is below the minimum consecutive days required by policy.',
      );
    }

    if (!leaveType.consumesBalance) return;

    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        tenantId_employeeId_leaveTypeId: {
          tenantId,
          employeeId,
          leaveTypeId: leaveType.id,
        },
      },
    });
    const remaining = balance?.totalRemaining ?? new Prisma.Decimal(0);
    if (remaining.greaterThanOrEqualTo(totalDays)) return;

    if (!rule?.negativeBalanceAllowed) {
      throw new BadRequestException(
        'Insufficient leave balance for this request.',
      );
    }

    const maximumNegativeBalance =
      rule.maximumNegativeBalance ?? new Prisma.Decimal(0);
    const projected = remaining.minus(totalDays);
    if (
      projected.lessThan(new Prisma.Decimal(0).minus(maximumNegativeBalance))
    ) {
      throw new BadRequestException(
        'Leave request exceeds the maximum negative balance allowed by policy.',
      );
    }
  }

  async getAvailableLeaveTypesForEmployee(currentUser: AuthenticatedUser) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      throw new BadRequestException(
        'No employee record is linked to the current user.',
      );
    }

    const [leavePolicy, activeLeaveTypes] = await Promise.all([
      this.resolveApplicableLeavePolicy(
        currentUser.tenantId,
        employee,
        new Date(),
      ),
      this.leaveRepository.findLeaveTypes(currentUser.tenantId, {
        isActive: true,
      }),
    ]);

    const policyRules = leavePolicy
      ? await this.leaveRepository.listActiveLeavePolicyRules(
          currentUser.tenantId,
          leavePolicy.id,
        )
      : [];
    const allowedTypeIds = new Set(policyRules.map((rule) => rule.leaveTypeId));
    const leaveTypes = activeLeaveTypes.filter(
      (leaveType) =>
        leaveType.employeeRequestAllowed &&
        (!leavePolicy || allowedTypeIds.has(leaveType.id)),
    );

    return {
      status:
        leaveTypes.length > 0
          ? ('AVAILABLE' as const)
          : ('NO_ACTIVE_TYPES' as const),
      ...(leavePolicy
        ? {
            leavePolicy: {
              id: leavePolicy.id,
              name: leavePolicy.name,
            },
          }
        : {}),
      leaveTypes: leaveTypes.map((leaveType) => ({
        id: leaveType.id,
        name: leaveType.name,
        code: leaveType.code,
        category: leaveType.category,
        requiresApproval: leaveType.requiresApproval,
        isPaid: leaveType.isPaid,
        requiresAttachment: leaveType.requiresAttachment,
        allowHalfDay: leaveType.allowHalfDay,
        allowHourlyLeave: leaveType.allowHourlyLeave,
      })),
    };
  }

  private async notifyPendingApprovers(
    leaveRequest: LeaveRequestWithRelations,
    currentUser: AuthenticatedUser,
  ) {
    const nextStepOrder = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    )?.stepOrder;
    const recipientUserIds = leaveRequest.approvalSteps
      .filter(
        (step) =>
          step.status === LeaveApprovalStepStatus.PENDING &&
          step.stepOrder === nextStepOrder &&
          Boolean(step.approverUserId),
      )
      .map((step) => step.approverUserId as string);

    if (recipientUserIds.length === 0) {
      return;
    }

    await this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'leave.request.submitted.approver',
      moduleKey: 'leave',
      actorUserId: currentUser.userId,
      relatedEntityType: 'leaveRequest',
      relatedEntityId: leaveRequest.id,
      relatedRecordNumber: leaveRequest.id,
      metadata: {
        employeeName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
        leaveTypeName: leaveRequest.leaveType.name,
        approvalAssigneeUserIds: recipientUserIds,
        targetUrl: `/leaves/${leaveRequest.id}`,
      },
    });
  }

  async listMyLeaveRequests(
    currentUser: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ) {
    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    if (!employee) {
      return [];
    }

    const requests = await this.leaveRepository.findLeaveRequestsByEmployee(
      currentUser.tenantId,
      employee.id,
      query,
    );

    return requests.map((request) =>
      this.mapLeaveRequest(request, currentUser),
    );
  }

  /**
   * Exports the leave requests the caller can already see.
   *
   * Rows come from listTeamLeaveRequests, so the export inherits that method's
   * scoping: tenant-wide for elevated roles, reporting line for managers, own
   * records otherwise. That is why this needs no permission beyond read — it
   * can never reveal a request the caller could not already list.
   */
  async exportLeaveRequests(
    currentUser: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ): Promise<CsvFile> {
    const requests = await this.listTeamLeaveRequests(currentUser, query);

    // Exports use human-readable headers, matching the Employee and Attendance
    // exports. The import template keeps machine keys, because that file is a
    // contract with the parser rather than something a person reads.
    const rows = requests.map((request) => ({
      'Employee Code': request.employee.employeeCode ?? '',
      'Employee Name': request.employee.fullName,
      'Leave Type': request.leaveType?.name ?? '',
      'Start Date': csvDate(request.startDate),
      'End Date': csvDate(request.endDate),
      'Total Days': Number(request.totalDays ?? 0),
      Status: request.status,
      Reason: request.reason ?? '',
      Documents: request.documents.length,
      'Submitted At': csvDate(request.createdAt),
    }));

    return buildCsvFile('leave-requests.csv', rows, LEAVE_EXPORT_COLUMNS);
  }

  exportLeaveRequestTemplate(): CsvFile {
    return buildCsvTemplate(
      'leave-requests-import-template.csv',
      LEAVE_IMPORT_TEMPLATE_COLUMNS,
    );
  }

  async listTeamLeaveRequests(
    currentUser: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ) {
    if (this.canViewAllTenantLeaveRequests(currentUser)) {
      const tenantRequests =
        await this.leaveRepository.findLeaveRequestsByTenant(
          currentUser.tenantId,
          query,
        );

      return tenantRequests.map((request) =>
        this.mapLeaveRequest(request, currentUser),
      );
    }

    const currentEmployee =
      await this.employeesRepository.findByUserIdAndTenant(
        currentUser.tenantId,
        currentUser.userId,
      );
    if (!currentEmployee) {
      return [];
    }

    const reportIds = await this.resolveReportingHierarchyEmployeeIds(
      currentUser.tenantId,
      currentEmployee.id,
    );
    if (reportIds.length === 0) {
      return [];
    }

    const teamRequests =
      await this.leaveRepository.findLeaveRequestsByEmployees(
        currentUser.tenantId,
        reportIds,
        query,
      );

    return teamRequests.map((request) =>
      this.mapLeaveRequest(request, currentUser),
    );
  }

  async getLeaveRequest(
    currentUser: AuthenticatedUser,
    leaveRequestId: string,
  ) {
    const leaveRequest = await this.findLeaveRequestOrThrow(
      currentUser.tenantId,
      leaveRequestId,
    );

    if (await this.canReadLeaveRequest(currentUser, leaveRequest)) {
      return this.mapLeaveRequest(leaveRequest, currentUser);
    }

    throw new ForbiddenException(
      'You do not have permission to view this leave request.',
    );
  }

  async approveLeaveRequest(
    currentUser: AuthenticatedUser,
    leaveRequestId: string,
    dto: LeaveRequestActionDto,
  ) {
    return this.processLeaveRequestDecision(
      currentUser,
      leaveRequestId,
      dto.comments,
      'approve',
    );
  }

  async rejectLeaveRequest(
    currentUser: AuthenticatedUser,
    leaveRequestId: string,
    dto: LeaveRequestActionDto,
  ) {
    return this.processLeaveRequestDecision(
      currentUser,
      leaveRequestId,
      dto.comments,
      'reject',
    );
  }

  async cancelLeaveRequest(
    currentUser: AuthenticatedUser,
    leaveRequestId: string,
    dto: CancelLeaveRequestDto,
  ) {
    const leaveRequest = await this.findLeaveRequestOrThrow(
      currentUser.tenantId,
      leaveRequestId,
    );

    const employee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );

    const isOwnRequest = Boolean(
      employee && leaveRequest.employeeId === employee.id,
    );

    if (
      !isOwnRequest &&
      !this.canViewAllTenantLeaveRequests(currentUser) &&
      !(await this.canOverrideLeaveDecision(currentUser, leaveRequest))
    ) {
      throw new ForbiddenException(
        'You can only cancel your own leave requests, or those of employees you administer.',
      );
    }

    if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending leave requests can be cancelled.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.leaveRepository.updateLeaveRequest(
        currentUser.tenantId,
        leaveRequestId,
        {
          status: LeaveRequestStatus.CANCELLED,
          updatedById: currentUser.userId,
          reason: dto.reason?.trim() ?? leaveRequest.reason,
        },
        tx,
      );

      for (const step of leaveRequest.approvalSteps) {
        if (step.status === LeaveApprovalStepStatus.PENDING) {
          await this.leaveRepository.updateLeaveApprovalStep(
            currentUser.tenantId,
            step.id,
            {
              status: LeaveApprovalStepStatus.CANCELLED,
              updatedById: currentUser.userId,
              actedAt: new Date(),
              comments: dto.reason?.trim(),
            },
            tx,
          );
        }
      }
    });

    const updated = await this.findLeaveRequestOrThrow(
      currentUser.tenantId,
      leaveRequestId,
    );

    await this.resolveOutstandingApprovalNotifications(
      currentUser.tenantId,
      leaveRequestId,
    );

    return this.mapLeaveRequest(updated, currentUser);
  }

  /**
   * BUG-2016 — the request is settled, so nothing may still be asking anyone to
   * approve it.
   *
   * Cancelling used to leave the approver's "Leave request needs approval" row
   * unread and priority 1 in their inbox, pointing at a `CANCELLED` record, and
   * counted by the dashboard badge. The delivery half of the notification
   * machinery was working; the resolution half did not exist. It lives in the
   * notifications module because every approvable record type raises the same
   * kind of row.
   *
   * Called after the transaction rather than inside it, alongside the `emit`
   * calls it mirrors: the notification tables are not part of the leave
   * request's consistency boundary, and a decision must not be rolled back
   * because an inbox row could not be tidied.
   */
  private resolveOutstandingApprovalNotifications(
    tenantId: string,
    leaveRequestId: string,
  ) {
    return this.notificationsService.resolveActionRequired({
      tenantId,
      relatedEntityType: 'leaveRequest',
      relatedEntityId: leaveRequestId,
    });
  }

  async listLeavePolicyRules(currentUser: AuthenticatedUser, policyId: string) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);

    return this.leaveRepository.listLeavePolicyRules(
      currentUser.tenantId,
      policyId,
    );
  }

  async listLeavePolicyAssignmentsForPolicy(
    currentUser: AuthenticatedUser,
    policyId: string,
  ) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);
    return this.leaveRepository.listLeavePolicyAssignmentsByPolicy(
      currentUser.tenantId,
      policyId,
    );
  }

  async createLeavePolicyRule(
    currentUser: AuthenticatedUser,
    policyId: string,
    dto: CreateLeavePolicyRuleDto,
  ) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);
    await this.ensureLeaveTypeExists(currentUser.tenantId, dto.leaveTypeId);

    this.validateLeavePolicyRule(dto);

    const existingRule =
      await this.leaveRepository.findLeavePolicyRuleByPolicyAndLeaveType(
        currentUser.tenantId,
        policyId,
        dto.leaveTypeId,
      );

    if (existingRule) {
      throw new ConflictException(
        'A rule for this leave type already exists in this policy.',
      );
    }

    return this.leaveRepository.createLeavePolicyRule(
      currentUser.tenantId,
      policyId,
      {
        leaveTypeId: dto.leaveTypeId,
        entitlementDays:
          dto.entitlementDays !== undefined
            ? new Prisma.Decimal(dto.entitlementDays)
            : undefined,
        minimumServiceDays: dto.minimumServiceDays,
        prorateOnJoining: dto.prorateOnJoining ?? false,
        prorateOnExit: dto.prorateOnExit ?? false,
        maximumNegativeBalance:
          dto.maximumNegativeBalance !== undefined
            ? new Prisma.Decimal(dto.maximumNegativeBalance)
            : undefined,
        accrualType: dto.accrualType,
        accrualFrequency: dto.accrualFrequency,
        accrualDay: dto.accrualDay,
        accrualAmount:
          dto.accrualAmount !== undefined
            ? new Prisma.Decimal(dto.accrualAmount)
            : undefined,
        accrueDuringProbation: dto.accrueDuringProbation ?? false,
        creditOnJoining: dto.creditOnJoining ?? false,
        carryForwardAllowed: dto.carryForwardAllowed ?? false,
        carryForwardLimit:
          dto.carryForwardLimit !== undefined
            ? new Prisma.Decimal(dto.carryForwardLimit)
            : undefined,
        carryForwardExpiryMonths: dto.carryForwardExpiryMonths,
        encashUnusedBalance: dto.encashUnusedBalance ?? false,
        maximumEncashmentDays:
          dto.maximumEncashmentDays !== undefined
            ? new Prisma.Decimal(dto.maximumEncashmentDays)
            : undefined,
        negativeBalanceAllowed: dto.negativeBalanceAllowed ?? false,
        minimumNoticeDays: dto.minimumNoticeDays,
        minimumConsecutiveDays:
          dto.minimumConsecutiveDays !== undefined
            ? new Prisma.Decimal(dto.minimumConsecutiveDays)
            : undefined,
        allowDuringProbation: dto.allowDuringProbation ?? true,
        allowBackdatedRequests: dto.allowBackdatedRequests ?? false,
        maxBackdatedDays: dto.maxBackdatedDays,
        allowFutureRequests: dto.allowFutureRequests ?? true,
        maxFutureDays: dto.maxFutureDays,
        blockDuringNoticePeriod: dto.blockDuringNoticePeriod ?? false,
        requiresDocumentAfterDays: dto.requiresDocumentAfterDays,
        probationRestriction: dto.probationRestriction ?? false,
        genderRestriction: dto.genderRestriction,
        minServiceMonths: dto.minServiceMonths,
        maxConsecutiveDays:
          dto.maxConsecutiveDays !== undefined
            ? new Prisma.Decimal(dto.maxConsecutiveDays)
            : undefined,
        approvalRequired: dto.approvalRequired ?? true,
        approvalMatrixId: dto.approvalMatrixId,
        autoApproveUnderDays:
          dto.autoApproveUnderDays !== undefined
            ? new Prisma.Decimal(dto.autoApproveUnderDays)
            : undefined,
        requireHrApproval: dto.requireHrApproval ?? false,
        requirePayrollApproval: dto.requirePayrollApproval ?? false,
        isPaid: dto.isPaid ?? true,
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    );
  }

  async updateLeavePolicyRule(
    currentUser: AuthenticatedUser,
    policyId: string,
    ruleId: string,
    dto: UpdateLeavePolicyRuleDto,
  ) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);

    const existingRule = await this.leaveRepository.findLeavePolicyRuleById(
      currentUser.tenantId,
      policyId,
      ruleId,
    );

    if (!existingRule) {
      throw new NotFoundException('Leave policy rule not found.');
    }

    if (dto.leaveTypeId && dto.leaveTypeId !== existingRule.leaveTypeId) {
      await this.ensureLeaveTypeExists(currentUser.tenantId, dto.leaveTypeId);

      const duplicateRule =
        await this.leaveRepository.findLeavePolicyRuleByPolicyAndLeaveType(
          currentUser.tenantId,
          policyId,
          dto.leaveTypeId,
        );

      if (duplicateRule && duplicateRule.id !== ruleId) {
        throw new ConflictException(
          'A rule for this leave type already exists in this policy.',
        );
      }
    }

    this.validateLeavePolicyRule({
      entitlementDays:
        dto.entitlementDays !== undefined
          ? dto.entitlementDays
          : existingRule.entitlementDays
            ? Number(existingRule.entitlementDays)
            : undefined,
      accrualType: dto.accrualType ?? existingRule.accrualType,
      accrualDay: dto.accrualDay ?? existingRule.accrualDay ?? undefined,
      accrualAmount:
        dto.accrualAmount !== undefined
          ? dto.accrualAmount
          : existingRule.accrualAmount
            ? Number(existingRule.accrualAmount)
            : undefined,
      carryForwardAllowed:
        dto.carryForwardAllowed ?? existingRule.carryForwardAllowed,
      carryForwardLimit:
        dto.carryForwardLimit !== undefined
          ? dto.carryForwardLimit
          : existingRule.carryForwardLimit
            ? Number(existingRule.carryForwardLimit)
            : undefined,
      requiresDocumentAfterDays:
        dto.requiresDocumentAfterDays !== undefined
          ? dto.requiresDocumentAfterDays
          : (existingRule.requiresDocumentAfterDays ?? undefined),
      minServiceMonths:
        dto.minServiceMonths !== undefined
          ? dto.minServiceMonths
          : (existingRule.minServiceMonths ?? undefined),
      maxConsecutiveDays:
        dto.maxConsecutiveDays !== undefined
          ? dto.maxConsecutiveDays
          : existingRule.maxConsecutiveDays
            ? Number(existingRule.maxConsecutiveDays)
            : undefined,
      minimumConsecutiveDays:
        dto.minimumConsecutiveDays !== undefined
          ? dto.minimumConsecutiveDays
          : existingRule.minimumConsecutiveDays
            ? Number(existingRule.minimumConsecutiveDays)
            : undefined,
      negativeBalanceAllowed:
        dto.negativeBalanceAllowed ?? existingRule.negativeBalanceAllowed,
      maximumNegativeBalance:
        dto.maximumNegativeBalance !== undefined
          ? dto.maximumNegativeBalance
          : existingRule.maximumNegativeBalance
            ? Number(existingRule.maximumNegativeBalance)
            : undefined,
      allowBackdatedRequests:
        dto.allowBackdatedRequests ?? existingRule.allowBackdatedRequests,
      maxBackdatedDays:
        dto.maxBackdatedDays ?? existingRule.maxBackdatedDays ?? undefined,
      allowFutureRequests:
        dto.allowFutureRequests ?? existingRule.allowFutureRequests,
      maxFutureDays:
        dto.maxFutureDays ?? existingRule.maxFutureDays ?? undefined,
    });

    return this.leaveRepository.updateLeavePolicyRule(
      currentUser.tenantId,
      policyId,
      ruleId,
      {
        ...(dto.leaveTypeId !== undefined
          ? { leaveTypeId: dto.leaveTypeId }
          : {}),
        ...(dto.entitlementDays !== undefined
          ? { entitlementDays: new Prisma.Decimal(dto.entitlementDays) }
          : {}),
        ...(dto.minimumServiceDays !== undefined
          ? { minimumServiceDays: dto.minimumServiceDays }
          : {}),
        ...(dto.prorateOnJoining !== undefined
          ? { prorateOnJoining: dto.prorateOnJoining }
          : {}),
        ...(dto.prorateOnExit !== undefined
          ? { prorateOnExit: dto.prorateOnExit }
          : {}),
        ...(dto.maximumNegativeBalance !== undefined
          ? {
              maximumNegativeBalance:
                dto.maximumNegativeBalance === null
                  ? null
                  : new Prisma.Decimal(dto.maximumNegativeBalance),
            }
          : {}),
        ...(dto.accrualType !== undefined
          ? { accrualType: dto.accrualType }
          : {}),
        ...(dto.accrualFrequency !== undefined
          ? { accrualFrequency: dto.accrualFrequency }
          : {}),
        ...(dto.accrualDay !== undefined ? { accrualDay: dto.accrualDay } : {}),
        ...(dto.accrualAmount !== undefined
          ? {
              accrualAmount:
                dto.accrualAmount === null
                  ? null
                  : new Prisma.Decimal(dto.accrualAmount),
            }
          : {}),
        ...(dto.accrueDuringProbation !== undefined
          ? { accrueDuringProbation: dto.accrueDuringProbation }
          : {}),
        ...(dto.creditOnJoining !== undefined
          ? { creditOnJoining: dto.creditOnJoining }
          : {}),
        ...(dto.carryForwardAllowed !== undefined
          ? { carryForwardAllowed: dto.carryForwardAllowed }
          : {}),
        ...(dto.carryForwardLimit !== undefined
          ? {
              carryForwardLimit:
                dto.carryForwardLimit === null
                  ? null
                  : new Prisma.Decimal(dto.carryForwardLimit),
            }
          : {}),
        ...(dto.carryForwardExpiryMonths !== undefined
          ? { carryForwardExpiryMonths: dto.carryForwardExpiryMonths }
          : {}),
        ...(dto.encashUnusedBalance !== undefined
          ? { encashUnusedBalance: dto.encashUnusedBalance }
          : {}),
        ...(dto.maximumEncashmentDays !== undefined
          ? {
              maximumEncashmentDays:
                dto.maximumEncashmentDays === null
                  ? null
                  : new Prisma.Decimal(dto.maximumEncashmentDays),
            }
          : {}),
        ...(dto.negativeBalanceAllowed !== undefined
          ? { negativeBalanceAllowed: dto.negativeBalanceAllowed }
          : {}),
        ...(dto.minimumNoticeDays !== undefined
          ? { minimumNoticeDays: dto.minimumNoticeDays }
          : {}),
        ...(dto.minimumConsecutiveDays !== undefined
          ? {
              minimumConsecutiveDays:
                dto.minimumConsecutiveDays === null
                  ? null
                  : new Prisma.Decimal(dto.minimumConsecutiveDays),
            }
          : {}),
        ...(dto.allowDuringProbation !== undefined
          ? { allowDuringProbation: dto.allowDuringProbation }
          : {}),
        ...(dto.allowBackdatedRequests !== undefined
          ? { allowBackdatedRequests: dto.allowBackdatedRequests }
          : {}),
        ...(dto.maxBackdatedDays !== undefined
          ? { maxBackdatedDays: dto.maxBackdatedDays }
          : {}),
        ...(dto.allowFutureRequests !== undefined
          ? { allowFutureRequests: dto.allowFutureRequests }
          : {}),
        ...(dto.maxFutureDays !== undefined
          ? { maxFutureDays: dto.maxFutureDays }
          : {}),
        ...(dto.blockDuringNoticePeriod !== undefined
          ? { blockDuringNoticePeriod: dto.blockDuringNoticePeriod }
          : {}),
        ...(dto.requiresDocumentAfterDays !== undefined
          ? { requiresDocumentAfterDays: dto.requiresDocumentAfterDays }
          : {}),
        ...(dto.probationRestriction !== undefined
          ? { probationRestriction: dto.probationRestriction }
          : {}),
        ...(dto.genderRestriction !== undefined
          ? { genderRestriction: dto.genderRestriction }
          : {}),
        ...(dto.minServiceMonths !== undefined
          ? { minServiceMonths: dto.minServiceMonths }
          : {}),
        ...(dto.maxConsecutiveDays !== undefined
          ? {
              maxConsecutiveDays:
                dto.maxConsecutiveDays === null
                  ? null
                  : new Prisma.Decimal(dto.maxConsecutiveDays),
            }
          : {}),
        ...(dto.approvalRequired !== undefined
          ? { approvalRequired: dto.approvalRequired }
          : {}),
        ...(dto.approvalMatrixId !== undefined
          ? { approvalMatrixId: dto.approvalMatrixId }
          : {}),
        ...(dto.autoApproveUnderDays !== undefined
          ? {
              autoApproveUnderDays:
                dto.autoApproveUnderDays === null
                  ? null
                  : new Prisma.Decimal(dto.autoApproveUnderDays),
            }
          : {}),
        ...(dto.requireHrApproval !== undefined
          ? { requireHrApproval: dto.requireHrApproval }
          : {}),
        ...(dto.requirePayrollApproval !== undefined
          ? { requirePayrollApproval: dto.requirePayrollApproval }
          : {}),
        ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );
  }
  async deleteLeavePolicyRule(
    currentUser: AuthenticatedUser,
    policyId: string,
    ruleId: string,
  ) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);

    const existingRule = await this.leaveRepository.findLeavePolicyRuleById(
      currentUser.tenantId,
      policyId,
      ruleId,
    );

    if (!existingRule) {
      throw new NotFoundException('Leave policy rule not found.');
    }

    await this.leaveRepository.deleteLeavePolicyRule(
      currentUser.tenantId,
      policyId,
      ruleId,
    );

    return { ok: true };
  }

  listLeavePolicyAssignments(currentUser: AuthenticatedUser) {
    return this.leaveRepository.listLeavePolicyAssignments(
      currentUser.tenantId,
    );
  }

  async createLeavePolicyAssignment(
    currentUser: AuthenticatedUser,
    dto: CreateLeavePolicyAssignmentDto,
  ) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, dto.leavePolicyId);
    await this.validateLeavePolicyAssignment(currentUser.tenantId, dto);

    const assignment = await this.leaveRepository.createLeavePolicyAssignment({
      tenantId: currentUser.tenantId,
      leavePolicyId: dto.leavePolicyId,
      scopeType: dto.scopeType,
      scopeId: this.resolveAssignmentScopeId(dto),
      organizationId: dto.organizationId,
      businessUnitId: dto.businessUnitId,
      departmentId: dto.departmentId,
      employeeLevelId: dto.employeeLevelId,
      employeeId: dto.employeeId,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      priority: dto.priority ?? 0,
      isActive: dto.isActive ?? true,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    await this.reconcileEntitlementAfterAssignmentChange(currentUser.tenantId);
    return assignment;
  }

  /*
   * BUG-1967 — an assignment change is what allocates entitlement.
   *
   * Deliberately reconciles the whole tenant rather than the employees this
   * assignment names. An assignment change alters who wins for employees it
   * does not itself cover — deactivating a DEPARTMENT assignment promotes the
   * TENANT one for everyone in that department — and computing the affected set
   * exactly is harder than recomputing an answer that is idempotent anyway.
   *
   * Failure here must not fail the assignment write. The administrator's change
   * is saved and correct; entitlement is a derived consequence, and the next
   * assignment change reconciles it again. Losing the write to a reconciliation
   * error would be the worse outcome, so this logs and continues.
   */
  private async reconcileEntitlementAfterAssignmentChange(tenantId: string) {
    try {
      await this.entitlementService.reconcileTenant(tenantId, new Date());
    } catch (error) {
      this.logger.error(
        `Leave entitlement reconciliation failed for tenant ${tenantId}. ` +
          `The assignment was saved; balances are unchanged until the next ` +
          `assignment change or a manual reconcile.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async updateLeavePolicyAssignment(
    currentUser: AuthenticatedUser,
    assignmentId: string,
    dto: UpdateLeavePolicyAssignmentDto,
  ) {
    const existing = await this.leaveRepository.findLeavePolicyAssignmentById(
      currentUser.tenantId,
      assignmentId,
    );

    if (!existing) {
      throw new NotFoundException('Leave policy assignment not found.');
    }

    const next = {
      leavePolicyId: dto.leavePolicyId ?? existing.leavePolicyId,
      scopeType: dto.scopeType ?? existing.scopeType,
      scopeId: dto.scopeId === undefined ? existing.scopeId : dto.scopeId,
      organizationId:
        dto.organizationId === undefined
          ? existing.organizationId
          : dto.organizationId,
      businessUnitId:
        dto.businessUnitId === undefined
          ? existing.businessUnitId
          : dto.businessUnitId,
      departmentId:
        dto.departmentId === undefined
          ? existing.departmentId
          : dto.departmentId,
      employeeLevelId:
        dto.employeeLevelId === undefined
          ? existing.employeeLevelId
          : dto.employeeLevelId,
      employeeId:
        dto.employeeId === undefined ? existing.employeeId : dto.employeeId,
      effectiveFrom: dto.effectiveFrom ?? existing.effectiveFrom.toISOString(),
      effectiveTo:
        dto.effectiveTo === undefined
          ? (existing.effectiveTo?.toISOString() ?? undefined)
          : dto.effectiveTo,
      priority: dto.priority ?? existing.priority,
      isActive: dto.isActive ?? existing.isActive,
    };

    await this.ensureLeavePolicyExists(
      currentUser.tenantId,
      next.leavePolicyId,
    );
    await this.validateLeavePolicyAssignment(currentUser.tenantId, next);

    const result = await this.leaveRepository.updateLeavePolicyAssignment(
      currentUser.tenantId,
      assignmentId,
      {
        ...(dto.leavePolicyId !== undefined
          ? { leavePolicyId: dto.leavePolicyId }
          : {}),
        ...(dto.scopeType !== undefined ? { scopeType: dto.scopeType } : {}),
        ...(dto.scopeId !== undefined
          ? {
              scopeId: this.resolveAssignmentScopeId(next),
            }
          : next.scopeType === ApprovalScopes.TENANT
            ? { scopeId: null }
            : {}),
        ...(dto.organizationId !== undefined
          ? { organizationId: dto.organizationId }
          : {}),
        ...(dto.businessUnitId !== undefined
          ? { businessUnitId: dto.businessUnitId }
          : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId }
          : {}),
        ...(dto.employeeLevelId !== undefined
          ? { employeeLevelId: dto.employeeLevelId }
          : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        ...(dto.effectiveTo !== undefined
          ? { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Leave policy assignment not found.');
    }

    await this.reconcileEntitlementAfterAssignmentChange(currentUser.tenantId);
    return this.leaveRepository.findLeavePolicyAssignmentById(
      currentUser.tenantId,
      assignmentId,
    );
  }

  async deleteLeavePolicyAssignment(
    currentUser: AuthenticatedUser,
    assignmentId: string,
  ) {
    const result = await this.leaveRepository.updateLeavePolicyAssignment(
      currentUser.tenantId,
      assignmentId,
      { isActive: false, updatedById: currentUser.userId },
    );

    if (result.count === 0) {
      throw new NotFoundException('Leave policy assignment not found.');
    }

    await this.reconcileEntitlementAfterAssignmentChange(currentUser.tenantId);
    return { ok: true };
  }

  private async ensureLeavePolicyExists(tenantId: string, policyId: string) {
    const leavePolicy = await this.leaveRepository.findLeavePolicyById(
      tenantId,
      policyId,
    );

    if (!leavePolicy) {
      throw new NotFoundException('Leave policy not found.');
    }

    return leavePolicy;
  }

  private async ensureLeaveTypeExists(tenantId: string, leaveTypeId: string) {
    const leaveType = await this.leaveRepository.findLeaveTypeById(
      tenantId,
      leaveTypeId,
    );

    if (!leaveType) {
      throw new NotFoundException('Leave type not found.');
    }

    return leaveType;
  }

  private async processLeaveRequestDecision(
    currentUser: AuthenticatedUser,
    leaveRequestId: string,
    comments: string | undefined,
    action: 'approve' | 'reject',
  ) {
    const leaveRequest = await this.findLeaveRequestOrThrow(
      currentUser.tenantId,
      leaveRequestId,
    );

    /*
     * BUG-1970 — self-approval is refused here as well as in
     * `canUserActOnStep`, and it is refused before anything else.
     *
     * The reordering inside `canUserActOnStep` is what closes the hole; this
     * states the rule at the entry point so the decision does not depend on two
     * helpers continuing to agree, and so the caller is told what was actually
     * wrong instead of "you are not assigned to action this leave request".
     */
    if (leaveRequest.employee.userId === currentUser.userId) {
      throw new ForbiddenException(
        'You cannot approve or reject your own leave request.',
      );
    }

    if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending leave requests can be actioned.',
      );
    }

    const nextStepOrder = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    )?.stepOrder;
    const pendingStep = leaveRequest.approvalSteps.find(
      (step) =>
        step.status === LeaveApprovalStepStatus.PENDING &&
        step.stepOrder === nextStepOrder,
    );

    if (!pendingStep) {
      throw new ConflictException(
        'This leave request has no pending approval step.',
      );
    }

    const isAssignedApprover = this.canUserActOnStep(
      leaveRequest,
      pendingStep,
      currentUser,
    );

    if (
      !isAssignedApprover &&
      !(await this.canOverrideLeaveDecision(currentUser, leaveRequest))
    ) {
      throw new ForbiddenException(
        'You are not assigned to action this leave request.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.leaveRepository.updateLeaveApprovalStep(
        currentUser.tenantId,
        pendingStep.id,
        {
          status:
            action === 'approve'
              ? LeaveApprovalStepStatus.APPROVED
              : LeaveApprovalStepStatus.REJECTED,
          actedAt: new Date(),
          comments: comments?.trim(),
          approverUserId: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      if (
        action === 'approve' &&
        pendingStep.approvalMode === ApprovalModes.ANY_ONE &&
        pendingStep.approvalGroupKey
      ) {
        await tx.leaveApprovalStep.updateMany({
          where: {
            tenantId: currentUser.tenantId,
            leaveRequestId,
            approvalGroupKey: pendingStep.approvalGroupKey,
            status: LeaveApprovalStepStatus.PENDING,
            id: { not: pendingStep.id },
          },
          data: {
            status: LeaveApprovalStepStatus.SKIPPED,
            updatedById: currentUser.userId,
          },
        });
      }

      if (action === 'reject') {
        await this.leaveRepository.updateLeaveRequest(
          currentUser.tenantId,
          leaveRequestId,
          {
            status: LeaveRequestStatus.REJECTED,
            updatedById: currentUser.userId,
          },
          tx,
        );
      } else {
        const hasMorePendingSteps =
          (await tx.leaveApprovalStep.count({
            where: {
              tenantId: currentUser.tenantId,
              leaveRequestId,
              status: LeaveApprovalStepStatus.PENDING,
            },
          })) > 0;

        await this.leaveRepository.updateLeaveRequest(
          currentUser.tenantId,
          leaveRequestId,
          {
            status: hasMorePendingSteps
              ? LeaveRequestStatus.PENDING
              : LeaveRequestStatus.APPROVED,
            updatedById: currentUser.userId,
          },
          tx,
        );

        if (!hasMorePendingSteps) {
          await this.recordApprovedLeaveConsumption(
            { ...leaveRequest, status: LeaveRequestStatus.APPROVED },
            tx,
          );
        }
      }
    });

    const updated = await this.findLeaveRequestOrThrow(
      currentUser.tenantId,
      leaveRequestId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action:
        action === 'approve'
          ? 'LEAVE_REQUEST_APPROVED'
          : 'LEAVE_REQUEST_REJECTED',
      entityType: 'LeaveRequest',
      entityId: leaveRequestId,
      beforeSnapshot: this.mapLeaveRequest(leaveRequest, currentUser),
      afterSnapshot: this.mapLeaveRequest(updated, currentUser),
    });

    await this.syncGenericLeaveApproval(
      updated,
      currentUser,
      action === 'approve' ? 'APPROVED' : 'REJECTED',
      comments,
    );
    /*
     * BUG-2016 — before the outcome notification, not after. The step just
     * decided can no longer be acted on, so the request for that action is
     * retired first and the employee's "approved"/"rejected" row is then raised
     * against a clean slate.
     */
    await this.resolveOutstandingApprovalNotifications(
      currentUser.tenantId,
      leaveRequestId,
    );
    await this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey:
        action === 'approve'
          ? 'leave.request.approved.employee'
          : 'leave.request.rejected.employee',
      moduleKey: 'leave',
      actorUserId: currentUser.userId,
      relatedEntityType: 'leaveRequest',
      relatedEntityId: updated.id,
      relatedRecordNumber: updated.id,
      metadata: {
        employeeName: `${updated.employee.firstName} ${updated.employee.lastName}`,
        leaveTypeName: updated.leaveType.name,
        targetUrl: `/leaves/${updated.id}`,
      },
    });

    return this.mapLeaveRequest(updated, currentUser);
  }

  private async syncGenericLeaveApproval(
    leaveRequest: LeaveRequestWithRelations,
    currentUser: AuthenticatedUser,
    actionType: 'SUBMITTED' | 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    const currentPendingStep = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    );
    const request = await this.prisma.approvalRequest.upsert({
      where: {
        tenantId_moduleKey_entityType_entityId: {
          tenantId: currentUser.tenantId,
          moduleKey: 'leave',
          entityType: 'leaveRequest',
          entityId: leaveRequest.id,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        moduleKey: 'leave',
        entityType: 'leaveRequest',
        entityId: leaveRequest.id,
        requestNumber: leaveRequest.id,
        title: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} - ${leaveRequest.leaveType.name}`,
        submittedByUserId: leaveRequest.createdById ?? currentUser.userId,
        submittedForEmployeeId: leaveRequest.employeeId,
        status: mapLeaveToApprovalStatus(leaveRequest.status),
        currentStepId: null,
        createdAtUtc: leaveRequest.createdAt,
        submittedAtUtc: leaveRequest.createdAt,
        completedAtUtc:
          leaveRequest.status === LeaveRequestStatus.PENDING
            ? null
            : leaveRequest.updatedAt,
        metadata: { source: 'leave' },
      },
      update: {
        status: mapLeaveToApprovalStatus(leaveRequest.status),
        completedAtUtc:
          leaveRequest.status === LeaveRequestStatus.PENDING
            ? null
            : leaveRequest.updatedAt,
      },
      include: { steps: true },
    });

    for (const step of leaveRequest.approvalSteps) {
      const genericStep = await this.prisma.approvalStep.upsert({
        where: {
          approvalRequestId_stepOrder: {
            approvalRequestId: request.id,
            stepOrder: step.stepOrder,
          },
        },
        create: {
          tenantId: currentUser.tenantId,
          approvalRequestId: request.id,
          stepOrder: step.stepOrder,
          stepName: `Step ${step.stepOrder}`,
          approverResolverType: step.approverUserId
            ? NotificationRecipientResolverType.CUSTOM_USER
            : step.approverRoleId
              ? NotificationRecipientResolverType.CUSTOM_ROLE
              : NotificationRecipientResolverType.REPORTING_MANAGER,
          status: mapLeaveStepStatus(step.status),
          startedAtUtc: step.createdAt,
          completedAtUtc: step.actedAt,
          metadata: { leaveApprovalStepId: step.id },
        },
        update: {
          status: mapLeaveStepStatus(step.status),
          completedAtUtc: step.actedAt,
          metadata: { leaveApprovalStepId: step.id },
        },
      });

      if (step.approverUserId || step.approverRoleId) {
        await this.prisma.approvalAssignment.upsert({
          where: {
            id:
              (
                await this.prisma.approvalAssignment.findFirst({
                  where: {
                    tenantId: currentUser.tenantId,
                    approvalStepId: genericStep.id,
                    assignedToUserId: step.approverUserId ?? undefined,
                    assignedToRoleId: step.approverRoleId ?? undefined,
                  },
                  select: { id: true },
                })
              )?.id ?? '__new_assignment__',
          },
          create: {
            tenantId: currentUser.tenantId,
            approvalRequestId: request.id,
            approvalStepId: genericStep.id,
            assignedToUserId: step.approverUserId,
            assignedToRoleId: step.approverRoleId,
            status: mapLeaveAssignmentStatus(step.status),
            assignedAtUtc: step.createdAt,
            actionedAtUtc: step.actedAt,
            metadata: { leaveApprovalStepId: step.id },
          },
          update: {
            status: mapLeaveAssignmentStatus(step.status),
            actionedAtUtc: step.actedAt,
          },
        });
      }
    }

    if (currentPendingStep) {
      const genericCurrentStep = await this.prisma.approvalStep.findFirst({
        where: {
          approvalRequestId: request.id,
          stepOrder: currentPendingStep.stepOrder,
        },
        select: { id: true },
      });
      await this.prisma.approvalRequest.update({
        where: { id: request.id },
        data: { currentStepId: genericCurrentStep?.id ?? null },
      });
    }

    await this.prisma.approvalAction.create({
      data: {
        tenantId: currentUser.tenantId,
        approvalRequestId: request.id,
        actionType,
        actionByUserId: currentUser.userId,
        comment: comment?.trim() || null,
        actionAtUtc: new Date(),
        actionTimeZone: null,
        metadata: { source: 'leave' },
      },
    });
  }

  private async findLeaveRequestOrThrow(
    tenantId: string,
    leaveRequestId: string,
  ) {
    const leaveRequest = await this.leaveRepository.findLeaveRequestById(
      tenantId,
      leaveRequestId,
    );

    if (!leaveRequest) {
      throw new NotFoundException(
        'Leave request was not found for this tenant.',
      );
    }

    return leaveRequest;
  }

  private async recordApprovedLeaveConsumption(
    leaveRequest: LeaveRequestWithRelations,
    db: Prisma.TransactionClient,
  ) {
    if (leaveRequest.status !== LeaveRequestStatus.APPROVED) {
      return;
    }

    const existingConsumption = await db.leaveConsumptionRecord.findFirst({
      where: {
        tenantId: leaveRequest.tenantId,
        leaveRequestId: leaveRequest.id,
      },
      select: { id: true },
    });

    if (existingConsumption) {
      return;
    }

    await db.leaveConsumptionRecord.create({
      data: {
        tenantId: leaveRequest.tenantId,
        employeeId: leaveRequest.employeeId,
        leaveRequestId: leaveRequest.id,
        leaveTypeId: leaveRequest.leaveTypeId,
        days: leaveRequest.totalDays,
        isPaid: leaveRequest.leaveType.isPaid,
      },
    });

    await db.leaveBalance.upsert({
      where: {
        tenantId_employeeId_leaveTypeId: {
          tenantId: leaveRequest.tenantId,
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
        },
      },
      create: {
        tenantId: leaveRequest.tenantId,
        employeeId: leaveRequest.employeeId,
        leaveTypeId: leaveRequest.leaveTypeId,
        totalAllocated: new Prisma.Decimal(0),
        totalUsed: leaveRequest.totalDays,
        totalRemaining: new Prisma.Decimal(0).minus(leaveRequest.totalDays),
        lastUpdatedAt: new Date(),
      },
      update: {
        totalUsed: { increment: leaveRequest.totalDays },
        totalRemaining: { decrement: leaveRequest.totalDays },
        lastUpdatedAt: new Date(),
      },
    });
  }

  private async buildApprovalSteps(
    tenantId: string,
    employee: {
      id: string;
      departmentId?: string | null;
      businessUnitId?: string | null;
      employeeLevelId?: string | null;
      managerEmployeeId: string | null;
      manager: {
        id: string;
        userId: string | null;
      } | null;
    },
    leavePolicyId: string | null,
    leaveTypeId: string,
    duration: Prisma.Decimal,
    actorUserId: string,
  ) {
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId,
      moduleKey: ApprovalModules.LEAVE_REQUEST,
      recordType: 'leaveRequest',
      requesterEmployee: employee,
      scopeContext: {
        employeeId: employee.id,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
      },
      conditionContext: {
        leavePolicyId,
        leaveTypeId,
        duration: duration.toString(),
      },
      fallback: [
        { type: 'REPORTING_MANAGER' },
        { type: 'ROLE', roleKey: 'hr' },
      ],
    });
    const approvalSteps: Prisma.LeaveApprovalStepUncheckedCreateWithoutLeaveRequestInput[] =
      [];

    for (const step of route) {
      for (const candidateUserId of step.candidateUserIds) {
        approvalSteps.push({
          tenantId,
          stepOrder: step.sequence,
          approverType: step.approverType,
          resolvedApproverType: step.approverType,
          approverUserId: candidateUserId,
          approverRoleId: step.approverRoleId,
          approvalMode: step.approvalMode,
          approvalGroupKey: step.approvalGroupKey,
          createdById: actorUserId,
          updatedById: actorUserId,
        });
      }
    }

    // `stepOrder` is a number now that the array is typed; the `Number()`
    // coercion was only there because every field was `unknown`.
    return approvalSteps.sort((a, b) => a.stepOrder - b.stepOrder);
  }

  /*
   * Moved to `LeavePolicyResolverService` (EXECPLAN-0026). Entitlement
   * allocation has to answer exactly this question, and answering it in two
   * places is how the allocated number and the enforced number drift apart.
   * Kept as a private wrapper so the call sites below read unchanged.
   */
  private resolveApplicableLeavePolicy(
    tenantId: string,
    employee: {
      id: string;
      departmentId?: string | null;
      businessUnitId?: string | null;
      employeeLevelId?: string | null;
    },
    at: Date,
  ) {
    return this.policyResolver.resolveApplicableLeavePolicy(
      tenantId,
      employee,
      at,
    );
  }

  private validateAndCalculateRange(startDateRaw: string, endDateRaw: string) {
    const startDate = new Date(startDateRaw);
    const endDate = new Date(endDateRaw);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Start date and end date must be valid.');
    }

    if (endDate < startDate) {
      throw new BadRequestException(
        'Leave request end date cannot be before start date.',
      );
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const totalDays =
      Math.floor(
        (endDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) /
          millisecondsPerDay,
      ) + 1;

    return {
      startDate: new Date(startDateRaw),
      endDate: new Date(endDateRaw),
      totalDays: new Prisma.Decimal(totalDays),
    };
  }

  private canUserActOnRequest(
    leaveRequest: LeaveRequestWithRelations,
    currentUser: AuthenticatedUser,
  ) {
    const nextStepOrder = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    )?.stepOrder;
    const pendingStep =
      leaveRequest.approvalSteps.find(
        (step) =>
          step.status === LeaveApprovalStepStatus.PENDING &&
          step.stepOrder === nextStepOrder &&
          this.canUserActOnStep(leaveRequest, step, currentUser),
      ) ??
      leaveRequest.approvalSteps.find(
        (step) =>
          step.status === LeaveApprovalStepStatus.PENDING &&
          step.stepOrder === nextStepOrder,
      );

    if (!pendingStep) {
      return false;
    }

    return this.canUserActOnStep(leaveRequest, pendingStep, currentUser);
  }

  /**
   * Rejects a request whose dates collide with a live request for the same
   * employee.
   *
   * Without this an employee can hold an approved leave and a duplicate pending
   * one for the same days, which double-counts the balance and leaves approvers
   * acting on days that are already booked.
   */
  private async assertNoOverlappingLeave(
    tenantId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRequestId?: string,
  ) {
    const clashes = await this.leaveRepository.findOverlappingLeaveRequests(
      tenantId,
      employeeId,
      startDate,
      endDate,
      excludeLeaveRequestId,
    );

    if (clashes.length === 0) {
      return;
    }

    const clash = clashes[0];
    const formatted = `${clash.startDate.toISOString().slice(0, 10)} to ${clash.endDate
      .toISOString()
      .slice(0, 10)}`;

    throw new ConflictException(
      `These dates overlap an existing ${clash.status.toLowerCase()} ${
        clash.leaveType?.name ?? 'leave'
      } request for ${formatted}. Cancel that request first or choose different dates.`,
    );
  }

  private canUserActOnStep(
    leaveRequest: LeaveRequestWithRelations,
    pendingStep: LeaveRequestWithRelations['approvalSteps'][number],
    currentUser: AuthenticatedUser,
  ) {
    /*
     * BUG-1970 — the self-requester test comes first, before any role path.
     *
     * It used to come second, after `hasElevatedTenantRole`, which made
     * self-approval reachable for a global-admin or system-admin: they are the
     * requester and the assigned-approver answer at once, and
     * `processLeaveRequestDecision` treats a true answer here as "assigned
     * approver" and so never consults `canOverrideLeaveDecision` — which does
     * order the two checks correctly. The override check was therefore not a
     * second line of defence on that path; it was unreachable.
     *
     * An elevated role widens *which* records a user may act on. It is not an
     * exemption from the self-approval prohibition, and the elevated-role bypass
     * may not be widened without an explicit decision. `attendance.service.ts`
     * bars both parties to a correction before any permission or role path, for
     * exactly this reason.
     */
    if (leaveRequest.employee.userId === currentUser.userId) {
      return false;
    }

    if (hasElevatedTenantRole(currentUser)) {
      return true;
    }

    if (pendingStep.approverUserId) {
      return pendingStep.approverUserId === currentUser.userId;
    }

    return false;
  }

  private canViewAllTenantLeaveRequests(currentUser: AuthenticatedUser) {
    return (
      hasElevatedTenantRole(currentUser) ||
      currentUser.permissionKeys.includes('leave-requests.manage') ||
      currentUser.permissionKeys.includes('leaves.manage')
    );
  }

  /**
   * Whether the user may decide or cancel this request without being the
   * assigned approver.
   *
   * This is the HR override. It is deliberately scoped: the requesting employee
   * must fall inside the user's own leave-request access scope, so an
   * organization-scoped HR user cannot reach another organization's records.
   * Nobody may action their own request.
   */
  private async canOverrideLeaveDecision(
    currentUser: AuthenticatedUser,
    leaveRequest: LeaveRequestWithRelations,
  ) {
    if (leaveRequest.employee.userId === currentUser.userId) {
      return false;
    }

    if (hasElevatedTenantRole(currentUser)) {
      return true;
    }

    const canDecide =
      currentUser.permissionKeys.includes('leave-requests.approve') ||
      currentUser.permissionKeys.includes('leave-requests.reject');

    if (!canDecide) {
      return false;
    }

    // Capability comes from the leave permissions above; reach comes from the
    // employee read scope, which is the same scope used to list people.
    const visible = await this.prisma.employee.findFirst({
      where: {
        AND: [
          {
            id: leaveRequest.employeeId,
            tenantId: currentUser.tenantId,
            isDeleted: false,
          },
          buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
            currentUser,
            ENTITY_KEYS.EMPLOYEES,
            SecurityPrivilege.READ,
            { organizationIdField: null, userIdField: 'userId' },
          ),
        ],
      },
      select: { id: true },
    });

    return Boolean(visible);
  }

  private async canReadLeaveRequest(
    currentUser: AuthenticatedUser,
    leaveRequest: LeaveRequestWithRelations,
  ) {
    if (this.canViewAllTenantLeaveRequests(currentUser)) {
      return true;
    }

    if (leaveRequest.employee.userId === currentUser.userId) {
      return true;
    }

    if (
      leaveRequest.approvalSteps.some(
        (step) => step.approverUserId === currentUser.userId,
      )
    ) {
      return true;
    }

    const currentEmployee =
      await this.employeesRepository.findByUserIdAndTenant(
        currentUser.tenantId,
        currentUser.userId,
      );
    if (!currentEmployee) {
      return false;
    }

    const reportIds = await this.resolveReportingHierarchyEmployeeIds(
      currentUser.tenantId,
      currentEmployee.id,
    );
    return reportIds.includes(leaveRequest.employeeId);
  }

  private async resolveReportingHierarchyEmployeeIds(
    tenantId: string,
    managerEmployeeId: string,
  ) {
    const visited = new Set<string>();
    const queue = [managerEmployeeId];

    while (queue.length > 0) {
      const currentManagerId = queue.shift();
      if (!currentManagerId) continue;

      const directReports = await this.employeesRepository.findDirectReports(
        tenantId,
        currentManagerId,
      );

      for (const report of directReports) {
        if (visited.has(report.id)) continue;
        visited.add(report.id);
        queue.push(report.id);
      }
    }

    return [...visited];
  }

  private async validateLeavePolicyAssignment(
    tenantId: string,
    dto: LeavePolicyAssignmentShape & {
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
  ) {
    const scopeId = this.resolveAssignmentScopeId(dto);

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('Effective from date must be valid.');
    }

    if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
      throw new BadRequestException('Effective to date must be valid.');
    }

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'Effective to date cannot be before effective from date.',
      );
    }

    await this.assertAssignmentScopeBelongsToTenant(
      tenantId,
      dto.scopeType,
      scopeId,
    );
  }

  private resolveAssignmentScopeId(dto: LeavePolicyAssignmentShape) {
    if (dto.scopeType === ApprovalScopes.TENANT) return null;
    const byScope = {
      [ApprovalScopes.ORGANIZATION]: dto.organizationId,
      [ApprovalScopes.BUSINESS_UNIT]: dto.businessUnitId,
      [ApprovalScopes.DEPARTMENT]: dto.departmentId,
      [ApprovalScopes.EMPLOYEE_LEVEL]: dto.employeeLevelId,
      [ApprovalScopes.EMPLOYEE]: dto.employeeId,
    } as Record<string, string | null | undefined>;
    const scopeId = byScope[dto.scopeType] ?? dto.scopeId;
    if (!scopeId?.trim()) {
      throw new BadRequestException('Scope ID is required for this scope.');
    }
    return scopeId;
  }

  private async assertAssignmentScopeBelongsToTenant(
    tenantId: string,
    scopeType: string,
    scopeId: string | null,
  ) {
    if (scopeType === ApprovalScopes.TENANT) return;
    const exists =
      scopeType === ApprovalScopes.ORGANIZATION
        ? await this.prisma.organization.count({
            where: { tenantId, id: scopeId ?? '' },
          })
        : scopeType === ApprovalScopes.BUSINESS_UNIT
          ? await this.prisma.businessUnit.count({
              where: { tenantId, id: scopeId ?? '' },
            })
          : scopeType === ApprovalScopes.DEPARTMENT
            ? await this.prisma.department.count({
                where: { tenantId, id: scopeId ?? '' },
              })
            : scopeType === ApprovalScopes.EMPLOYEE_LEVEL
              ? await this.prisma.employeeLevel.count({
                  where: { tenantId, id: scopeId ?? '' },
                })
              : scopeType === ApprovalScopes.EMPLOYEE
                ? await this.prisma.employee.count({
                    where: { tenantId, id: scopeId ?? '', isDeleted: false },
                  })
                : 0;
    if (!exists) {
      throw new BadRequestException(
        'Selected assignment scope does not belong to this tenant.',
      );
    }
  }

  private validateLeavePolicyRule(dto: Partial<CreateLeavePolicyRuleDto>) {
    if (!dto.accrualType?.trim()) {
      throw new BadRequestException('Accrual type is required.');
    }

    if (dto.entitlementDays !== undefined && Number(dto.entitlementDays) < 0) {
      throw new BadRequestException('Entitlement days cannot be negative.');
    }

    if (
      dto.negativeBalanceAllowed &&
      dto.maximumNegativeBalance === undefined
    ) {
      throw new BadRequestException(
        'Maximum negative balance is required when negative balance is allowed.',
      );
    }

    if (
      dto.maximumNegativeBalance !== undefined &&
      Number(dto.maximumNegativeBalance) < 0
    ) {
      throw new BadRequestException(
        'Maximum negative balance cannot be negative.',
      );
    }

    if (
      dto.accrualType !== 'NONE' &&
      dto.accrualAmount !== undefined &&
      Number(dto.accrualAmount) < 0
    ) {
      throw new BadRequestException('Accrual amount cannot be negative.');
    }

    if (
      dto.accrualDay !== undefined &&
      (dto.accrualDay < 1 || dto.accrualDay > 31)
    ) {
      throw new BadRequestException('Accrual day must be between 1 and 31.');
    }

    if (
      !dto.carryForwardAllowed &&
      dto.carryForwardLimit !== undefined &&
      Number(dto.carryForwardLimit) > 0
    ) {
      throw new ConflictException(
        'Carry forward limit can only be set when carry forward is allowed.',
      );
    }

    if (
      dto.carryForwardLimit !== undefined &&
      Number(dto.carryForwardLimit) < 0
    ) {
      throw new BadRequestException('Carry forward limit cannot be negative.');
    }

    if (
      dto.requiresDocumentAfterDays !== undefined &&
      dto.requiresDocumentAfterDays < 0
    ) {
      throw new BadRequestException(
        'Document requirement days cannot be negative.',
      );
    }

    if (dto.minServiceMonths !== undefined && dto.minServiceMonths < 0) {
      throw new BadRequestException(
        'Minimum service months cannot be negative.',
      );
    }

    if (
      dto.maxConsecutiveDays !== undefined &&
      Number(dto.maxConsecutiveDays) < 0
    ) {
      throw new BadRequestException(
        'Maximum consecutive days cannot be negative.',
      );
    }

    if (
      dto.minimumConsecutiveDays !== undefined &&
      dto.maxConsecutiveDays !== undefined &&
      Number(dto.maxConsecutiveDays) < Number(dto.minimumConsecutiveDays)
    ) {
      throw new BadRequestException(
        'Maximum consecutive days cannot be less than minimum consecutive days.',
      );
    }

    if (dto.allowBackdatedRequests && dto.maxBackdatedDays === undefined) {
      throw new BadRequestException(
        'Maximum backdated days is required when backdated requests are allowed.',
      );
    }

    if (dto.maxBackdatedDays !== undefined && dto.maxBackdatedDays < 0) {
      throw new BadRequestException(
        'Maximum backdated days cannot be negative.',
      );
    }

    if (dto.allowFutureRequests && dto.maxFutureDays === undefined) {
      throw new BadRequestException(
        'Maximum future days is required when future requests are allowed.',
      );
    }

    if (dto.maxFutureDays !== undefined && dto.maxFutureDays < 0) {
      throw new BadRequestException('Maximum future days cannot be negative.');
    }

    if (
      dto.autoApproveUnderDays !== undefined &&
      Number(dto.autoApproveUnderDays) < 0
    ) {
      throw new BadRequestException('Auto approve days cannot be negative.');
    }
  }

  private validateLeaveType(dto: Partial<CreateLeaveTypeDto>) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Leave type name is required.');
    }

    if (!dto.category?.trim()) {
      throw new BadRequestException('Leave category is required.');
    }

    if (dto.category.trim().toUpperCase() === 'UNPAID' && dto.isPaid === true) {
      throw new ConflictException(
        'Paid Leave must be false when leave category is Unpaid.',
      );
    }
  }

  private mapLeaveRequest(
    leaveRequest: LeaveRequestWithRelations,
    currentUser: AuthenticatedUser,
  ) {
    const pendingStep = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    );

    return {
      id: leaveRequest.id,
      tenantId: leaveRequest.tenantId,
      employeeId: leaveRequest.employeeId,
      leaveTypeId: leaveRequest.leaveTypeId,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      totalDays: leaveRequest.totalDays,
      reason: leaveRequest.reason,
      status: leaveRequest.status,
      attachmentRequired: leaveRequest.attachmentRequired,
      attachmentReference: leaveRequest.attachmentReference,
      documents: leaveRequest.documentLinks.map((link) => ({
        id: link.document.id,
        documentType: link.document.documentType,
        documentCategory: link.document.documentCategory,
        title: link.document.title,
        originalFileName: link.document.originalFileName,
        mimeType: link.document.mimeType,
        sizeInBytes: link.document.sizeInBytes,
        uploadedByUser: link.document.uploadedByUser
          ? {
              ...link.document.uploadedByUser,
              fullName: `${link.document.uploadedByUser.firstName} ${link.document.uploadedByUser.lastName}`,
            }
          : null,
        createdAt: link.document.createdAt,
        viewPath: `/api/documents/${link.document.id}/view`,
        downloadPath: `/api/documents/${link.document.id}/download`,
      })),
      createdAt: leaveRequest.createdAt,
      updatedAt: leaveRequest.updatedAt,
      employee: {
        id: leaveRequest.employee.id,
        employeeCode: leaveRequest.employee.employeeCode,
        firstName: leaveRequest.employee.firstName,
        lastName: leaveRequest.employee.lastName,
        preferredName: leaveRequest.employee.preferredName,
        fullName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
      },
      leaveType: leaveRequest.leaveType,
      approvalSteps: leaveRequest.approvalSteps.map((step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        approverType: step.approverType,
        approverUserId: step.approverUserId,
        approverRoleId: step.approverRoleId,
        approvalMode: step.approvalMode,
        approvalGroupKey: step.approvalGroupKey,
        resolvedApproverType: step.resolvedApproverType,
        status: step.status,
        actedAt: step.actedAt,
        comments: step.comments,
        approverUser: step.approverUser,
      })),
      pendingStep: pendingStep
        ? {
            id: pendingStep.id,
            stepOrder: pendingStep.stepOrder,
            approverType: pendingStep.approverType,
            approverUserId: pendingStep.approverUserId,
          }
        : null,
      canCurrentUserApprove: pendingStep
        ? this.canUserActOnStep(leaveRequest, pendingStep, currentUser)
        : false,
      canCurrentUserReject: pendingStep
        ? this.canUserActOnStep(leaveRequest, pendingStep, currentUser)
        : false,
      canCurrentUserCancel:
        leaveRequest.employee.userId === currentUser.userId &&
        leaveRequest.status === LeaveRequestStatus.PENDING,
    };
  }

  private handleUniqueError(error: unknown, entityLabel: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `${entityLabel} name or code is already in use for this tenant.`,
      );
    }

    throw error;
  }
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Export column order is fixed so downstream spreadsheets and any re-import
 * see a stable contract regardless of how rows are built.
 */
const LEAVE_EXPORT_COLUMNS = [
  'Employee Code',
  'Employee Name',
  'Leave Type',
  'Start Date',
  'End Date',
  'Total Days',
  'Status',
  'Reason',
  'Documents',
  'Submitted At',
] as const;

/** Columns an import file must supply; mirrors the submit payload. */
const LEAVE_IMPORT_TEMPLATE_COLUMNS = [
  'employeeCode',
  'leaveType',
  'startDate',
  'endDate',
  'reason',
] as const;
