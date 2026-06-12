import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalRequestStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return '/dashboard/approvals';
  }
}
