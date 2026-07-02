import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalActionType,
  ApprovalAssignmentStatus,
  ApprovalRequestStatus,
  GenericApprovalStepStatus,
  NotificationRecipientResolverType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(user: AuthenticatedUser, query: Record<string, string>) {
    this.assertCanReadApprovals(user);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = this.buildWhere(user, query);

    const [items, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        include: {
          submittedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          submittedForEmployee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          steps: {
            include: {
              assignments: {
                include: {
                  assignedToUser: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                  assignedToRole: {
                    select: { id: true, name: true, key: true },
                  },
                },
              },
            },
            orderBy: { stepOrder: 'asc' },
          },
        },
        orderBy: [{ submittedAtUtc: 'desc' }, { createdAtUtc: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        currentStep:
          item.steps.find((step) => step.id === item.currentStepId) ??
          item.steps.find((step) => step.status === 'PENDING') ??
          null,
        relatedRecordUrl: this.relatedRecordUrl(
          item.moduleKey,
          item.entityType,
          item.entityId,
        ),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    this.assertCanReadApprovals(user);
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId: user.tenantId, ...this.relevantScope(user) },
      include: {
        submittedByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        submittedForEmployee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
        steps: {
          include: {
            assignments: {
              include: {
                assignedToUser: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
                assignedToRole: { select: { id: true, name: true, key: true } },
              },
            },
            actions: {
              include: {
                actionByUser: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: { actionAtUtc: 'asc' },
            },
          },
          orderBy: { stepOrder: 'asc' },
        },
        actions: {
          include: {
            actionByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { actionAtUtc: 'asc' },
        },
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval request was not found.');
    }

    return {
      item: {
        ...approval,
        relatedRecordUrl: this.relatedRecordUrl(
          approval.moduleKey,
          approval.entityType,
          approval.entityId,
        ),
      },
    };
  }

  async createWorkflow(
    input: {
      user: AuthenticatedUser;
      moduleKey: string;
      entityType: string;
      entityId: string;
      requestNumber?: string | null;
      title: string;
      submittedForEmployeeId?: string | null;
      steps: Array<{
        sequence: number;
        approvalMode: 'ANY_ONE' | 'ALL';
        approverRoleId?: string | null;
        candidateUserIds: string[];
      }>;
      metadata?: Prisma.InputJsonObject;
    },
    db?: Prisma.TransactionClient,
  ) {
    if (input.steps.length === 0) {
      throw new BadRequestException(
        'No active approval matrix could be resolved for this request.',
      );
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.approvalRequest.findUnique({
        where: {
          tenantId_moduleKey_entityType_entityId: {
            tenantId: input.user.tenantId,
            moduleKey: input.moduleKey,
            entityType: input.entityType,
            entityId: input.entityId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'An approval workflow already exists for this record.',
        );
      }

      const request = await tx.approvalRequest.create({
        data: {
          tenantId: input.user.tenantId,
          moduleKey: input.moduleKey,
          entityType: input.entityType,
          entityId: input.entityId,
          requestNumber: input.requestNumber ?? null,
          title: input.title,
          submittedByUserId: input.user.userId,
          submittedForEmployeeId: input.submittedForEmployeeId ?? null,
          status: ApprovalRequestStatus.PENDING,
          submittedAtUtc: new Date(),
          metadata: input.metadata,
        },
      });

      let currentStepId: string | null = null;
      for (const [index, routeStep] of input.steps.entries()) {
        const step = await tx.approvalStep.create({
          data: {
            tenantId: input.user.tenantId,
            approvalRequestId: request.id,
            stepOrder: routeStep.sequence,
            stepName: `Step ${routeStep.sequence}`,
            approverResolverType: routeStep.approverRoleId
              ? NotificationRecipientResolverType.CUSTOM_ROLE
              : NotificationRecipientResolverType.CUSTOM_USER,
            status:
              index === 0
                ? GenericApprovalStepStatus.PENDING
                : GenericApprovalStepStatus.NOT_STARTED,
            startedAtUtc: index === 0 ? new Date() : null,
            metadata: { approvalMode: routeStep.approvalMode },
          },
        });
        if (index === 0) currentStepId = step.id;
        await tx.approvalAssignment.createMany({
          data: routeStep.candidateUserIds.map((userId) => ({
            tenantId: input.user.tenantId,
            approvalRequestId: request.id,
            approvalStepId: step.id,
            assignedToUserId: userId,
            assignedToRoleId: routeStep.approverRoleId ?? null,
            status: ApprovalAssignmentStatus.PENDING,
            metadata: { approvalMode: routeStep.approvalMode },
          })),
        });
      }

      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { currentStepId },
      });
      await tx.approvalAction.create({
        data: {
          tenantId: input.user.tenantId,
          approvalRequestId: request.id,
          actionType: ApprovalActionType.SUBMITTED,
          actionByUserId: input.user.userId,
          metadata: { source: input.moduleKey },
        },
      });
      const created = await tx.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      await this.auditService.log(
        {
          tenantId: input.user.tenantId,
          actorUserId: input.user.userId,
          action: 'APPROVAL_WORKFLOW_CREATED',
          entityType: 'ApprovalRequest',
          entityId: request.id,
          sourceModule: input.moduleKey,
          scope: {
            approvedEntityType: input.entityType,
            approvedEntityId: input.entityId,
          },
          afterSnapshot: created,
        },
        tx,
      );
      return created;
    };
    return db ? execute(db) : this.prisma.$transaction(execute);
  }

  async action(
    input: {
      user: AuthenticatedUser;
      approvalRequestId: string;
      action: 'APPROVED' | 'REJECTED';
      comment?: string;
    },
    db?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, tenantId: input.user.tenantId },
        include: {
          steps: {
            include: { assignments: true },
            orderBy: { stepOrder: 'asc' },
          },
        },
      });
      if (!request)
        throw new NotFoundException('Approval request was not found.');
      if (
        request.status !== ApprovalRequestStatus.PENDING ||
        !request.currentStepId
      ) {
        throw new ConflictException(
          'Only a pending approval request can be actioned.',
        );
      }
      const step = request.steps.find(
        (item) => item.id === request.currentStepId,
      );
      if (!step || step.status !== GenericApprovalStepStatus.PENDING) {
        throw new ConflictException(
          'The current approval step is not pending.',
        );
      }
      const assignment = step.assignments.find(
        (item) =>
          item.assignedToUserId === input.user.userId &&
          item.status === ApprovalAssignmentStatus.PENDING,
      );
      if (!assignment) {
        throw new ForbiddenException(
          'This approval step is not assigned to you.',
        );
      }

      const now = new Date();
      const assignmentStatus =
        input.action === 'APPROVED'
          ? ApprovalAssignmentStatus.APPROVED
          : ApprovalAssignmentStatus.REJECTED;
      await tx.approvalAssignment.update({
        where: { id: assignment.id },
        data: { status: assignmentStatus, actionedAtUtc: now },
      });

      let requestStatus: ApprovalRequestStatus = ApprovalRequestStatus.PENDING;
      let currentStepId: string | null = step.id;
      if (input.action === 'REJECTED') {
        await tx.approvalStep.update({
          where: { id: step.id },
          data: {
            status: GenericApprovalStepStatus.REJECTED,
            completedAtUtc: now,
          },
        });
        requestStatus = ApprovalRequestStatus.REJECTED;
        currentStepId = null;
      } else {
        const approvalMode = readApprovalMode(step.metadata);
        const remaining = step.assignments.filter(
          (item) =>
            item.id !== assignment.id &&
            item.status === ApprovalAssignmentStatus.PENDING,
        );
        const stepComplete =
          approvalMode === 'ANY_ONE' || remaining.length === 0;
        if (stepComplete) {
          if (approvalMode === 'ANY_ONE' && remaining.length) {
            await tx.approvalAssignment.updateMany({
              where: { id: { in: remaining.map((item) => item.id) } },
              data: {
                status: ApprovalAssignmentStatus.SUPERSEDED,
                actionedAtUtc: now,
              },
            });
          }
          await tx.approvalStep.update({
            where: { id: step.id },
            data: {
              status: GenericApprovalStepStatus.APPROVED,
              completedAtUtc: now,
            },
          });
          const nextStep = request.steps.find(
            (item) => item.stepOrder > step.stepOrder,
          );
          if (nextStep) {
            await tx.approvalStep.update({
              where: { id: nextStep.id },
              data: {
                status: GenericApprovalStepStatus.PENDING,
                startedAtUtc: now,
              },
            });
            currentStepId = nextStep.id;
          } else {
            requestStatus = ApprovalRequestStatus.APPROVED;
            currentStepId = null;
          }
        }
      }

      const updated = await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: requestStatus,
          currentStepId,
          completedAtUtc:
            requestStatus === ApprovalRequestStatus.PENDING ? null : now,
        },
      });
      await tx.approvalAction.create({
        data: {
          tenantId: input.user.tenantId,
          approvalRequestId: request.id,
          approvalStepId: step.id,
          approvalAssignmentId: assignment.id,
          actionType:
            input.action === 'APPROVED'
              ? ApprovalActionType.APPROVED
              : ApprovalActionType.REJECTED,
          actionByUserId: input.user.userId,
          comment: input.comment?.trim() || null,
          actionAtUtc: now,
        },
      });
      await this.auditService.log(
        {
          tenantId: input.user.tenantId,
          actorUserId: input.user.userId,
          action: `APPROVAL_${input.action}`,
          entityType: 'ApprovalRequest',
          entityId: request.id,
          sourceModule: request.moduleKey,
          scope: {
            approvedEntityType: request.entityType,
            approvedEntityId: request.entityId,
            approvalStepId: step.id,
          },
          beforeSnapshot: {
            status: request.status,
            currentStepId: request.currentStepId,
          },
          afterSnapshot: {
            status: updated.status,
            currentStepId: updated.currentStepId,
          },
        },
        tx,
      );
      return updated;
    };
    return db ? execute(db) : this.prisma.$transaction(execute);
  }

  async cancel(
    input: {
      user: AuthenticatedUser;
      approvalRequestId: string;
      comment?: string;
    },
    db?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, tenantId: input.user.tenantId },
      });
      if (!request)
        throw new NotFoundException('Approval request was not found.');
      if (request.status !== ApprovalRequestStatus.PENDING)
        throw new ConflictException(
          'Only a pending approval request can be cancelled.',
        );
      if (
        request.submittedByUserId !== input.user.userId &&
        !input.user.permissionKeys?.includes('approvals.manage')
      )
        throw new ForbiddenException(
          'You cannot cancel this approval request.',
        );

      const now = new Date();
      await tx.approvalAssignment.updateMany({
        where: {
          approvalRequestId: request.id,
          status: ApprovalAssignmentStatus.PENDING,
        },
        data: {
          status: ApprovalAssignmentStatus.SUPERSEDED,
          actionedAtUtc: now,
        },
      });
      if (request.currentStepId) {
        await tx.approvalStep.update({
          where: { id: request.currentStepId },
          data: {
            status: GenericApprovalStepStatus.SKIPPED,
            completedAtUtc: now,
          },
        });
      }
      const updated = await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          currentStepId: null,
          completedAtUtc: now,
        },
      });
      await tx.approvalAction.create({
        data: {
          tenantId: input.user.tenantId,
          approvalRequestId: request.id,
          approvalStepId: request.currentStepId,
          actionType: ApprovalActionType.CANCELLED,
          actionByUserId: input.user.userId,
          comment: input.comment?.trim() || null,
          actionAtUtc: now,
        },
      });
      await this.auditService.log(
        {
          tenantId: input.user.tenantId,
          actorUserId: input.user.userId,
          action: 'APPROVAL_CANCELLED',
          entityType: 'ApprovalRequest',
          entityId: request.id,
          sourceModule: request.moduleKey,
          beforeSnapshot: { status: request.status },
          afterSnapshot: { status: updated.status },
        },
        tx,
      );
      return updated;
    };
    return db ? execute(db) : this.prisma.$transaction(execute);
  }

  private buildWhere(
    user: AuthenticatedUser,
    query: Record<string, string>,
  ): Prisma.ApprovalRequestWhereInput {
    const where: Prisma.ApprovalRequestWhereInput = {
      tenantId: user.tenantId,
      ...this.relevantScope(user),
      ...(query.moduleKey ? { moduleKey: query.moduleKey.toLowerCase() } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.status
        ? { status: query.status as ApprovalRequestStatus }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              {
                requestNumber: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    if (query.view === 'pending') {
      where.assignments = {
        some: { assignedToUserId: user.userId, status: 'PENDING' },
      };
    }
    if (query.view === 'submitted') {
      where.submittedByUserId = user.userId;
    }
    if (query.view === 'approved') {
      where.status = ApprovalRequestStatus.APPROVED;
    }
    if (query.view === 'rejected') {
      where.status = ApprovalRequestStatus.REJECTED;
    }
    if (query.view === 'escalated') {
      where.status = ApprovalRequestStatus.ESCALATED;
    }

    return where;
  }

  private relevantScope(
    user: AuthenticatedUser,
  ): Prisma.ApprovalRequestWhereInput {
    const permissions = new Set(user.permissionKeys ?? []);
    if (permissions.has('approvals.manage')) return {};
    if (permissions.has('approvals.readTeam')) {
      return {};
    }

    return {
      OR: [
        { submittedByUserId: user.userId },
        { assignments: { some: { assignedToUserId: user.userId } } },
      ],
    };
  }

  private assertCanReadApprovals(user: AuthenticatedUser) {
    const permissions = new Set(user.permissionKeys ?? []);
    if (
      permissions.has('approvals.read') ||
      permissions.has('approvals.readOwn') ||
      permissions.has('approvals.readAssigned') ||
      permissions.has('approvals.readTeam') ||
      permissions.has('approvals.manage')
    ) {
      return;
    }

    throw new ForbiddenException({
      code: 'ACCESS_DENIED',
      message: 'You do not have permission to read approvals.',
    });
  }

  private relatedRecordUrl(
    moduleKey: string,
    entityType: string,
    entityId: string,
  ) {
    if (moduleKey === 'leave') return `/leaves/${entityId}`;
    if (
      moduleKey === 'attendance' &&
      entityType === 'attendanceCorrectionRequest'
    )
      return `/attendance/corrections/${entityId}`;
    if (moduleKey === 'attendance')
      return `/attendance?recordId=${encodeURIComponent(entityId)}`;
    if (moduleKey === 'employee') return `/employees/${entityId}`;
    if (moduleKey === 'claim') return `/claims/${entityId}`;
    if (moduleKey === 'loan') return `/loans/${entityId}`;
    if (moduleKey === 'payroll') return `/payroll/runs/${entityId}`;
    return '/dashboard/approvals';
  }
}

function readApprovalMode(value: Prisma.JsonValue | null): 'ANY_ONE' | 'ALL' {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.approvalMode === 'ALL' ? 'ALL' : 'ANY_ONE';
  }
  return 'ANY_ONE';
}
