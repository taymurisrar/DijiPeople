import {
  ApprovalActorType,
  LeaveApprovalStepStatus,
  LeaveRequestStatus,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { UsersRepository } from '../users/users.repository';
import { CancelLeaveRequestDto } from './dto/cancel-leave-request.dto';
import { CreateApprovalMatrixDto } from './dto/create-approval-matrix.dto';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { ListLeaveConfigDto } from './dto/list-leave-config.dto';
import { SubmitLeaveRequestDto } from './dto/submit-leave-request.dto';
import { UpdateApprovalMatrixDto } from './dto/update-approval-matrix.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import {
  LeaveRepository,
  LeaveRequestWithRelations,
} from './leave.repository';

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRepository: LeaveRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
  ) {}

  findLeaveTypes(tenantId: string, query: ListLeaveConfigDto) {
    return this.leaveRepository.findLeaveTypes(tenantId, query);
  }

  async findLeaveTypeById(tenantId: string, id: string) {
    const leaveType = await this.leaveRepository.findLeaveTypeById(tenantId, id);

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
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
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
    this.validatePolicyRules(dto.carryForwardAllowed, dto.carryForwardLimit);

    try {
      return await this.leaveRepository.createLeavePolicy({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        accrualType: dto.accrualType,
        annualEntitlement: new Prisma.Decimal(dto.annualEntitlement),
        carryForwardAllowed: dto.carryForwardAllowed ?? false,
        carryForwardLimit:
          dto.carryForwardLimit !== undefined
            ? new Prisma.Decimal(dto.carryForwardLimit)
            : undefined,
        negativeBalanceAllowed: dto.negativeBalanceAllowed ?? false,
        genderRestriction: dto.genderRestriction,
        probationRestriction: dto.probationRestriction,
        requiresDocumentAfterDays: dto.requiresDocumentAfterDays,
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
    const existing = await this.findLeavePolicyById(currentUser.tenantId, id);
    const carryForwardAllowed =
      dto.carryForwardAllowed ?? existing.carryForwardAllowed;
    const carryForwardLimit =
      dto.carryForwardLimit !== undefined
        ? dto.carryForwardLimit
        : existing.carryForwardLimit
          ? Number(existing.carryForwardLimit)
          : undefined;

    this.validatePolicyRules(carryForwardAllowed, carryForwardLimit);

    const result = await this.leaveRepository.updateLeavePolicy(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.accrualType !== undefined
          ? { accrualType: dto.accrualType }
          : {}),
        ...(dto.annualEntitlement !== undefined
          ? { annualEntitlement: new Prisma.Decimal(dto.annualEntitlement) }
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
        ...(dto.genderRestriction !== undefined
          ? { genderRestriction: dto.genderRestriction ?? null }
          : {}),
        ...(dto.probationRestriction !== undefined
          ? { probationRestriction: dto.probationRestriction }
          : {}),
        ...(dto.requiresDocumentAfterDays !== undefined
          ? { requiresDocumentAfterDays: dto.requiresDocumentAfterDays }
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
    await this.validateApprovalMatrixReferences(
      currentUser.tenantId,
      dto.leaveTypeId,
      dto.leavePolicyId,
    );

    return this.leaveRepository.createApprovalMatrix({
      tenantId: currentUser.tenantId,
      name: dto.name.trim(),
      leaveTypeId: dto.leaveTypeId,
      leavePolicyId: dto.leavePolicyId,
      sequence: dto.sequence,
      approverType: dto.approverType,
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
    const existing = await this.findApprovalMatrixById(currentUser.tenantId, id);

    await this.validateApprovalMatrixReferences(
      currentUser.tenantId,
      dto.leaveTypeId === undefined ? existing.leaveTypeId ?? undefined : dto.leaveTypeId ?? undefined,
      dto.leavePolicyId === undefined ? existing.leavePolicyId ?? undefined : dto.leavePolicyId ?? undefined,
    );

    const result = await this.leaveRepository.updateApprovalMatrix(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.leaveTypeId !== undefined ? { leaveTypeId: dto.leaveTypeId } : {}),
        ...(dto.leavePolicyId !== undefined ? { leavePolicyId: dto.leavePolicyId } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.approverType !== undefined ? { approverType: dto.approverType } : {}),
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

    if (!leaveType) {
      throw new BadRequestException(
        'Selected leave type does not belong to this tenant.',
      );
    }

    const { startDate, endDate, totalDays } = this.validateAndCalculateRange(
      dto.startDate,
      dto.endDate,
    );

    const approvalSteps = await this.buildApprovalSteps(
      currentUser.tenantId,
      employee,
      leaveType.id,
      currentUser.userId,
    );

    const leaveRequest = await this.prisma.$transaction(async (tx) => {
      return this.leaveRepository.createLeaveRequest(
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
    });

    return this.mapLeaveRequest(leaveRequest, currentUser);
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

    return requests.map((request) => this.mapLeaveRequest(request, currentUser));
  }

  async listTeamLeaveRequests(
    currentUser: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ) {
    const pendingRequests = await this.leaveRepository.findPendingLeaveRequestsForTeam(
      currentUser.tenantId,
    );

    return pendingRequests
      .filter((request) => this.canUserActOnRequest(request, currentUser))
      .filter((request) => (query.status ? request.status === query.status : true))
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

    if (!employee || leaveRequest.employeeId !== employee.id) {
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

    const pendingStep = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
    );

    if (!pendingStep) {
      throw new ConflictException(
        'This leave request has no pending approval step.',
      );
    }

    if (!this.canUserActOnStep(leaveRequest, pendingStep, currentUser)) {
      throw new ForbiddenException(
        'You are not allowed to act on this approval step.',
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
        const hasMorePendingSteps = leaveRequest.approvalSteps.some(
          (step) =>
            step.status === LeaveApprovalStepStatus.PENDING &&
            step.id !== pendingStep.id,
        );

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

  private async findLeaveRequestOrThrow(tenantId: string, leaveRequestId: string) {
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

  private async buildApprovalSteps(
    tenantId: string,
    employee: {
      id: string;
      managerEmployeeId: string | null;
      manager: {
        id: string;
        userId: string | null;
      } | null;
    },
    leaveTypeId: string,
    actorUserId: string,
  ) {
    const configuredMatrices = await this.leaveRepository.findApprovalMatricesForLeaveType(
      tenantId,
      leaveTypeId,
    );

    const leaveTypeSpecific = configuredMatrices.filter(
      (matrix) => matrix.leaveTypeId === leaveTypeId,
    );

    const matricesToUse =
      leaveTypeSpecific.length > 0
        ? leaveTypeSpecific
        : configuredMatrices.filter((matrix) => matrix.leaveTypeId === null);

    const stepsSource =
      matricesToUse.length > 0
        ? matricesToUse
        : [
            {
              sequence: 1,
              approverType: employee.managerEmployeeId
                ? ApprovalActorType.MANAGER
                : ApprovalActorType.HR,
            },
            ...(employee.managerEmployeeId
              ? [{ sequence: 2, approverType: ApprovalActorType.HR }]
              : []),
          ];

    const approvalSteps: Prisma.LeaveApprovalStepUncheckedCreateWithoutLeaveRequestInput[] =
      [];

    for (const [index, step] of stepsSource.entries()) {
      if (step.approverType === ApprovalActorType.MANAGER) {
        if (!employee.manager || !employee.manager.userId) {
          continue;
        }

        approvalSteps.push({
          tenantId,
          stepOrder: step.sequence ?? index + 1,
          approverType: ApprovalActorType.MANAGER,
          approverUserId: employee.manager.userId,
          createdById: actorUserId,
          updatedById: actorUserId,
        });
        continue;
      }

      approvalSteps.push({
        tenantId,
        stepOrder: step.sequence ?? index + 1,
        approverType: ApprovalActorType.HR,
        approverUserId: null,
        createdById: actorUserId,
        updatedById: actorUserId,
      });
    }

    return approvalSteps.sort((a, b) => a.stepOrder - b.stepOrder);
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
    const totalDays = Math.floor(
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
    const pendingStep = leaveRequest.approvalSteps.find(
      (step) => step.status === LeaveApprovalStepStatus.PENDING,
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
    if (pendingStep.approverType === ApprovalActorType.MANAGER) {
      return pendingStep.approverUserId === currentUser.userId;
    }

    return (
      pendingStep.approverType === ApprovalActorType.HR &&
      currentUser.permissionKeys.includes('leave-requests.approve')
    );
  }

  private async validateApprovalMatrixReferences(
    tenantId: string,
    leaveTypeId?: string,
    leavePolicyId?: string,
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
  }

  private validatePolicyRules(
    carryForwardAllowed?: boolean,
    carryForwardLimit?: number,
  ) {
    if (!carryForwardAllowed && carryForwardLimit !== undefined) {
      throw new ConflictException(
        'Carry forward limit can only be set when carry forward is allowed.',
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
      canCurrentUserApprove:
        pendingStep?.approverType === ApprovalActorType.MANAGER
          ? pendingStep.approverUserId === currentUser.userId
          : pendingStep?.approverType === ApprovalActorType.HR &&
            currentUser.permissionKeys.includes('leave-requests.approve'),
      canCurrentUserReject:
        pendingStep?.approverType === ApprovalActorType.MANAGER
          ? pendingStep.approverUserId === currentUser.userId
          : pendingStep?.approverType === ApprovalActorType.HR &&
            currentUser.permissionKeys.includes('leave-requests.reject'),
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
