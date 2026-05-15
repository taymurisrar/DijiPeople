import { Injectable } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailProviderType,
  EmailTemplateStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  NOTIFICATION_EVENT_CATALOG,
  SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS,
} from './notification-events.catalog';
import {
  buildTenantNotificationScopeKey,
  buildUserNotificationScopeKey,
  NOTIFICATION_SYSTEM_SCOPE_KEY,
} from './notifications.constants';
import type {
  EmailDeliveryLogCreateInput,
  EmailProviderLookupInput,
  EmailTemplateLookupInput,
  NotificationPreferenceLookupInput,
  InAppNotificationCreateInput,
} from './interfaces/notification-contracts.interface';
import type { EmailDeliveryLogQueryDto } from './dto/email-delivery-log-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

export type TenantEmailTemplateWriteInput = {
  tenantId: string;
  eventCode: string;
  templateKey: string;
  name: string;
  description?: string | null;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate?: string | null;
  availableVariables: Prisma.InputJsonValue;
  status: EmailTemplateStatus;
  actorUserId: string;
};

export type TenantEmailProviderWriteInput = {
  tenantId: string;
  providerType: EmailProviderType;
  providerName: string;
  enabled: boolean;
  isDefault: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  configuration: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listEvents(db: PrismaDb = this.prisma) {
    return db.notificationEvent.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  findEventByCode(code: string, db: PrismaDb = this.prisma) {
    return db.notificationEvent.findUnique({
      where: { code },
    });
  }

  listPreferences(tenantId: string, db: PrismaDb = this.prisma) {
    return db.notificationPreference.findMany({
      where: {
        tenantId,
        userId: null,
      },
      orderBy: [{ eventCode: 'asc' }, { channel: 'asc' }],
    });
  }

  upsertTenantPreference(
    input: {
      tenantId: string;
      eventCode: string;
      channel: NotificationChannel;
      enabled: boolean;
      metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
    },
    db: PrismaDb = this.prisma,
  ) {
    const scopeKey = buildTenantNotificationScopeKey(input.tenantId);

    return db.notificationPreference.upsert({
      where: {
        scopeKey_eventCode_channel: {
          scopeKey,
          eventCode: input.eventCode,
          channel: input.channel,
        },
      },
      create: {
        tenantId: input.tenantId,
        userId: null,
        scopeKey,
        eventCode: input.eventCode,
        channel: input.channel,
        enabled: input.enabled,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
      update: {
        enabled: input.enabled,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  }

  async findTemplateForEvent(
    input: EmailTemplateLookupInput,
    db: PrismaDb = this.prisma,
  ) {
    const tenantScopeKey = buildTenantNotificationScopeKey(input.tenantId);
    const templateWhere = input.templateKey
      ? { templateKey: input.templateKey }
      : { eventCode: input.eventCode };

    const [tenantTemplate, systemTemplate] = await Promise.all([
      db.emailTemplate.findFirst({
        where: {
          ...templateWhere,
          scopeKey: tenantScopeKey,
          status: EmailTemplateStatus.ACTIVE,
        },
        orderBy: { version: 'desc' },
      }),
      db.emailTemplate.findFirst({
        where: {
          ...templateWhere,
          scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY,
          status: EmailTemplateStatus.ACTIVE,
        },
        orderBy: { version: 'desc' },
      }),
    ]);

    return tenantTemplate ?? systemTemplate;
  }

  listTemplates(tenantId: string, db: PrismaDb = this.prisma) {
    return db.emailTemplate.findMany({
      where: {
        OR: [
          { scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY },
          { scopeKey: buildTenantNotificationScopeKey(tenantId) },
        ],
      },
      orderBy: [{ eventCode: 'asc' }, { scopeKey: 'asc' }, { version: 'desc' }],
    });
  }

  findVisibleTemplateById(
    tenantId: string,
    templateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.findFirst({
      where: {
        id: templateId,
        OR: [
          { scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY },
          { scopeKey: buildTenantNotificationScopeKey(tenantId) },
        ],
      },
    });
  }

  findTenantTemplateById(
    tenantId: string,
    templateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.findFirst({
      where: {
        id: templateId,
        scopeKey: buildTenantNotificationScopeKey(tenantId),
        tenantId,
      },
    });
  }

  createTenantTemplate(input: TenantEmailTemplateWriteInput) {
    const scopeKey = buildTenantNotificationScopeKey(input.tenantId);

    return this.prisma.$transaction(async (tx) => {
      if (input.status === EmailTemplateStatus.ACTIVE) {
        await this.archiveActiveTenantTemplates(
          input.tenantId,
          input.templateKey,
          undefined,
          tx,
        );
      }

      return tx.emailTemplate.create({
        data: {
          tenantId: input.tenantId,
          scopeKey,
          eventCode: input.eventCode,
          templateKey: input.templateKey,
          name: input.name,
          description: input.description ?? null,
          subjectTemplate: input.subjectTemplate,
          htmlTemplate: input.htmlTemplate,
          textTemplate: input.textTemplate ?? null,
          availableVariables: input.availableVariables,
          status: input.status,
          version: 1,
          isSystem: false,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        },
      });
    });
  }

  updateTenantTemplate(
    tenantId: string,
    templateId: string,
    data: Prisma.EmailTemplateUpdateInput,
    actorUserId: string,
  ) {
    return this.prisma.emailTemplate.update({
      where: { id: templateId },
      data: {
        ...data,
        version: { increment: 1 },
        updatedBy: actorUserId,
      },
    });
  }

  async activateTenantTemplate(tenantId: string, templateId: string) {
    const template = await this.findTenantTemplateById(tenantId, templateId);
    if (!template) return null;

    return this.prisma.$transaction(async (tx) => {
      await this.archiveActiveTenantTemplates(
        tenantId,
        template.templateKey,
        template.id,
        tx,
      );

      return tx.emailTemplate.update({
        where: { id: template.id },
        data: { status: EmailTemplateStatus.ACTIVE },
      });
    });
  }

  archiveTenantTemplate(tenantId: string, templateId: string) {
    return this.prisma.emailTemplate.updateMany({
      where: {
        id: templateId,
        tenantId,
        scopeKey: buildTenantNotificationScopeKey(tenantId),
      },
      data: { status: EmailTemplateStatus.ARCHIVED },
    });
  }

  private archiveActiveTenantTemplates(
    tenantId: string,
    templateKey: string,
    excludeTemplateId?: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.updateMany({
      where: {
        tenantId,
        scopeKey: buildTenantNotificationScopeKey(tenantId),
        templateKey,
        status: EmailTemplateStatus.ACTIVE,
        ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
      },
      data: { status: EmailTemplateStatus.ARCHIVED },
    });
  }

  findDefaultProvider(
    input: EmailProviderLookupInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailProviderSetting.findFirst({
      where: {
        tenantId: input.tenantId,
        enabled: true,
        ...(input.providerName
          ? { providerName: input.providerName }
          : { isDefault: true }),
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  listEnabledProviders(tenantId: string, db: PrismaDb = this.prisma) {
    return db.emailProviderSetting.findMany({
      where: {
        tenantId,
        enabled: true,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  listProviderSettings(tenantId: string, db: PrismaDb = this.prisma) {
    return db.emailProviderSetting.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { providerName: 'asc' }],
    });
  }

  findProviderById(
    tenantId: string,
    providerId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailProviderSetting.findFirst({
      where: { id: providerId, tenantId },
    });
  }

  createProvider(input: TenantEmailProviderWriteInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.enabled && input.isDefault) {
        await tx.emailProviderSetting.updateMany({
          where: { tenantId: input.tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.emailProviderSetting.create({
        data: input,
      });
    });
  }

  updateProvider(
    tenantId: string,
    providerId: string,
    data: Prisma.EmailProviderSettingUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true && data.enabled !== false) {
        await tx.emailProviderSetting.updateMany({
          where: { tenantId, id: { not: providerId }, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.emailProviderSetting.update({
        where: { id: providerId },
        data,
      });
    });
  }

  setDefaultProvider(tenantId: string, providerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.emailProviderSetting.findFirst({
        where: { id: providerId, tenantId },
      });

      if (!provider) return null;

      await tx.emailProviderSetting.updateMany({
        where: { tenantId, id: { not: providerId }, isDefault: true },
        data: { isDefault: false },
      });

      return tx.emailProviderSetting.update({
        where: { id: providerId },
        data: { enabled: true, isDefault: true },
      });
    });
  }

  disableProvider(tenantId: string, providerId: string) {
    return this.prisma.emailProviderSetting.updateMany({
      where: { id: providerId, tenantId },
      data: { enabled: false, isDefault: false },
    });
  }

  findPreference(
    input: NotificationPreferenceLookupInput,
    db: PrismaDb = this.prisma,
  ) {
    const scopeKey = input.userId
      ? buildUserNotificationScopeKey(input.tenantId, input.userId)
      : buildTenantNotificationScopeKey(input.tenantId);

    return db.notificationPreference.findUnique({
      where: {
        scopeKey_eventCode_channel: {
          scopeKey,
          eventCode: input.eventCode,
          channel: input.channel,
        },
      },
    });
  }

  createDeliveryLog(
    input: EmailDeliveryLogCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailDeliveryLog.create({
      data: {
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        templateId: input.templateId ?? null,
        providerType: input.providerType ?? null,
        recipient: input.recipient,
        cc: input.cc ?? null,
        bcc: input.bcc ?? null,
        subject: input.subject,
        channel: input.channel ?? NotificationChannel.EMAIL,
        status: input.status ?? EmailDeliveryStatus.REQUESTED,
        providerMessageId: input.providerMessageId ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata:
          input.metadata === undefined || input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        retryCount: input.retryCount ?? 0,
        maxRetryCount: input.maxRetryCount ?? 3,
        nextRetryAt: input.nextRetryAt ?? null,
        lastRetryAt: input.lastRetryAt ?? null,
        retryable: input.retryable ?? false,
        requestedAt: input.requestedAt ?? new Date(),
      },
    });
  }

  async updateDeliveryLogStatus(
    tenantId: string,
    deliveryLogId: string,
    data: Prisma.EmailDeliveryLogUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    await db.emailDeliveryLog.updateMany({
      where: { id: deliveryLogId, tenantId },
      data,
    });

    return this.findDeliveryLogById(tenantId, deliveryLogId, db);
  }

  async listDeliveryLogs(
    tenantId: string,
    query: EmailDeliveryLogQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where: Prisma.EmailDeliveryLogWhereInput = {
      tenantId,
      ...(query.eventCode ? { eventCode: query.eventCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.providerType ? { providerType: query.providerType } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                recipient: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                subject: { contains: query.search.trim(), mode: 'insensitive' },
              },
              {
                providerMessageId: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.emailDeliveryLog.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.emailDeliveryLog.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  findDeliveryLogById(
    tenantId: string,
    deliveryLogId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailDeliveryLog.findFirst({
      where: { id: deliveryLogId, tenantId },
    });
  }

  countRecentDeliveryLogs(
    input: {
      tenantId: string;
      eventCode: string;
      recipient: string;
      since: Date;
    },
    db: PrismaDb = this.prisma,
  ) {
    return db.emailDeliveryLog.count({
      where: {
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        recipient: input.recipient,
        requestedAt: { gte: input.since },
        status: { not: EmailDeliveryStatus.SKIPPED },
      },
    });
  }

  listRetryableDeliveryLogs(
    tenantId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailDeliveryLog.findMany({
      where: {
        tenantId,
        retryable: true,
        status: EmailDeliveryStatus.FAILED,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: [{ nextRetryAt: 'asc' }, { failedAt: 'asc' }],
      take: 100,
    });
  }

  async getDiagnostics(tenantId: string, db: PrismaDb = this.prisma) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failedCount, retryBacklog, skippedCount, lastExecution] =
      await Promise.all([
        db.emailDeliveryLog.count({
          where: {
            tenantId,
            status: EmailDeliveryStatus.FAILED,
            requestedAt: { gte: since24h },
          },
        }),
        db.emailDeliveryLog.count({
          where: {
            tenantId,
            retryable: true,
            status: EmailDeliveryStatus.FAILED,
          },
        }),
        db.emailDeliveryLog.count({
          where: {
            tenantId,
            status: EmailDeliveryStatus.SKIPPED,
            requestedAt: { gte: since24h },
          },
        }),
        db.emailDeliveryLog.findFirst({
          where: { tenantId },
          orderBy: { requestedAt: 'desc' },
        }),
      ]);

    return {
      failedCount24h: failedCount,
      retryBacklog,
      skippedCount24h: skippedCount,
      lastExecutionAt: lastExecution?.requestedAt ?? null,
      lastExecutionStatus: lastExecution?.status ?? null,
    };
  }

  createInAppNotification(
    input: InAppNotificationCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.notification.create({
      data: {
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        type: input.type ?? NotificationType.INFO,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        targetUrl: input.targetUrl ?? null,
        payload:
          input.payload === undefined || input.payload === null
            ? Prisma.JsonNull
            : (input.payload as Prisma.InputJsonValue),
        metadata:
          input.metadata === undefined || input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        createdById: input.createdById ?? null,
        recipients: {
          createMany: {
            data: [...new Set(input.recipientUserIds)].map((userId) => ({
              tenantId: input.tenantId,
              userId,
              deliveredAt: new Date(),
            })),
            skipDuplicates: true,
          },
        },
      },
      include: { recipients: true },
    });
  }

  listInAppNotifications(
    input: {
      tenantId: string;
      userId: string;
      includeArchived?: boolean;
      unreadOnly?: boolean;
      page?: number;
      pageSize?: number;
    },
    db: PrismaDb = this.prisma,
  ) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 25)));
    return db.notificationRecipient.findMany({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.unreadOnly ? { readAt: null } : {}),
      },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  countUnreadInAppNotifications(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationRecipient.count({
      where: {
        tenantId,
        userId,
        readAt: null,
        archivedAt: null,
      },
    });
  }

  markInAppNotificationRead(
    tenantId: string,
    userId: string,
    recipientId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationRecipient.updateMany({
      where: { id: recipientId, tenantId, userId },
      data: { readAt: new Date() },
    });
  }

  archiveInAppNotification(
    tenantId: string,
    userId: string,
    recipientId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationRecipient.updateMany({
      where: { id: recipientId, tenantId, userId },
      data: { archivedAt: new Date() },
    });
  }

  async bootstrapSystemDefaults(db: PrismaDb = this.prisma) {
    for (const event of NOTIFICATION_EVENT_CATALOG) {
      await db.notificationEvent.upsert({
        where: { code: event.code },
        create: {
          code: event.code,
          name: event.name,
          description: event.description,
          category: event.category,
          enabledByDefault: event.enabledByDefault,
          supportedChannels: event.defaultChannels,
          systemDefined: true,
        },
        update: {
          name: event.name,
          description: event.description,
          category: event.category,
          enabledByDefault: event.enabledByDefault,
          supportedChannels: event.defaultChannels,
          systemDefined: true,
        },
      });
    }

    for (const template of SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS) {
      await db.emailTemplate.upsert({
        where: {
          scopeKey_templateKey: {
            scopeKey: template.scopeKey,
            templateKey: template.templateKey,
          },
        },
        create: {
          tenantId: null,
          scopeKey: template.scopeKey,
          eventCode: template.eventCode,
          templateKey: template.templateKey,
          name: template.name,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          htmlTemplate: template.htmlTemplate,
          textTemplate: template.textTemplate,
          availableVariables:
            template.availableVariables as unknown as Prisma.InputJsonValue,
          status: template.status,
          version: template.version,
          isSystem: true,
        },
        update: {
          eventCode: template.eventCode,
          name: template.name,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          htmlTemplate: template.htmlTemplate,
          textTemplate: template.textTemplate,
          availableVariables:
            template.availableVariables as unknown as Prisma.InputJsonValue,
          status: template.status,
          isSystem: true,
        },
      });
    }
  }
}
