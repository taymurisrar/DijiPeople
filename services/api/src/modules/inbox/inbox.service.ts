import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationInteractionAction,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

type OpenState =
  | 'OK'
  | 'ACCESS_DENIED'
  | 'RECORD_NOT_FOUND'
  | 'SUPERSEDED'
  | 'EXPIRED';

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: Record<string, string>) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where: Prisma.NotificationWhereInput = {
      tenantId: user.tenantId,
      recipientUserId: user.userId,
      ...this.viewWhere(query.view),
      ...(query.moduleKey ? { moduleKey: query.moduleKey.toLowerCase() } : {}),
      ...(query.status ? { status: query.status as NotificationStatus } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              {
                summary: { contains: query.search.trim(), mode: 'insensitive' },
              },
              {
                relatedRecordNumber: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, unreadCount, actionRequiredCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAtUtc: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          tenantId: user.tenantId,
          recipientUserId: user.userId,
          status: NotificationStatus.UNREAD,
        },
      }),
      this.prisma.notification.count({
        where: {
          tenantId: user.tenantId,
          recipientUserId: user.userId,
          requiresAction: true,
          status: {
            notIn: [NotificationStatus.ARCHIVED, NotificationStatus.DISMISSED],
          },
        },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
      actionRequiredCount,
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    const notification = await this.findOwnedNotification(user, id);
    return { item: notification };
  }

  async open(user: AuthenticatedUser, id: string) {
    const notification = await this.findOwnedNotification(user, id);
    const state = await this.resolveOpenState(user, notification);

    if (state !== 'OK') {
      await this.logInteraction(
        user,
        notification.id,
        NotificationInteractionAction.NAVIGATION_DENIED,
        {
          state,
        },
      );
      return { state, navigationTarget: null, notification };
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status:
            notification.status === NotificationStatus.UNREAD
              ? NotificationStatus.READ
              : notification.status,
          readAtUtc: notification.readAtUtc ?? now,
          openedAtUtc: now,
        },
      }),
      this.prisma.notificationRecipient.updateMany({
        where: {
          notificationId: notification.id,
          tenantId: user.tenantId,
          userId: user.userId,
        },
        data: {
          status: NotificationStatus.READ,
          readAt: now,
          openedAt: now,
        },
      }),
      this.prisma.notificationInteractionLog.create({
        data: {
          tenantId: user.tenantId,
          notificationId: notification.id,
          userId: user.userId,
          action: NotificationInteractionAction.OPENED,
          eventAtUtc: now,
          retentionUntilUtc: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return {
      state: 'OK' satisfies OpenState,
      navigationTarget:
        notification.targetUrl ?? notification.routeName ?? '/inbox',
      notification,
    };
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    statusInput: string | undefined,
  ) {
    const status = this.normalizeStatus(statusInput);
    const notification = await this.findOwnedNotification(user, id);
    const now = new Date();
    const data: Prisma.NotificationUpdateInput = { status };

    if (status === NotificationStatus.READ) data.readAtUtc = now;
    if (status === NotificationStatus.DISMISSED) data.dismissedAtUtc = now;
    if (status === NotificationStatus.ARCHIVED) data.archivedAtUtc = now;

    await this.prisma.notification.update({
      where: { id: notification.id },
      data,
    });
    await this.prisma.notificationRecipient.updateMany({
      where: {
        notificationId: notification.id,
        tenantId: user.tenantId,
        userId: user.userId,
      },
      data: this.recipientStatusData(status, now),
    });
    await this.logInteraction(
      user,
      notification.id,
      this.actionForStatus(status),
    );

    return { status };
  }

  private async findOwnedNotification(user: AuthenticatedUser, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId: user.tenantId, recipientUserId: user.userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification was not found.');
    }
    return notification;
  }

  private viewWhere(view?: string): Prisma.NotificationWhereInput {
    switch (view) {
      case 'unread':
        return { status: NotificationStatus.UNREAD };
      case 'action-required':
        return { requiresAction: true };
      case 'approvals':
        return { category: 'APPROVALS' };
      case 'employee':
      case 'attendance':
      case 'leave':
        return { moduleKey: view };
      case 'archived':
        return { status: NotificationStatus.ARCHIVED };
      default:
        return { status: { not: NotificationStatus.ARCHIVED } };
    }
  }

  private normalizeStatus(status?: string) {
    if (status && status in NotificationStatus) {
      return status as NotificationStatus;
    }
    return NotificationStatus.READ;
  }

  private recipientStatusData(status: NotificationStatus, now: Date) {
    return {
      status,
      ...(status === NotificationStatus.READ ? { readAt: now } : {}),
      ...(status === NotificationStatus.DISMISSED ? { dismissedAt: now } : {}),
      ...(status === NotificationStatus.ARCHIVED ? { archivedAt: now } : {}),
    };
  }

  private actionForStatus(status: NotificationStatus) {
    if (status === NotificationStatus.ARCHIVED) {
      return NotificationInteractionAction.ARCHIVED;
    }
    if (status === NotificationStatus.DISMISSED) {
      return NotificationInteractionAction.DISMISSED;
    }
    return NotificationInteractionAction.READ;
  }

  private async resolveOpenState(
    user: AuthenticatedUser,
    notification: Awaited<ReturnType<InboxService['findOwnedNotification']>>,
  ): Promise<OpenState> {
    if (notification.status === NotificationStatus.SUPERSEDED)
      return 'SUPERSEDED';
    if (
      notification.status === NotificationStatus.EXPIRED ||
      (notification.expiresAtUtc && notification.expiresAtUtc < new Date())
    ) {
      return 'EXPIRED';
    }

    const found = await this.relatedRecordExists(user.tenantId, notification);
    if (!found) return 'RECORD_NOT_FOUND';

    return (await this.canOpenRelatedRecord(user, notification))
      ? 'OK'
      : 'ACCESS_DENIED';
  }

  private async relatedRecordExists(
    tenantId: string,
    notification: {
      moduleKey: string | null;
      relatedEntityType: string | null;
      relatedEntityId: string | null;
    },
  ) {
    if (!notification.relatedEntityId) return true;
    if (notification.relatedEntityType === 'employee') {
      return Boolean(
        await this.prisma.employee.findFirst({
          where: {
            id: notification.relatedEntityId,
            tenantId,
            isDeleted: false,
          },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'employeeDocument') {
      return Boolean(
        await this.prisma.documentLink.findFirst({
          where: {
            tenantId,
            documentId: notification.relatedEntityId,
            employeeId: { not: null },
          },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'employeeProfileChange') {
      return Boolean(
        await this.prisma.employee.findFirst({
          where: {
            id: notification.relatedEntityId,
            tenantId,
            isDeleted: false,
          },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'onboardingTask') {
      return Boolean(
        await this.prisma.onboardingTask.findFirst({
          where: { id: notification.relatedEntityId, tenantId },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'attendanceRecord') {
      return Boolean(
        await this.prisma.attendanceEntry.findFirst({
          where: { id: notification.relatedEntityId, tenantId },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'attendanceCorrectionRequest') {
      return Boolean(
        await this.prisma.attendanceCorrectionRequest.findFirst({
          where: { id: notification.relatedEntityId, tenantId },
          select: { id: true },
        }),
      );
    }
    if (notification.relatedEntityType === 'leaveRequest') {
      return Boolean(
        await this.prisma.leaveRequest.findFirst({
          where: { id: notification.relatedEntityId, tenantId },
          select: { id: true },
        }),
      );
    }
    if (
      notification.relatedEntityId &&
      notification.relatedEntityId.startsWith('approval')
    ) {
      return true;
    }
    return true;
  }

  private async canOpenRelatedRecord(
    user: AuthenticatedUser,
    notification: {
      moduleKey: string | null;
      relatedEntityType: string | null;
      relatedEntityId: string | null;
      metadata: Prisma.JsonValue;
    },
  ) {
    const permissions = new Set(user.permissionKeys ?? []);
    if (notification.moduleKey === 'employee') {
      return this.canOpenEmployeeRelatedRecord(user, notification, permissions);
    }
    if (notification.moduleKey === 'attendance') {
      return this.canOpenAttendanceRelatedRecord(
        user,
        notification,
        permissions,
      );
    }
    if (notification.moduleKey === 'leave') {
      return (
        permissions.has('leave-requests.read') ||
        permissions.has('leave-requests.approve') ||
        permissions.has('leave-requests.reject')
      );
    }
    return permissions.has('inbox.read');
  }

  private async canOpenEmployeeRelatedRecord(
    user: AuthenticatedUser,
    notification: {
      relatedEntityType: string | null;
      relatedEntityId: string | null;
      metadata: Prisma.JsonValue;
    },
    permissions: Set<string>,
  ) {
    const isEmployeeDocument =
      notification.relatedEntityType === 'employeeDocument';

    if (
      !isEmployeeDocument &&
      (permissions.has('employees.read') ||
        permissions.has('employees.read.all'))
    ) {
      return true;
    }

    if (
      isEmployeeDocument &&
      (permissions.has('employees.read.all') ||
        (permissions.has('employees.read') &&
          permissions.has('employees.documents.read')))
    ) {
      return true;
    }

    if (notification.relatedEntityType === 'onboardingTask') {
      if (!permissions.has('onboarding.read')) return false;
      const task = await this.prisma.onboardingTask.findFirst({
        where: {
          tenantId: user.tenantId,
          id: notification.relatedEntityId ?? '',
          OR: [
            { assignedUserId: user.userId },
            { employeeOnboarding: { ownerUserId: user.userId } },
          ],
        },
        select: { id: true },
      });
      return Boolean(task);
    }

    const employeeId =
      notification.relatedEntityType === 'employeeDocument'
        ? readString(notification.metadata, 'employeeId')
        : notification.relatedEntityId;

    if (!employeeId) return false;

    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId: user.tenantId,
        id: employeeId,
        isDeleted: false,
      },
      select: {
        userId: true,
        ownerUserId: true,
        manager: { select: { userId: true } },
      },
    });

    if (!employee) return false;

    if (
      (permissions.has('employees.read.self') ||
        permissions.has('employees.documents.read.self')) &&
      (employee.userId === user.userId || employee.ownerUserId === user.userId)
    ) {
      return true;
    }

    return (
      permissions.has('employees.read.team') &&
      employee.manager?.userId === user.userId
    );
  }

  private async canOpenAttendanceRelatedRecord(
    user: AuthenticatedUser,
    notification: {
      relatedEntityId: string | null;
      relatedEntityType?: string | null;
    },
    permissions: Set<string>,
  ) {
    if (
      permissions.has('attendance.manage') ||
      permissions.has('attendance.read.all') ||
      permissions.has('attendance.correction.manage')
    ) {
      return true;
    }
    if (!notification.relatedEntityId) return false;

    if (notification.relatedEntityType === 'attendanceCorrectionRequest') {
      const request = await this.prisma.attendanceCorrectionRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          id: notification.relatedEntityId,
        },
        select: {
          requestedByUserId: true,
          employee: {
            select: {
              userId: true,
              manager: { select: { userId: true } },
            },
          },
        },
      });

      if (!request) return false;

      if (
        (permissions.has('attendance.correction.read') ||
          permissions.has('attendance.correction.readOwn') ||
          permissions.has('attendance.read') ||
          permissions.has('attendance.read.own')) &&
        (request.requestedByUserId === user.userId ||
          request.employee.userId === user.userId)
      ) {
        return true;
      }

      if (
        (permissions.has('attendance.correction.readTeam') ||
          permissions.has('attendance.read.team')) &&
        request.employee.manager?.userId === user.userId
      ) {
        return true;
      }

      if (
        !permissions.has('attendance.correction.approve') &&
        !permissions.has('attendance.correction.reject')
      ) {
        return false;
      }

      const assignment = await this.prisma.approvalAssignment.findFirst({
        where: {
          tenantId: user.tenantId,
          assignedToUserId: user.userId,
          approvalRequest: {
            moduleKey: 'attendance',
            entityType: 'attendanceCorrectionRequest',
            entityId: notification.relatedEntityId,
          },
        },
        select: { id: true },
      });

      return Boolean(assignment);
    }

    const entry = await this.prisma.attendanceEntry.findFirst({
      where: {
        tenantId: user.tenantId,
        id: notification.relatedEntityId,
      },
      select: {
        employee: {
          select: {
            userId: true,
            manager: { select: { userId: true } },
          },
        },
      },
    });

    if (!entry) return false;

    if (
      (permissions.has('attendance.read') ||
        permissions.has('attendance.read.own')) &&
      entry.employee.userId === user.userId
    ) {
      return true;
    }

    return (
      permissions.has('attendance.read.team') &&
      entry.employee.manager?.userId === user.userId
    );
  }

  private logInteraction(
    user: AuthenticatedUser,
    notificationId: string,
    action: NotificationInteractionAction,
    metadata?: Record<string, unknown>,
  ) {
    const now = new Date();
    return this.prisma.notificationInteractionLog.create({
      data: {
        tenantId: user.tenantId,
        notificationId,
        userId: user.userId,
        action,
        eventAtUtc: now,
        metadata:
          metadata === undefined || metadata === null
            ? Prisma.JsonNull
            : (metadata as Prisma.InputJsonValue),
        retentionUntilUtc: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      },
    });
  }
}

function readString(source: Prisma.JsonValue, key: string) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
