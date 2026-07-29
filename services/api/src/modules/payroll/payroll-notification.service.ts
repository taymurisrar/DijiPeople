import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

export type PayrollNotificationEvent =
  | 'PAYROLL_CALCULATION_COMPLETED'
  | 'PAYROLL_CALCULATION_FAILED'
  | 'PAYROLL_BLOCKERS_FOUND'
  | 'PAYROLL_READY_FOR_REVIEW'
  | 'PAYROLL_RETURNED_FOR_RECALCULATION'
  | 'PAYROLL_APPROVAL_REQUIRED'
  | 'PAYROLL_APPROVED'
  | 'PAYMENT_BATCH_SUBMITTED'
  | 'PAYMENT_BATCH_PARTIALLY_FAILED'
  | 'PAYMENT_BATCH_FAILED'
  | 'PAYROLL_PAID'
  | 'PAYSLIP_PUBLISHED'
  | 'PAYSLIP_EMAIL_FAILED'
  | 'JOURNAL_GENERATION_FAILED'
  | 'JOURNAL_POSTED'
  | 'JOURNAL_REVERSED';

@Injectable()
export class PayrollNotificationService {
  private readonly logger = new Logger(PayrollNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  async dispatch(input: {
    tenantId: string;
    actorUserId?: string | null;
    eventCode: PayrollNotificationEvent;
    entityType: string;
    entityId: string;
    title: string;
    body?: string | null;
    targetUrl?: string | null;
    permissionKeys?: string[];
    payload?: Record<string, unknown>;
  }) {
    const dedupeKey = `${input.eventCode}:${input.entityType}:${input.entityId}`;
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        dedupeKey,
      },
      select: { id: true },
    });
    if (existing) return existing;

    const recipientUserIds = await this.resolveRecipients({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      permissionKeys: input.permissionKeys ?? ['payroll-runs.read'],
    });
    if (!recipientUserIds.length) return null;

    try {
      const result = await this.notifications.dispatch({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        channels: [NotificationChannel.IN_APP],
        sourceModule: 'payroll',
        correlationId: dedupeKey,
        requestedByUserId: input.actorUserId ?? null,
        inApp: {
          title: input.title,
          body: input.body ?? null,
          targetUrl: input.targetUrl ?? null,
          recipientUserIds,
          type: NotificationType.INFO,
          payload: input.payload ?? null,
          metadata: {
            entityType: input.entityType,
            entityId: input.entityId,
            dedupeKey,
          },
        },
      });
      const notificationId =
        typeof result.inApp === 'object' && result.inApp && 'id' in result.inApp
          ? String(result.inApp.id)
          : null;
      if (notificationId) {
        await this.prisma.notification.updateMany({
          where: { tenantId: input.tenantId, id: notificationId },
          data: {
            dedupeKey,
            moduleKey: 'payroll',
            relatedEntityType: input.entityType,
            relatedEntityId: input.entityId,
            targetUrl: input.targetUrl ?? null,
          },
        });
      }
      return result.inApp ?? null;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Payroll notification dispatch failed.',
          tenantId: input.tenantId,
          eventCode: input.eventCode,
          entityType: input.entityType,
          entityId: input.entityId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private async resolveRecipients(input: {
    tenantId: string;
    actorUserId?: string | null;
    permissionKeys: string[];
  }) {
    const recipientFilters = [
      ...(input.actorUserId ? [{ id: input.actorUserId }] : []),
      {
        userPermissions: {
          some: { permission: { key: { in: input.permissionKeys } } },
        },
      },
      {
        userRoles: {
          some: {
            role: {
              isActive: true,
              rolePermissions: {
                some: { permission: { key: { in: input.permissionKeys } } },
              },
            },
          },
        },
      },
    ];
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        status: UserStatus.ACTIVE,
        OR: recipientFilters,
      },
      select: { id: true },
      take: 100,
    });
    return [...new Set(users.map((user) => user.id))];
  }
}
