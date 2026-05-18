import {
  ApprovalActorType,
  LeaveApprovalStepStatus,
  LeaveRequestStatus,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLeavePolicyRuleDto } from './dto/create-leave-policy-rule.dto';
import { UpdateLeavePolicyRuleDto } from './dto/update-leave-policy-rule.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hasElevatedTenantRole } from '../../common/security/elevated-tenant-roles';
import { AuditService } from '../audit/audit.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { UsersRepository } from '../users/users.repository';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { CreateApprovalMatrixDto } from './dto/create-approval-matrix.dto';
import { CreateLeavePolicyAssignmentDto } from './dto/create-leave-policy-assignment.dto';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { SubmitLeaveRequestDto } from './dto/submit-leave-request.dto';
import { UpdateApprovalMatrixDto } from './dto/update-approval-matrix.dto';
import { UpdateLeavePolicyAssignmentDto } from './dto/update-leave-policy-assignment.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveRepository, LeaveRequestWithRelations } from './leave.repository';
import { ApprovalResolverService } from './approval-resolver.service';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

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

const ApprovalActors = {
  LINE_MANAGER: 'LINE_MANAGER',
  ROLE: 'ROLE',
  USER: 'USER',
} as const;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRepository: LeaveRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
    private readonly approvalResolver: ApprovalResolverService,
    private readonly notificationOrchestrator: NotificationOrchestratorService,
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

  async createLeaveType(
    currentUser: AuthenticatedUser,
    dto: CreateLeaveTypeDto,
  ) {
    try {
      return await this.leaveRepository.createLeaveType({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        category: dto.category.trim(),
        isPaid: dto.isPaid ?? true,
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
        ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
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

  findApprovalMatrices(tenantId: string, query: ListLeaveConfigDto) {
    return this.leaveRepository.findApprovalMatrices(tenantId, query);
  }

  async findApprovalMatrixById(tenantId: string, id: string) {
    const approvalMatrix = await this.leaveRepository.findApprovalMatrixById(
      tenantId,
      id,
    );

    if (!approvalMatrix) {
      throw new NotFoundException(
        'Approval matrix entry was not found for this tenant.',
      );
    }

    return approvalMatrix;
  }

  async createApprovalMatrix(
    currentUser: AuthenticatedUser,
    dto: CreateApprovalMatrixDto,
  ) {
    const moduleKey = dto.moduleKey ?? ApprovalModules.LEAVE_REQUEST;
    this.validateApprovalMatrixConfiguration(dto);
    await this.validateApprovalMatrixReferences(
      currentUser.tenantId,
      dto.leaveTypeId,
      dto.leavePolicyId,
      dto.approverRoleId,
      dto.approverUserId,
    );

    await this.ensureApprovalMatrixIsUnique(currentUser.tenantId, {
      moduleKey,
      leaveTypeId:
        moduleKey === ApprovalModules.LEAVE_REQUEST
          ? (dto.leaveTypeId ?? null)
          : null,
      leavePolicyId:
        moduleKey === ApprovalModules.LEAVE_REQUEST
          ? (dto.leavePolicyId ?? null)
          : null,
      scopeType: dto.scopeType ?? null,
      scopeId: dto.scopeId ?? null,
      sequence: dto.sequence,
      approverType: dto.approverType,
      approverRoleId: dto.approverRoleId ?? null,
      approverUserId: dto.approverUserId ?? null,
      isActive: dto.isActive ?? true,
    });

    return this.leaveRepository.createApprovalMatrix({
      tenantId: currentUser.tenantId,
      moduleKey,
      name: dto.name.trim(),
      leaveTypeId:
        moduleKey === ApprovalModules.LEAVE_REQUEST ? dto.leaveTypeId : null,
      leavePolicyId:
        moduleKey === ApprovalModules.LEAVE_REQUEST ? dto.leavePolicyId : null,
      sequence: dto.sequence,
      approverType: dto.approverType,
      approverRoleId:
        dto.approverType === ApprovalActors.ROLE ? dto.approverRoleId : null,
      approverUserId:
        dto.approverType === ApprovalActors.USER ? dto.approverUserId : null,
      approvalMode: dto.approvalMode ?? ApprovalModes.ANY_ONE,
      scopeType: dto.scopeType,
      scopeId: dto.scopeType === ApprovalScopes.TENANT ? null : dto.scopeId,
      isActive: dto.isActive ?? true,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });
  }

  async updateApprovalMatrix(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateApprovalMatrixDto,
  ) {
    const existing = await this.findApprovalMatrixById(
      currentUser.tenantId,
      id,
    );
    const nextModuleKey = dto.moduleKey ?? existing.moduleKey;
    const nextApproverType = dto.approverType ?? existing.approverType;
    const rawNextApproverRoleId =
      dto.approverRoleId === undefined
        ? existing.approverRoleId
        : dto.approverRoleId;
    const rawNextApproverUserId =
      dto.approverUserId === undefined
        ? existing.approverUserId
        : dto.approverUserId;
    const nextApproverRoleId =
      nextApproverType === ApprovalActors.ROLE ? rawNextApproverRoleId : null;
    const nextApproverUserId =
      nextApproverType === ApprovalActors.USER ? rawNextApproverUserId : null;
    const nextScopeType =
      dto.scopeType === undefined ? existing.scopeType : dto.scopeType;
    const nextScopeId =
      dto.scopeId === undefined ? existing.scopeId : dto.scopeId;
    const nextLeaveTypeId =
      nextModuleKey === ApprovalModules.LEAVE_REQUEST
        ? dto.leaveTypeId === undefined
          ? existing.leaveTypeId
          : dto.leaveTypeId
        : null;
    const nextLeavePolicyId =
      nextModuleKey === ApprovalModules.LEAVE_REQUEST
        ? dto.leavePolicyId === undefined
          ? existing.leavePolicyId
          : dto.leavePolicyId
        : null;

    this.validateApprovalMatrixConfiguration({
      moduleKey: nextModuleKey,
      name: dto.name ?? existing.name,
      leaveTypeId: nextLeaveTypeId ?? undefined,
      leavePolicyId: nextLeavePolicyId ?? undefined,
      sequence: dto.sequence ?? existing.sequence,
      approverType: nextApproverType as CreateApprovalMatrixDto['approverType'],
      approverRoleId: nextApproverRoleId ?? undefined,
      approverUserId: nextApproverUserId ?? undefined,
      approvalMode: dto.approvalMode ?? existing.approvalMode,
      scopeType: nextScopeType ?? undefined,
      scopeId: nextScopeId ?? undefined,
      isActive: dto.isActive ?? existing.isActive,
    });

    await this.validateApprovalMatrixReferences(
      currentUser.tenantId,
      nextLeaveTypeId ?? undefined,
      nextLeavePolicyId ?? undefined,
      nextApproverRoleId ?? undefined,
      nextApproverUserId ?? undefined,
    );

    const nextSequence = dto.sequence ?? existing.sequence;
    const nextIsActive = dto.isActive ?? existing.isActive;

    await this.ensureApprovalMatrixIsUnique(
      currentUser.tenantId,
      {
        moduleKey: nextModuleKey,
        leaveTypeId: nextLeaveTypeId,
        leavePolicyId: nextLeavePolicyId,
        scopeType: nextScopeType,
        scopeId: nextScopeType === ApprovalScopes.TENANT ? null : nextScopeId,
        sequence: nextSequence,
        approverType: nextApproverType,
        approverRoleId: nextApproverRoleId,
        approverUserId: nextApproverUserId,
        isActive: nextIsActive,
      },
      id,
    );

    const result = await this.leaveRepository.updateApprovalMatrix(
      currentUser.tenantId,
      id,
      {
        ...(dto.moduleKey !== undefined ? { moduleKey: dto.moduleKey } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        leaveTypeId: nextLeaveTypeId,
        leavePolicyId: nextLeavePolicyId,
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.approverType !== undefined
          ? { approverType: dto.approverType }
          : {}),
        ...(dto.approverRoleId !== undefined
          ? { approverRoleId: dto.approverRoleId }
          : {}),
        ...(dto.approverUserId !== undefined
          ? { approverUserId: dto.approverUserId }
          : {}),
        ...(dto.approvalMode !== undefined
          ? { approvalMode: dto.approvalMode }
          : {}),
        ...(dto.scopeType !== undefined ? { scopeType: dto.scopeType } : {}),
        scopeId: nextScopeType === ApprovalScopes.TENANT ? null : nextScopeId,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException(
        'Approval matrix entry was not found for this tenant.',
      );
    }

    return this.findApprovalMatrixById(currentUser.tenantId, id);
  }

  async deleteApprovalMatrix(currentUser: AuthenticatedUser, id: string) {
    await this.findApprovalMatrixById(currentUser.tenantId, id);

    const result = await this.leaveRepository.deactivateApprovalMatrix(
      currentUser.tenantId,
      id,
      currentUser.userId,
    );

    if (result.count === 0) {
      throw new NotFoundException(
        'Approval matrix entry was not found for this tenant.',
      );
    }

    return { ok: true };
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

    const leavePolicy = await this.resolveApplicableLeavePolicy(
      currentUser.tenantId,
      employee,
      new Date(),
    );

    if (leavePolicy) {
      const leavePolicyRule =
        await this.leaveRepository.findLeavePolicyRuleByPolicyAndLeaveType(
          currentUser.tenantId,
          leavePolicy.id,
          leaveType.id,
        );

      if (!leavePolicyRule || !leavePolicyRule.isActive) {
        throw new BadRequestException(
          'The assigned leave policy does not have an active rule for this leave type.',
        );
      }
    }

    const { startDate, endDate, totalDays } = this.validateAndCalculateRange(
      dto.startDate,
      dto.endDate,
    );

    const approvalSteps = await this.buildApprovalSteps(
      currentUser.tenantId,
      employee,
      leavePolicy?.id ?? null,
      leaveType.id,
      currentUser.userId,
    );

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
          attachmentRequired: false,
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

    return this.mapLeaveRequest(leaveRequest, currentUser);
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

    const leavePolicy = await this.resolveApplicableLeavePolicy(
      currentUser.tenantId,
      employee,
      new Date(),
    );

    if (!leavePolicy) {
      return {
        status: 'NO_APPLICABLE_POLICY' as const,
        leaveTypes: [],
      };
    }

    const activeRules = await this.leaveRepository.listActiveLeavePolicyRules(
      currentUser.tenantId,
      leavePolicy.id,
    );

    return {
      status:
        activeRules.length > 0
          ? ('AVAILABLE' as const)
          : ('NO_ACTIVE_TYPES' as const),
      leavePolicy: {
        id: leavePolicy.id,
        name: leavePolicy.name,
      },
      leaveTypes: activeRules.map((rule) => ({
        id: rule.leaveType.id,
        name: rule.leaveType.name,
        code: rule.leaveType.code,
        category: rule.leaveType.category,
        requiresApproval: rule.approvalRequired,
        isPaid: rule.isPaid,
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

    await this.notificationOrchestrator.dispatch({
      tenantId: currentUser.tenantId,
      eventCode: 'LEAVE_APPROVAL_REQUEST',
      channels: [NotificationChannel.IN_APP],
      sourceModule: 'leave',
      correlationId: leaveRequest.id,
      requestedByUserId: currentUser.userId,
      inApp: {
        title: 'Leave request awaiting approval',
        body: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} submitted a leave request.`,
        targetUrl: '/leaves?view=pendingApprovals',
        recipientUserIds,
        payload: {
          leaveRequestId: leaveRequest.id,
          employeeId: leaveRequest.employeeId,
        },
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

  async listTeamLeaveRequests(
    currentUser: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ) {
    if (this.canManageTenantLeaveRequests(currentUser)) {
      const tenantRequests =
        await this.leaveRepository.findLeaveRequestsByTenant(
          currentUser.tenantId,
          query,
        );

      return tenantRequests.map((request) =>
        this.mapLeaveRequest(request, currentUser),
      );
    }

    const currentEmployee = await this.employeesRepository.findByUserIdAndTenant(
      currentUser.tenantId,
      currentUser.userId,
    );
    if (!currentEmployee) {
      return [];
    }

    const directReports = await this.employeesRepository.findDirectReports(
      currentUser.tenantId,
      currentEmployee.id,
    );
    const reportIds = directReports.map((employee) => employee.id);
    if (reportIds.length === 0) {
      return [];
    }

    const teamRequests = await this.leaveRepository.findLeaveRequestsByEmployees(
      currentUser.tenantId,
      reportIds,
      query,
    );

    return teamRequests
      .map((request) => this.mapLeaveRequest(request, currentUser));
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

    if (
      !this.canManageTenantLeaveRequests(currentUser) &&
      (!employee || leaveRequest.employeeId !== employee.id)
    ) {
      throw new ForbiddenException(
        'You can only cancel your own leave requests.',
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

    return this.mapLeaveRequest(updated, currentUser);
  }

  async listLeavePolicyRules(currentUser: AuthenticatedUser, policyId: string) {
    await this.ensureLeavePolicyExists(currentUser.tenantId, policyId);

    return this.leaveRepository.listLeavePolicyRules(
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
        accrualType: dto.accrualType,
        accrualFrequency: dto.accrualFrequency,
        carryForwardAllowed: dto.carryForwardAllowed ?? false,
        carryForwardLimit:
          dto.carryForwardLimit !== undefined
            ? new Prisma.Decimal(dto.carryForwardLimit)
            : undefined,
        negativeBalanceAllowed: dto.negativeBalanceAllowed ?? false,
        requiresDocumentAfterDays: dto.requiresDocumentAfterDays,
        probationRestriction: dto.probationRestriction ?? false,
        genderRestriction: dto.genderRestriction,
        minServiceMonths: dto.minServiceMonths,
        maxConsecutiveDays:
          dto.maxConsecutiveDays !== undefined
            ? new Prisma.Decimal(dto.maxConsecutiveDays)
            : undefined,
        approvalRequired: dto.approvalRequired ?? true,
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
        ...(dto.accrualType !== undefined
          ? { accrualType: dto.accrualType }
          : {}),
        ...(dto.accrualFrequency !== undefined
          ? { accrualFrequency: dto.accrualFrequency }
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
        ...(dto.negativeBalanceAllowed !== undefined
          ? { negativeBalanceAllowed: dto.negativeBalanceAllowed }
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
    this.validateLeavePolicyAssignment(dto);

    return this.leaveRepository.createLeavePolicyAssignment({
      tenantId: currentUser.tenantId,
      leavePolicyId: dto.leavePolicyId,
      scopeType: dto.scopeType,
      scopeId: dto.scopeType === ApprovalScopes.TENANT ? null : dto.scopeId,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      priority: dto.priority ?? 0,
      isActive: dto.isActive ?? true,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });
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
    this.validateLeavePolicyAssignment(next);

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
              scopeId:
                next.scopeType === ApprovalScopes.TENANT ? null : dto.scopeId,
            }
          : next.scopeType === ApprovalScopes.TENANT
            ? { scopeId: null }
            : {}),
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
        step.stepOrder === nextStepOrder &&
        this.canUserActOnStep(leaveRequest, step, currentUser),
    );

    if (!pendingStep) {
      throw new ConflictException(
        'This leave request has no pending approval step.',
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

    return this.mapLeaveRequest(updated, currentUser);
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
    actorUserId: string,
  ) {
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId,
      moduleKey: ApprovalModules.LEAVE_REQUEST,
      requesterEmployee: employee,
      leavePolicyId,
      leaveTypeId,
      scopeContext: {
        employeeId: employee.id,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
      },
    });
    const approvalSteps: Array<Record<string, unknown>> = [];

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

    return approvalSteps.sort(
      (a, b) => Number(a.stepOrder) - Number(b.stepOrder),
    );
  }

  private async resolveApplicableLeavePolicy(
    tenantId: string,
    employee: {
      id: string;
      departmentId?: string | null;
      businessUnitId?: string | null;
      employeeLevelId?: string | null;
    },
    at: Date,
  ) {
    const assignments =
      await this.leaveRepository.findActiveLeavePolicyAssignments(tenantId, at);
    const businessUnit = employee.businessUnitId
      ? await (this.prisma as any).businessUnit.findFirst({
          where: { id: employee.businessUnitId, tenantId },
          select: { organizationId: true },
        })
      : null;

    const specificity = [
      { scopeType: ApprovalScopes.EMPLOYEE, scopeId: employee.id, rank: 6 },
      {
        scopeType: ApprovalScopes.EMPLOYEE_LEVEL,
        scopeId: employee.employeeLevelId,
        rank: 5,
      },
      {
        scopeType: ApprovalScopes.DEPARTMENT,
        scopeId: employee.departmentId,
        rank: 4,
      },
      {
        scopeType: ApprovalScopes.BUSINESS_UNIT,
        scopeId: employee.businessUnitId,
        rank: 3,
      },
      {
        scopeType: ApprovalScopes.ORGANIZATION,
        scopeId: businessUnit?.organizationId,
        rank: 2,
      },
      { scopeType: ApprovalScopes.TENANT, scopeId: null, rank: 1 },
    ];

    const matches = assignments
      .filter((assignment) => assignment.leavePolicy?.isActive)
      .map((assignment) => {
        const matchedScope = specificity.find(
          (scope) =>
            assignment.scopeType === scope.scopeType &&
            (scope.scopeType === ApprovalScopes.TENANT ||
              assignment.scopeId === scope.scopeId),
        );

        return matchedScope ? { assignment, rank: matchedScope.rank } : null;
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.rank !== right.rank) return right.rank - left.rank;
        if (left.assignment.priority !== right.assignment.priority) {
          return right.assignment.priority - left.assignment.priority;
        }

        return (
          right.assignment.effectiveFrom.getTime() -
          left.assignment.effectiveFrom.getTime()
        );
      });

    return matches[0]?.assignment.leavePolicy ?? null;
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

  private canUserActOnStep(
    leaveRequest: LeaveRequestWithRelations,
    pendingStep: LeaveRequestWithRelations['approvalSteps'][number],
    currentUser: AuthenticatedUser,
  ) {
    if (this.canManageTenantLeaveRequests(currentUser)) {
      return true;
    }

    if (pendingStep.approverUserId) {
      return pendingStep.approverUserId === currentUser.userId;
    }

    return false;
  }

  private canManageTenantLeaveRequests(currentUser: AuthenticatedUser) {
    return (
      hasElevatedTenantRole(currentUser) ||
      currentUser.permissionKeys.includes('leave-requests.approve') ||
      currentUser.permissionKeys.includes('leave-requests.reject')
    );
  }

  private async validateApprovalMatrixReferences(
    tenantId: string,
    leaveTypeId?: string,
    leavePolicyId?: string,
    approverRoleId?: string,
    approverUserId?: string,
  ) {
    if (leaveTypeId) {
      const leaveType = await this.leaveRepository.findLeaveTypeById(
        tenantId,
        leaveTypeId,
      );

      if (!leaveType) {
        throw new BadRequestException(
          'Selected leave type does not belong to this tenant.',
        );
      }
    }

    if (leavePolicyId) {
      const leavePolicy = await this.leaveRepository.findLeavePolicyById(
        tenantId,
        leavePolicyId,
      );

      if (!leavePolicy) {
        throw new BadRequestException(
          'Selected leave policy does not belong to this tenant.',
        );
      }
    }

    if (approverRoleId) {
      const role = await this.leaveRepository.findRoleById(
        tenantId,
        approverRoleId,
      );

      if (!role) {
        throw new BadRequestException(
          'Selected approver role does not belong to this tenant.',
        );
      }
    }

    if (approverUserId) {
      const user = await this.leaveRepository.findUserById(
        tenantId,
        approverUserId,
      );

      if (!user) {
        throw new BadRequestException(
          'Selected approver user does not belong to this tenant.',
        );
      }
    }
  }

  private validateApprovalMatrixConfiguration(
    dto: Partial<CreateApprovalMatrixDto>,
  ) {
    if (dto.moduleKey && dto.moduleKey !== ApprovalModules.LEAVE_REQUEST) {
      dto.leaveTypeId = undefined;
      dto.leavePolicyId = undefined;
    }

    if (dto.approverType === ApprovalActors.ROLE && !dto.approverRoleId) {
      throw new BadRequestException('Role approver requires a selected role.');
    }

    if (dto.approverType === ApprovalActors.USER && !dto.approverUserId) {
      throw new BadRequestException('User approver requires a selected user.');
    }

    if (dto.scopeType && dto.scopeType !== ApprovalScopes.TENANT) {
      if (!dto.scopeId?.trim()) {
        throw new BadRequestException(
          'Scope ID is required for this approval scope.',
        );
      }
    }
  }

  private async ensureApprovalMatrixIsUnique(
    tenantId: string,
    data: {
      leaveTypeId?: string | null;
      leavePolicyId?: string | null;
      moduleKey: string;
      scopeType?: string | null;
      scopeId?: string | null;
      sequence: number;
      approverType: ApprovalActorType;
      approverRoleId?: string | null;
      approverUserId?: string | null;
      isActive: boolean;
    },
    excludeId?: string,
  ) {
    if (!data.isActive) {
      return;
    }

    const duplicate = await this.leaveRepository.findConflictingApprovalMatrix(
      tenantId,
      {
        ...data,
        excludeId,
      },
    );

    if (duplicate) {
      throw new ConflictException(
        'An approval matrix row already exists for this scope, sequence, and approver.',
      );
    }
  }

  private validateLeavePolicyAssignment(
    dto: Pick<
      CreateLeavePolicyAssignmentDto,
      'scopeType' | 'scopeId' | 'effectiveFrom' | 'effectiveTo'
    >,
  ) {
    if (dto.scopeType !== ApprovalScopes.TENANT && !dto.scopeId?.trim()) {
      throw new BadRequestException('Scope ID is required for this scope.');
    }

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
  }

  private validateLeavePolicyRule(dto: Partial<CreateLeavePolicyRuleDto>) {
    if (!dto.accrualType?.trim()) {
      throw new BadRequestException('Accrual type is required.');
    }

    if (dto.entitlementDays !== undefined && Number(dto.entitlementDays) < 0) {
      throw new BadRequestException('Entitlement days cannot be negative.');
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
