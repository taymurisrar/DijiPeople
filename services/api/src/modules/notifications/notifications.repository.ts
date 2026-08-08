import { Injectable } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailProviderType,
  EmailTemplateStatus,
  NotificationChannel,
  NotificationDisplayMode,
  NotificationType,
  NotificationEventCategory,
  NotificationInteractionAction,
  NotificationStatus,
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
  notificationScopeChain,
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
  /* Defaults to the tenant scope when the caller does not place the template. */
  scopeKey?: string;
  moduleKey?: string | null;
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
    const templateWhere = input.templateKey
      ? { templateKey: input.templateKey }
      : { eventCode: input.eventCode };

    /*
     * Scopes are tried most specific first so a team or department template
     * overrides the broader one without duplicating it. A single query ordered
     * by scope rank avoids one round trip per level.
     */
    const scopeChain = notificationScopeChain({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      businessUnitId: input.businessUnitId,
      departmentId: input.departmentId,
      teamId: input.teamId,
    });

    const candidates = await db.emailTemplate.findMany({
      where: {
        ...templateWhere,
        scopeKey: { in: scopeChain },
        status: EmailTemplateStatus.ACTIVE,
      },
      orderBy: { version: 'desc' },
    });

    for (const scopeKey of scopeChain) {
      const match = candidates.find(
        (candidate) => candidate.scopeKey === scopeKey,
      );
      if (match) return match;
    }

    return null;
  }

  /*
   * Where an employee sits, used to pick the most specific email template when
   * a caller supplies only the person the email is about. Looked up by
   * employee id or by the user id linked to the employee record.
   */
  findEmployeePlacement(
    input: {
      tenantId: string;
      employeeId?: string | null;
      userId?: string | null;
    },
    db: PrismaDb = this.prisma,
  ) {
    if (!input.employeeId && !input.userId) return null;

    return db.employee.findFirst({
      where: {
        tenantId: input.tenantId,
        ...(input.employeeId
          ? { id: input.employeeId }
          : { userId: input.userId }),
      },
      select: {
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
      },
    });
  }

  /*
   * Ownership is the tenant id, not the scope key: a template placed on a
   * business unit or a team belongs to the tenant just as much as one placed at
   * tenant level, and all of them must be listed and editable.
   */
  private tenantOwnedTemplateWhere(tenantId: string) {
    return { tenantId, isSystem: false };
  }

  private visibleTemplateWhere(tenantId: string) {
    return {
      OR: [
        { scopeKey: NOTIFICATION_SYSTEM_SCOPE_KEY },
        this.tenantOwnedTemplateWhere(tenantId),
      ],
    };
  }

  listTemplates(tenantId: string, db: PrismaDb = this.prisma) {
    return db.emailTemplate.findMany({
      where: this.visibleTemplateWhere(tenantId),
      orderBy: [{ eventCode: 'asc' }, { scopeKey: 'asc' }, { version: 'desc' }],
    });
  }

  findVisibleTemplateById(
    tenantId: string,
    templateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.findFirst({
      where: { id: templateId, ...this.visibleTemplateWhere(tenantId) },
    });
  }

  findTenantTemplateById(
    tenantId: string,
    templateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.findFirst({
      where: { id: templateId, ...this.tenantOwnedTemplateWhere(tenantId) },
    });
  }

  /*
   * Confirms a placement target belongs to this tenant before a template is
   * scoped to it. Without this a user could point a template at another
   * tenant's business unit.
   */
  async scopeTargetExists(input: {
    tenantId: string;
    level: 'ORGANIZATION' | 'BUSINESS_UNIT' | 'DEPARTMENT' | 'TEAM';
    scopeId: string;
  }) {
    const where = { id: input.scopeId, tenantId: input.tenantId };
    const select = { id: true };

    switch (input.level) {
      case 'ORGANIZATION':
        return Boolean(
          await this.prisma.organization.findFirst({ where, select }),
        );
      case 'BUSINESS_UNIT':
        return Boolean(
          await this.prisma.businessUnit.findFirst({ where, select }),
        );
      case 'DEPARTMENT':
        return Boolean(
          await this.prisma.department.findFirst({ where, select }),
        );
      case 'TEAM':
        return Boolean(await this.prisma.team.findFirst({ where, select }));
    }
  }

  createTenantTemplate(input: TenantEmailTemplateWriteInput) {
    const scopeKey =
      input.scopeKey ?? buildTenantNotificationScopeKey(input.tenantId);

    return this.prisma.$transaction(async (tx) => {
      if (input.status === EmailTemplateStatus.ACTIVE) {
        await this.archiveActiveTemplatesInScope(
          input.tenantId,
          scopeKey,
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
          moduleKey: input.moduleKey ?? null,
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
      await this.archiveActiveTemplatesInScope(
        tenantId,
        template.scopeKey,
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

  /* Flat placement targets for the template and workflow authoring screens. */
  async listScopeTargets(tenantId: string) {
    const select = { id: true, name: true };
    const orderBy = { name: 'asc' } as const;

    const [organizations, businessUnits, departments, teams] =
      await Promise.all([
        this.prisma.organization.findMany({
          where: { tenantId },
          select,
          orderBy,
        }),
        this.prisma.businessUnit.findMany({
          where: { tenantId },
          select: { ...select, organizationId: true },
          orderBy,
        }),
        this.prisma.department.findMany({
          where: { tenantId },
          select: { ...select, businessUnitId: true },
          orderBy,
        }),
        this.prisma.team.findMany({
          where: { tenantId },
          select: { ...select, departmentId: true },
          orderBy,
        }),
      ]);

    return { organizations, businessUnits, departments, teams };
  }

  findTemplateByScopeAndKey(scopeKey: string, templateKey: string) {
    return this.prisma.emailTemplate.findUnique({
      where: { scopeKey_templateKey: { scopeKey, templateKey } },
      select: { id: true },
    });
  }

  archiveTenantTemplate(tenantId: string, templateId: string) {
    return this.prisma.emailTemplate.updateMany({
      where: { id: templateId, ...this.tenantOwnedTemplateWhere(tenantId) },
      data: { status: EmailTemplateStatus.ARCHIVED },
    });
  }

  /*
   * Activating one template retires the previous active version of the same key
   * at the same scope only. Archiving across scopes would let a team template
   * silently switch off the tenant default every other team still relies on.
   */
  private archiveActiveTemplatesInScope(
    tenantId: string,
    scopeKey: string,
    templateKey: string,
    excludeTemplateId?: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.emailTemplate.updateMany({
      where: {
        tenantId,
        scopeKey,
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

  listRetryableDeliveryLogs(tenantId: string, db: PrismaDb = this.prisma) {
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
        status: NotificationStatus.UNREAD,
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
      data: { readAt: new Date(), status: NotificationStatus.READ },
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
      data: { archivedAt: new Date(), status: NotificationStatus.ARCHIVED },
    });
  }

  async markInAppNotificationPopupShown(
    tenantId: string,
    userId: string,
    recipientId: string,
    db: PrismaDb = this.prisma,
  ) {
    const now = new Date();
    const recipient = await db.notificationRecipient.findFirst({
      where: { id: recipientId, tenantId, userId },
      select: { notificationId: true, popupShownAt: true },
    });

    if (!recipient) {
      return { count: 0 };
    }

    const result = await db.notificationRecipient.updateMany({
      where: { id: recipientId, tenantId, userId },
      data: { popupShownAt: recipient.popupShownAt ?? now },
    });

    if (!recipient.popupShownAt) {
      await this.createInteractionLog(
        {
          tenantId,
          userId,
          notificationId: recipient.notificationId,
          action: NotificationInteractionAction.POPUP_SHOWN,
        },
        db,
      );
    }

    return result;
  }

  listEnabledRules(
    input: { tenantId: string; moduleKey: string; eventKey: string },
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationRule.findMany({
      where: {
        tenantId: input.tenantId,
        moduleKey: input.moduleKey,
        eventKey: input.eventKey,
        enabled: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findNotificationTemplate(
    input: { tenantId: string; templateKey: string; moduleKey?: string },
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationTemplate.findFirst({
      where: {
        templateKey: input.templateKey,
        enabled: true,
        ...(input.moduleKey ? { moduleKey: input.moduleKey } : {}),
        OR: [{ tenantId: input.tenantId }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findActiveNotificationByDedupeKey(
    input: { tenantId: string; recipientUserId: string; dedupeKey: string },
    db: PrismaDb = this.prisma,
  ) {
    return db.notification.findFirst({
      where: {
        tenantId: input.tenantId,
        recipientUserId: input.recipientUserId,
        dedupeKey: input.dedupeKey,
        status: {
          notIn: [
            NotificationStatus.ARCHIVED,
            NotificationStatus.EXPIRED,
            NotificationStatus.SUPERSEDED,
            NotificationStatus.ACTIONED,
          ],
        },
      },
      include: { recipients: true },
    });
  }

  async createTrackedNotification(
    input: {
      tenantId: string;
      recipientUserId: string;
      actorUserId?: string | null;
      eventKey: string;
      moduleKey: string;
      type: NotificationType;
      category: NotificationEventCategory;
      severity?: string;
      priority: number;
      title: string;
      summary: string;
      body?: string | null;
      relatedEntityType: string;
      relatedEntityId: string;
      relatedRecordNumber?: string | null;
      routeName?: string | null;
      actionLabel?: string | null;
      targetUrl?: string | null;
      metadata?: Record<string, unknown> | null;
      requiresAction: boolean;
      expiresAtUtc?: Date | null;
      userTimeZone?: string | null;
      tenantTimeZone?: string | null;
      dedupeKey?: string | null;
      displayMode?: NotificationDisplayMode;
    },
    db: PrismaDb = this.prisma,
  ) {
    const now = new Date();
    const notification = await db.notification.create({
      data: {
        tenantId: input.tenantId,
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId ?? null,
        eventCode: input.eventKey,
        eventKey: input.eventKey,
        moduleKey: input.moduleKey,
        type: input.type,
        category: input.category,
        severity: input.severity ?? 'normal',
        priority: input.priority,
        title: input.title,
        summary: input.summary,
        body: input.body ?? null,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        relatedRecordNumber: input.relatedRecordNumber ?? null,
        routeName: input.routeName ?? null,
        actionLabel: input.actionLabel ?? null,
        targetUrl: input.targetUrl ?? null,
        payload:
          input.metadata === undefined || input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        metadata:
          input.metadata === undefined || input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        requiresAction: input.requiresAction,
        createdById: input.actorUserId ?? null,
        createdAtUtc: now,
        expiresAtUtc: input.expiresAtUtc ?? null,
        userTimeZone: input.userTimeZone ?? null,
        tenantTimeZone: input.tenantTimeZone ?? null,
        dedupeKey: input.dedupeKey ?? null,
        recipients: {
          create: {
            tenantId: input.tenantId,
            userId: input.recipientUserId,
            status: NotificationStatus.UNREAD,
            deliveredAt: now,
          },
        },
      },
      include: { recipients: true },
    });

    await this.createInteractionLog(
      {
        tenantId: input.tenantId,
        notificationId: notification.id,
        userId: input.recipientUserId,
        action: NotificationInteractionAction.CREATED,
        metadata: { displayMode: input.displayMode ?? null },
      },
      db,
    );

    return notification;
  }

  createInteractionLog(
    input: {
      tenantId: string;
      notificationId: string;
      userId: string;
      action: NotificationInteractionAction;
      userTimeZone?: string | null;
      eventLocalTime?: Date | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    db: PrismaDb = this.prisma,
  ) {
    const eventAtUtc = new Date();
    const retentionUntilUtc = new Date(
      eventAtUtc.getTime() + 90 * 24 * 60 * 60 * 1000,
    );

    return db.notificationInteractionLog.create({
      data: {
        tenantId: input.tenantId,
        notificationId: input.notificationId,
        userId: input.userId,
        action: input.action,
        eventAtUtc,
        userTimeZone: input.userTimeZone ?? null,
        eventLocalTime: input.eventLocalTime ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata:
          input.metadata === undefined || input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        retentionUntilUtc,
      },
    });
  }

  cleanupExpiredNotificationInteractionLogs(
    beforeUtc = new Date(),
    db: PrismaDb = this.prisma,
  ) {
    return db.notificationInteractionLog.deleteMany({
      where: { retentionUntilUtc: { lt: beforeUtc } },
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
