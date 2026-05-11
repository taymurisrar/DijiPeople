import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class InAppNotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async create(input: {
    tenantId: string;
    eventCode: string;
    title: string;
    body?: string | null;
    targetUrl?: string | null;
    recipientUserIds: string[];
    type?: NotificationType;
    payload?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    createdById?: string | null;
  }) {
    const event = await this.repository.findEventByCode(input.eventCode);
    if (!event) {
      throw new BadRequestException(
        `Unsupported notification event: ${input.eventCode}.`,
      );
    }

    if (!input.recipientUserIds.length) {
      return null;
    }

    return this.repository.createInAppNotification({
      tenantId: input.tenantId,
      eventCode: input.eventCode,
      category: event.category,
      type: input.type,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      targetUrl: input.targetUrl?.trim() || null,
      recipientUserIds: input.recipientUserIds,
      payload: input.payload ?? null,
      metadata: input.metadata ?? null,
      createdById: input.createdById ?? null,
    });
  }

  async listForUser(
    user: AuthenticatedUser,
    query: {
      unreadOnly?: boolean;
      includeArchived?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    const items = await this.repository.listInAppNotifications({
      tenantId: user.tenantId,
      userId: user.userId,
      unreadOnly: query.unreadOnly,
      includeArchived: query.includeArchived,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        notificationId: item.notificationId,
        readAt: item.readAt,
        archivedAt: item.archivedAt,
        deliveredAt: item.deliveredAt,
        createdAt: item.createdAt,
        notification: item.notification,
      })),
    };
  }

  async getUnreadCount(user: AuthenticatedUser) {
    return {
      unreadCount: await this.repository.countUnreadInAppNotifications(
        user.tenantId,
        user.userId,
      ),
    };
  }

  async markRead(user: AuthenticatedUser, recipientId: string) {
    await this.repository.markInAppNotificationRead(
      user.tenantId,
      user.userId,
      recipientId,
    );
    return { read: true };
  }

  async archive(user: AuthenticatedUser, recipientId: string) {
    await this.repository.archiveInAppNotification(
      user.tenantId,
      user.userId,
      recipientId,
    );
    return { archived: true };
  }
}
