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
import { satisfiesPermissionRequirement } from '../../common/security/permission-evaluation';
import { AuditService } from '../audit/audit.service';
import {
  ApprovalDecisionRegistry,
  type ApprovalDecisionAction,
} from './approval-decision.registry';
import type { ListApprovalsQueryDto } from './dto/approval-decision.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
  ) {}

  async list(user: AuthenticatedUser, query: ListApprovalsQueryDto) {
    this.assertCanReadApprovals(user);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
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
        currentStep: this.resolveCurrentStep(item),
        relatedRecordUrl: this.relatedRecordUrl(
          item.moduleKey,
          item.entityType,
          item.entityId,
        ),
        decision: this.resolveDecisionCapability(user, item),
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
        /*
         * `list` has always derived this and `detail` never did, so every
         * consumer of the detail endpoint saw `currentStep: undefined` and
         * rendered an empty "Assigned To". The two endpoints describe the same
         * record and must agree about it.
         */
        currentStep: this.resolveCurrentStep(approval),
        relatedRecordUrl: this.relatedRecordUrl(
          approval.moduleKey,
          approval.entityType,
          approval.entityId,
        ),
        decision: this.resolveDecisionCapability(user, approval),
      },
    };
  }

  /**
   * Whether this caller may decide this request from the generic inbox, and if
   * not, why.
   *
   * The buttons on `/approvals` were `disabledBusinessCommand` stubs: greyed
   * out for everyone, on every row, with a reason written for a developer
   * ("not wired to a generic ModuleDataAdapter handler yet"). A caller could
   * not tell an already-decided request from one assigned to somebody else
   * from one whose module simply is not decided here. This is the signal the
   * UI drives its command bar from, so what is shown matches what would
   * actually happen.
   *
   * It is a *display* signal. The authority is `decide()` below, which re-runs
   * every check server-side — the frontend gating is UX only, per AGENTS.md.
   */
  private resolveDecisionCapability(
    user: AuthenticatedUser,
    approval: {
      moduleKey: string;
      entityType: string;
      status: ApprovalRequestStatus;
      submittedByUserId: string | null;
      currentStepId: string | null;
      steps: Array<{
        id: string;
        assignments: Array<{
          assignedToUserId: string | null;
          status: ApprovalAssignmentStatus;
        }>;
      }>;
    },
  ) {
    const delegate = this.decisionRegistry.resolve(
      approval.moduleKey,
      approval.entityType,
    );

    if (!delegate) {
      return {
        canApprove: false,
        canReject: false,
        canCancel: false,
        reason: `${moduleDisplayName(approval.moduleKey)} approvals are decided on the ${moduleDisplayName(approval.moduleKey)} record, where the detail this decision needs is visible.`,
      };
    }

    if (approval.status !== ApprovalRequestStatus.PENDING) {
      return {
        canApprove: false,
        canReject: false,
        canCancel: false,
        reason: `This request is already ${approval.status.toLowerCase()}.`,
      };
    }

    const permissions = new Set(user.permissionKeys ?? []);
    const managesApprovals = permissions.has('approvals.manage');
    const currentStep = approval.steps.find(
      (step) => step.id === approval.currentStepId,
    );
    const isAssignedApprover = Boolean(
      currentStep?.assignments.some(
        (assignment) =>
          assignment.assignedToUserId === user.userId &&
          assignment.status === ApprovalAssignmentStatus.PENDING,
      ),
    );
    const isRequester = approval.submittedByUserId === user.userId;

    const allows = (action: ApprovalDecisionAction) =>
      Boolean(delegate.requirements[action]) &&
      satisfiesPermissionRequirement(user, delegate.requirements[action]!);

    const canDecide = isAssignedApprover || managesApprovals;
    const canApprove = canDecide && allows('approve');
    const canReject = canDecide && allows('reject');
    const canCancel =
      (isRequester || managesApprovals) &&
      allows('cancel') &&
      // Deciding and withdrawing are different acts. Someone holding both should
      // approve rather than cancel, so the withdraw affordance is not offered to
      // an approver who is not also the person who raised it.
      (isRequester || !isAssignedApprover);

    return {
      canApprove,
      canReject,
      canCancel,
      reason:
        canApprove || canReject || canCancel
          ? null
          : canDecide
            ? 'You do not hold the permission this module requires to decide it.'
            : 'This step is assigned to someone else.',
    };
  }

  /**
   * Decide a request from the generic inbox by dispatching to the module that
   * raised it.
   *
   * `ApprovalRequest` is a mirror for leave and attendance — `LeaveApprovalStep`
   * is authoritative and is written inside the submit transaction, while the
   * mirror is written after and outside it. Moving the mirror here would report
   * APPROVED on this screen while the leave request itself stayed PENDING and
   * no balance was consumed. So nothing in this method writes an approval row:
   * it resolves the owning module and calls the same method that module's own
   * endpoint calls, which updates its record, its mirror, its audit trail and
   * its notifications together.
   */
  async decide(
    user: AuthenticatedUser,
    approvalRequestId: string,
    action: ApprovalDecisionAction,
    comment?: string,
  ) {
    this.assertCanReadApprovals(user);

    /*
     * Scoped exactly as `detail` is. Without `relevantScope` the id alone would
     * decide what a caller can reach, and an id is guessable in a way a scope
     * is not — the `findUnique`-by-bare-id hazard AGENTS.md names, in its
     * mutating form.
     */
    const approval = await this.prisma.approvalRequest.findFirst({
      where: {
        id: approvalRequestId,
        tenantId: user.tenantId,
        ...this.relevantScope(user),
      },
      select: {
        id: true,
        moduleKey: true,
        entityType: true,
        entityId: true,
        status: true,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval request was not found.');
    }

    if (approval.status !== ApprovalRequestStatus.PENDING) {
      throw new ConflictException(
        `This request is already ${approval.status.toLowerCase()} and cannot be ${action === 'cancel' ? 'withdrawn' : `${action}d`}.`,
      );
    }

    const delegate = this.decisionRegistry.resolve(
      approval.moduleKey,
      approval.entityType,
    );

    if (!delegate) {
      throw new ConflictException({
        code: 'APPROVAL_NOT_DECIDABLE_HERE',
        message: `${moduleDisplayName(approval.moduleKey)} approvals are decided on the ${moduleDisplayName(approval.moduleKey)} record.`,
      });
    }

    const requirement = delegate.requirements[action];
    if (!requirement) {
      throw new ConflictException({
        code: 'APPROVAL_ACTION_NOT_SUPPORTED',
        message: `${moduleDisplayName(approval.moduleKey)} approvals cannot be ${action === 'cancel' ? 'withdrawn' : `${action}d`} from the approvals inbox.`,
      });
    }

    /*
     * The owning module's controller carries `@Permissions(...)` and
     * `@RequirePermission(...)`, and dispatching in-process skips it. Applying
     * the identical test here is what stops this endpoint being a way around
     * that gate — the BUG-2015 shape, where approving turned out to be gated on
     * read. `satisfiesPermissionRequirement` is the function `PermissionsGuard`
     * itself calls, so the two cannot disagree.
     */
    if (!satisfiesPermissionRequirement(user, requirement)) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to perform this action.',
      });
    }

    await delegate.execute({
      action,
      user,
      entityId: approval.entityId,
      comment,
    });

    // Re-read rather than returning the delegate's own record shape: the caller
    // asked about an approval, and the module returns a leave request.
    return this.detail(user, approvalRequestId);
  }

  private resolveCurrentStep<
    TStep extends { id: string; status: GenericApprovalStepStatus },
  >(approval: { currentStepId: string | null; steps: TStep[] }) {
    return (
      approval.steps.find((step) => step.id === approval.currentStepId) ??
      approval.steps.find(
        (step) => step.status === GenericApprovalStepStatus.PENDING,
      ) ??
      null
    );
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
    query: ListApprovalsQueryDto,
  ): Prisma.ApprovalRequestWhereInput {
    const search = query.search?.trim();

    /*
     * The access scope and the search filter both express themselves as OR, and
     * spreading them into one object literal let the later key win: with
     * `?search=` present the caller's scope restriction disappeared entirely
     * and the query fell back to tenantId alone, returning every approval in
     * the tenant. They are combined under AND so both always apply.
     */
    const where: Prisma.ApprovalRequestWhereInput = {
      tenantId: user.tenantId,
      AND: [
        this.relevantScope(user),
        ...(search
          ? [
              {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  {
                    requestNumber: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
      ...(query.moduleKey ? { moduleKey: query.moduleKey.toLowerCase() } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      /*
       * `status` used to be cast straight from an unvalidated query string to
       * this enum, so `?status=FOO` reached Prisma and surfaced as a 500.
       * `ListApprovalsQueryDto` validates it now, and the cast is gone.
       */
      ...(query.status ? { status: query.status } : {}),
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

    // Tenant-wide is what `manage` means; nothing narrower reaches it.
    if (permissions.has('approvals.manage')) return {};

    const ownScope: Prisma.ApprovalRequestWhereInput[] = [
      { submittedByUserId: user.userId },
      { assignments: { some: { assignedToUserId: user.userId } } },
    ];

    /*
     * `readTeam` returned {} — an unrestricted where — which made it a synonym
     * for `manage` and let every holder read every approval in the tenant.
     *
     * Team here means the caller's direct reports, which is how the same
     * concept is enforced elsewhere in the product: timesheets rejects a
     * non-`read.all` caller whose target is not their direct report with "You
     * can only view timesheets for your direct reports"
     * (timesheets.service.ts), and attendance corrections scope to
     * `employee.manager.userId` for callers without tenant-wide rights.
     *
     * The caller keeps their own submitted and assigned requests on top, so
     * this only ever widens the default scope, never narrows it.
     */
    if (permissions.has('approvals.readTeam')) {
      return {
        OR: [
          ...ownScope,
          { submittedForEmployee: { manager: { userId: user.userId } } },
        ],
      };
    }

    return { OR: ownScope };
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
    /*
     * Added because the inbox now tells a caller to go and decide on the owning
     * record for modules it does not decide in place, and that sentence is
     * worth nothing without somewhere to go. `timesheet` and `benefit` both
     * raise approvals through `createWorkflow` and neither had a mapping.
     */
    if (moduleKey === 'timesheet') return `/timesheets`;
    if (moduleKey === 'benefit') return `/benefits`;
    return '/approvals';
  }
}

/**
 * `moduleKey` is a lowercase machine key written by hand at each `createWorkflow`
 * call site. It reaches the user in refusal messages, so it gets a real name.
 */
function moduleDisplayName(moduleKey: string) {
  const names: Record<string, string> = {
    attendance: 'Attendance',
    benefit: 'Benefit',
    claim: 'Claim',
    employee: 'Employee',
    leave: 'Leave',
    loan: 'Loan',
    payroll: 'Payroll',
    timesheet: 'Timesheet',
  };
  return names[moduleKey.toLowerCase()] ?? moduleKey;
}

function readApprovalMode(value: Prisma.JsonValue | null): 'ANY_ONE' | 'ALL' {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.approvalMode === 'ALL' ? 'ALL' : 'ANY_ONE';
  }
  return 'ANY_ONE';
}
