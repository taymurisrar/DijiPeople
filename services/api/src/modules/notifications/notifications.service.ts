import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailProviderSetting,
  EmailProviderType,
  NotificationChannel,
  NotificationDisplayMode,
  NotificationEventCategory,
  NotificationRecipientResolverType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import {
  CreateEmailProviderDto,
  EmailDeliveryLogQueryDto,
  InAppDeliveryLogQueryDto,
  UpdateEmailProviderDto,
  UpdateNotificationPreferencesDto,
  UpdateNotificationRuleDto,
} from './dto';
import { SUPPORTED_EMAIL_PROVIDER_TYPES } from '@repo/config';
import { EmailService } from './email/email.service';
import { EffectiveEmailProviderService } from './email/effective-email-provider.service';
import { PROVIDER_SCHEMAS } from './email/provider-field-schema';
import { isSinkProvider } from './email/providers';
import { AUTH_NOTIFICATION_EVENTS } from './email/email-execution.service';
import {
  maskSensitiveConfiguration,
  mergeConfigurationPreservingMaskedSecrets,
  SECRET_KEY_PATTERN,
} from './email/email-safety';
import {} from './notifications.constants';
import {
  isConfigurableEvent,
  isRetiredEventCode,
  NOTIFICATION_EVENT_CATALOG,
} from './notification-events.catalog';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { NotificationsRepository } from './notifications.repository';
import { WorkflowRuntimeService } from '../workflows/workflow-runtime.service';
import type {
  EmailDeliveryLogCreateInput,
  EmailProviderLookupInput,
  EmailTemplateLookupInput,
  NotificationPreferenceLookupInput,
} from './interfaces/notification-contracts.interface';

const CATALOG_BY_CODE = new Map(
  NOTIFICATION_EVENT_CATALOG.map((event) => [event.code, event]),
);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsRepository: NotificationsRepository,
    private readonly emailService: EmailService,
    private readonly secretEncryption: SecretEncryptionService,
    @Inject(forwardRef(() => WorkflowRuntimeService))
    private readonly workflowRuntime: WorkflowRuntimeService,
    private readonly effectiveProvider: EffectiveEmailProviderService,
    private readonly auditService: AuditService,
  ) {}

  listEvents() {
    return this.notificationsRepository.listEvents();
  }

  async getEvent(code: string) {
    const event = await this.notificationsRepository.findEventByCode(
      code.trim(),
    );
    if (!event) {
      throw new NotFoundException('Notification event was not found.');
    }
    return event;
  }

  /*
   * BUG-3375 / ITEM-0169. Retired catalog codes (see RETIRED_EVENT_ALIASES)
   * are hidden here rather than in the catalog itself, because the catalog
   * still has to keep them as real rows for historical delivery logs and
   * templates to resolve against. `configurable` and `availability` come from
   * the TypeScript catalog, not the database — `NotificationEvent` carries no
   * such column — so a code the catalog no longer names falls back to the
   * permissive defaults rather than failing.
   */
  async listPreferences(currentUser: AuthenticatedUser) {
    const [events, preferences] = await Promise.all([
      this.notificationsRepository.listEvents(),
      this.notificationsRepository.listPreferences(currentUser.tenantId),
    ]);

    return {
      items: events
        .filter((event) => !isRetiredEventCode(event.code))
        .flatMap((event) => {
          const catalogEntry = CATALOG_BY_CODE.get(event.code);
          const configurable = catalogEntry
            ? isConfigurableEvent(catalogEntry)
            : true;
          const availability = catalogEntry?.availability ?? 'ACTIVE';

          return event.supportedChannels.map((channel) => {
            const preference = preferences.find(
              (item) =>
                item.eventCode === event.code && item.channel === channel,
            );

            return {
              eventCode: event.code,
              channel,
              enabled:
                availability !== 'ACTIVE'
                  ? false
                  : (preference?.enabled ?? event.enabledByDefault),
              preferenceId: preference?.id ?? null,
              metadata: preference?.metadata ?? null,
              configurable,
              availability,
            };
          });
        }),
    };
  }

  async updatePreferences(
    currentUser: AuthenticatedUser,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const events = await this.notificationsRepository.listEvents();
    const eventsByCode = new Map(events.map((event) => [event.code, event]));

    const updated: unknown[] = [];
    for (const preference of dto.preferences) {
      const event = eventsByCode.get(preference.eventCode);
      if (!event) {
        throw new BadRequestException(
          `Unsupported notification event: ${preference.eventCode}.`,
        );
      }

      if (!event.supportedChannels.includes(preference.channel)) {
        throw new BadRequestException(
          `Channel ${preference.channel} is not supported for event ${preference.eventCode}.`,
        );
      }

      const catalogEntry = CATALOG_BY_CODE.get(preference.eventCode);
      if (
        isRetiredEventCode(preference.eventCode) ||
        (catalogEntry &&
          catalogEntry.availability !== undefined &&
          catalogEntry.availability !== 'ACTIVE') ||
        (catalogEntry && !isConfigurableEvent(catalogEntry))
      ) {
        throw new AppError('NOTIFICATION_EVENT_NOT_CONFIGURABLE', {
          message: `${preference.eventCode} is required or not yet available and cannot be changed here.`,
        });
      }

      const before = await this.notificationsRepository.findPreference({
        tenantId: currentUser.tenantId,
        eventCode: preference.eventCode,
        channel: preference.channel,
      });

      const saved = await this.notificationsRepository.upsertTenantPreference({
        tenantId: currentUser.tenantId,
        eventCode: preference.eventCode,
        channel: preference.channel,
        enabled: preference.enabled,
        metadata:
          preference.metadata === undefined || preference.metadata === null
            ? Prisma.JsonNull
            : (preference.metadata as Prisma.InputJsonValue),
      });
      updated.push(saved);

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'notification_preference.updated',
        entityType: 'NotificationPreference',
        entityId: saved.id,
        beforeSnapshot: before,
        afterSnapshot: {
          eventCode: saved.eventCode,
          channel: saved.channel,
          enabled: saved.enabled,
        },
      });
    }

    return { items: updated };
  }

  /*
   * BUG-3375. The screen an administrator actually needs: for every catalog
   * event, does a NotificationRule exist for this tenant and is it enabled.
   * `NOT_CONFIGURED` (no row at all) is the state BUG-3375 exists because
   * nothing could previously show — `emit()` produces nothing for it, silently.
   */
  async listRules(currentUser: AuthenticatedUser) {
    const [events, rules] = await Promise.all([
      this.notificationsRepository.listEvents(),
      this.notificationsRepository.listRulesForTenant(currentUser.tenantId),
    ]);

    const ruleByEventKey = new Map(rules.map((rule) => [rule.eventKey, rule]));

    return {
      items: events
        .filter((event) => !isRetiredEventCode(event.code))
        .map((event) => {
          const catalogEntry = CATALOG_BY_CODE.get(event.code);
          const configurable = catalogEntry
            ? isConfigurableEvent(catalogEntry)
            : true;
          const availability = catalogEntry?.availability ?? 'ACTIVE';
          const rule = ruleByEventKey.get(event.code);

          const ruleStatus = !configurable
            ? ('ALWAYS_ON' as const)
            : availability !== 'ACTIVE'
              ? ('NOT_YET_AVAILABLE' as const)
              : !rule
                ? ('NOT_CONFIGURED' as const)
                : rule.enabled
                  ? ('ENABLED' as const)
                  : ('DISABLED' as const);

          return {
            eventCode: event.code,
            name: event.name,
            description: event.description,
            category: event.category,
            configurable,
            availability,
            ruleId: rule?.id ?? null,
            ruleStatus,
            moduleKey: rule?.moduleKey ?? null,
            channels: rule?.channels ?? [],
            priority: rule?.priority ?? null,
            displayMode: rule?.displayMode ?? null,
            requiresAction: rule?.requiresAction ?? null,
            recipientResolverType: rule?.recipientResolverType ?? null,
          };
        }),
    };
  }

  async updateRule(
    currentUser: AuthenticatedUser,
    ruleId: string,
    dto: UpdateNotificationRuleDto,
  ) {
    const existing = await this.notificationsRepository.findRuleById(
      currentUser.tenantId,
      ruleId,
    );
    if (!existing) {
      throw new AppError('NOTIFICATION_RULE_NOT_FOUND');
    }

    const beforeSnapshot = {
      enabled: existing.enabled,
      channels: existing.channels,
      priority: existing.priority,
      displayMode: existing.displayMode,
      requiresAction: existing.requiresAction,
    };

    const updated = await this.notificationsRepository.updateRule(
      currentUser.tenantId,
      ruleId,
      {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.channels !== undefined ? { channels: dto.channels } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.displayMode !== undefined
          ? { displayMode: dto.displayMode }
          : {}),
        ...(dto.requiresAction !== undefined
          ? { requiresAction: dto.requiresAction }
          : {}),
      },
    );

    if (!updated) {
      throw new AppError('NOTIFICATION_RULE_NOT_FOUND');
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'notification_rule.updated',
      entityType: 'NotificationRule',
      entityId: ruleId,
      beforeSnapshot,
      afterSnapshot: {
        enabled: updated.enabled,
        channels: updated.channels,
        priority: updated.priority,
        displayMode: updated.displayMode,
        requiresAction: updated.requiresAction,
      },
    });

    return updated;
  }

  /*
   * ITEM-0168. A manual, operator-initiated retry of one delivery log. Only
   * a FAILED, retryable row is eligible — a NOT_DELIVERED row went through a
   * sink provider on purpose (BUG-3379/BUG-2741) and retrying it would only
   * produce a second identical NOT_DELIVERED row, so that case is refused with
   * an explanation rather than attempted.
   *
   * Re-renders the template using the ORIGINAL variables captured on the log
   * at send time (`metadata.originalVariables`, added alongside this feature)
   * rather than re-sending a stored rendered body — `EmailDeliveryLog` never
   * stored the rendered html/text, only the subject, so "resend exactly what
   * was sent" is not something the schema can do without a migration. Using
   * the captured variables gets the same effective content (the template
   * itself may since have changed, which is a feature, not a bug: a retry
   * after a broken template was fixed should use the fix). AUTH_* events
   * never capture variables at all — see the note in
   * EmailExecutionService.buildMetadata — so they are refused here rather
   * than replayed with an empty variable set.
   */
  async retryDeliveryLog(
    currentUser: AuthenticatedUser,
    deliveryLogId: string,
  ) {
    const log = await this.notificationsRepository.findDeliveryLogById(
      currentUser.tenantId,
      deliveryLogId,
    );
    if (!log) {
      throw new NotFoundException('Email delivery log was not found.');
    }

    if (log.channel !== NotificationChannel.EMAIL) {
      throw new AppError('EMAIL_DELIVERY_LOG_NOT_RETRYABLE', {
        message: 'Only email deliveries can be retried.',
      });
    }

    if (AUTH_NOTIFICATION_EVENTS.has(log.eventCode)) {
      throw new AppError('EMAIL_DELIVERY_LOG_NOT_RETRYABLE', {
        message:
          'Account activation and password reset links are not retried from the delivery log — they carry a one-time credential and expire. Re-trigger the original action (resend the invite, or request a new reset link) instead.',
      });
    }

    const resolvedCapability = await this.effectiveProvider.describeForTenant(
      currentUser.tenantId,
    );
    if (
      resolvedCapability?.providerType &&
      isSinkProvider(resolvedCapability.providerType)
    ) {
      throw new AppError('EMAIL_DELIVERY_LOG_NOT_RETRYABLE', {
        message:
          'This workspace currently sends through a Console/Dev sink provider, which accepts and discards mail. Retrying would only produce another undelivered row — configure a real provider first.',
      });
    }

    if (!log.retryable || log.status !== EmailDeliveryStatus.FAILED) {
      throw new AppError('EMAIL_DELIVERY_LOG_NOT_RETRYABLE', {
        message:
          'Only a failed, retryable delivery can be retried from its record.',
      });
    }

    const metadata = (log.metadata ?? {}) as Record<string, unknown>;
    const originalVariables = metadata.originalVariables;
    if (
      !originalVariables ||
      typeof originalVariables !== 'object' ||
      Array.isArray(originalVariables)
    ) {
      throw new AppError('EMAIL_DELIVERY_LOG_NOT_RETRYABLE', {
        message:
          'This delivery predates variable capture and cannot be replayed automatically. Re-trigger the original action instead.',
      });
    }

    const beforeSnapshot = {
      status: log.status,
      retryCount: log.retryCount,
      providerMessageId: log.providerMessageId,
    };

    const result = await this.emailService.sendTemplateEmail({
      tenantId: currentUser.tenantId,
      eventCode: log.eventCode,
      templateId: log.templateId ?? undefined,
      recipient: log.recipient,
      cc: log.cc,
      bcc: log.bcc,
      variables: originalVariables as Record<string, unknown>,
      requestedByUserId: currentUser.userId,
      metadata: {
        retryOfDeliveryLogId: log.id,
        sourceModule: 'notifications.retry',
      },
    });

    await this.notificationsRepository.updateDeliveryLogStatus(
      currentUser.tenantId,
      log.id,
      { retryCount: { increment: 1 }, lastRetryAt: new Date() },
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'notification_delivery_log.retried',
      entityType: 'EmailDeliveryLog',
      entityId: log.id,
      beforeSnapshot,
      afterSnapshot: {
        status: result.status,
        deliveryLogId: result.deliveryLogId,
        providerMessageId: result.providerMessageId ?? null,
      },
    });

    /*
     * ITEM-0168. The retry lands on a NEW row — `sendTemplateEmail` always
     * creates one, by design (a retry adds to history rather than overwriting
     * it). Returning only the original (still FAILED, with an incremented
     * retryCount) would leave the caller unable to show the one fact a retry
     * exists to answer: did it work this time. Both are returned so the
     * record page can show the outcome inline without a second navigation.
     */
    const [retriedLog, newDeliveryLog] = await Promise.all([
      this.getDeliveryLog(currentUser, deliveryLogId),
      this.getDeliveryLog(currentUser, result.deliveryLogId),
    ]);

    return { retriedLog, newDeliveryLog };
  }

  async listProviderSettings(currentUser: AuthenticatedUser) {
    const providers = await this.notificationsRepository.listProviderSettings(
      currentUser.tenantId,
    );
    return { items: providers.map(mapEmailProviderSetting) };
  }

  /**
   * Which provider will actually carry this tenant's mail, and whether the
   * tenant configured it or inherited it.
   *
   * ITEM-0129. `listProviderSettings` returns only the tenant's OWN rows, so a
   * tenant relying on the platform relay sees an empty list and a screen that
   * reads as broken — while its mail is in fact being delivered perfectly well.
   * Inheriting and having nothing configured were indistinguishable. This
   * answers the question the screen actually needs to ask.
   */
  describeEffectiveProvider(currentUser: AuthenticatedUser) {
    return this.effectiveProvider.describeForTenant(currentUser.tenantId);
  }

  async getProvider(currentUser: AuthenticatedUser, providerId: string) {
    const provider = await this.notificationsRepository.findProviderById(
      currentUser.tenantId,
      providerId,
    );
    if (!provider) {
      throw new NotFoundException('Email provider setting was not found.');
    }
    return mapEmailProviderSetting(provider);
  }

  /**
   * What each provider type needs configured, and which types an administrator
   * may choose here.
   *
   * BUG-3501. The settings screen used to offer `SUPPORTED_EMAIL_PROVIDER_TYPES`
   * straight from `@repo/config`, so production offered CONSOLE and DEV. The
   * web app cannot tell production from a preview build on its own, so the API
   * — which is the authority that refuses them — publishes the list instead.
   * `items` is unchanged, so an older screen keeps working.
   */
  listProviderFieldSchema() {
    const sinksRetired = this.effectiveProvider.sinkProvidersRetired();
    return {
      items: PROVIDER_SCHEMAS,
      selectableProviderTypes: SUPPORTED_EMAIL_PROVIDER_TYPES.filter(
        (providerType) =>
          !(sinksRetired && isSinkProvider(providerType as EmailProviderType)),
      ),
    };
  }

  async createProvider(
    currentUser: AuthenticatedUser,
    dto: CreateEmailProviderDto,
  ) {
    this.assertProviderTypeAllowed(dto.providerType);
    const configuration = normalizeConfiguration(dto.configuration);
    validateProviderConfiguration(dto.providerType, configuration);

    const enabled = dto.enabled ?? false;
    const isDefault = enabled && Boolean(dto.isDefault);
    const provider = await this.notificationsRepository.createProvider({
      tenantId: currentUser.tenantId,
      providerType: dto.providerType,
      providerName: dto.providerName.trim(),
      enabled,
      isDefault,
      fromEmail: dto.fromEmail.trim().toLowerCase(),
      fromName: dto.fromName.trim(),
      replyToEmail: dto.replyToEmail?.trim().toLowerCase() || null,
      configuration: this.protectConfiguration(configuration),
    });

    await this.auditProviderChange(currentUser, 'email_provider.created', {
      entityId: provider.id,
      before: null,
      after: provider,
    });

    return mapEmailProviderSetting(provider);
  }

  async updateProvider(
    currentUser: AuthenticatedUser,
    providerId: string,
    dto: UpdateEmailProviderDto,
  ) {
    const existing = await this.notificationsRepository.findProviderById(
      currentUser.tenantId,
      providerId,
    );
    if (!existing) {
      throw new NotFoundException('Email provider setting was not found.');
    }

    const providerType = dto.providerType ?? existing.providerType;
    const enabled = dto.enabled ?? existing.enabled;
    /*
     * An existing Console row may still be disabled, renamed while disabled, or
     * switched to SMTP — that is how an administrator cleans it up. What
     * production refuses is a row that ends up a sink AND is either enabled or
     * newly switched into a sink type.
     */
    if (
      isSinkProvider(providerType) &&
      (enabled || providerType !== existing.providerType)
    ) {
      this.assertProviderTypeAllowed(providerType);
    }
    const configuration =
      dto.configuration !== undefined
        ? mergeConfigurationPreservingMaskedSecrets(
            existing.configuration,
            normalizeConfiguration(dto.configuration),
          )
        : (existing.configuration as Record<string, unknown>);
    validateProviderConfiguration(providerType, configuration);

    const isDefault = enabled ? (dto.isDefault ?? existing.isDefault) : false;

    const provider = await this.notificationsRepository.updateProvider(
      currentUser.tenantId,
      providerId,
      {
        ...(dto.providerType !== undefined ? { providerType } : {}),
        ...(dto.providerName !== undefined
          ? { providerName: dto.providerName.trim() }
          : {}),
        ...(dto.enabled !== undefined ? { enabled } : {}),
        ...(dto.isDefault !== undefined || dto.enabled !== undefined
          ? { isDefault }
          : {}),
        ...(dto.fromEmail !== undefined
          ? { fromEmail: dto.fromEmail.trim().toLowerCase() }
          : {}),
        ...(dto.fromName !== undefined
          ? { fromName: dto.fromName.trim() }
          : {}),
        ...(dto.replyToEmail !== undefined
          ? { replyToEmail: dto.replyToEmail?.trim().toLowerCase() || null }
          : {}),
        ...(dto.configuration !== undefined
          ? { configuration: this.protectConfiguration(configuration) }
          : {}),
      },
    );

    await this.auditProviderChange(currentUser, 'email_provider.updated', {
      entityId: provider.id,
      before: existing,
      after: provider,
    });

    return mapEmailProviderSetting(provider);
  }

  async validateProvider(currentUser: AuthenticatedUser, providerId: string) {
    const provider = await this.notificationsRepository.findProviderById(
      currentUser.tenantId,
      providerId,
    );
    if (!provider) {
      throw new NotFoundException('Email provider setting was not found.');
    }

    const configuration = normalizeConfiguration(
      provider.configuration as Record<string, unknown>,
    );
    validateProviderConfiguration(provider.providerType, configuration);

    return {
      valid: true,
      providerType: provider.providerType,
      providerName: provider.providerName,
      configuration: maskSensitiveConfiguration(configuration),
    };
  }

  async setDefaultProvider(currentUser: AuthenticatedUser, providerId: string) {
    const existing = await this.notificationsRepository.findProviderById(
      currentUser.tenantId,
      providerId,
    );
    if (!existing) {
      throw new NotFoundException('Email provider setting was not found.');
    }
    // Set-default also enables the row (NotificationsRepository.setDefaultProvider),
    // so it is refused for a sink on the same terms as enabling one.
    this.assertProviderTypeAllowed(existing.providerType);

    const provider = await this.notificationsRepository.setDefaultProvider(
      currentUser.tenantId,
      providerId,
    );
    if (!provider) {
      throw new NotFoundException('Email provider setting was not found.');
    }

    await this.auditProviderChange(currentUser, 'email_provider.default_set', {
      entityId: provider.id,
      before: existing,
      after: provider,
    });

    return mapEmailProviderSetting(provider);
  }

  async disableProvider(currentUser: AuthenticatedUser, providerId: string) {
    const existing = await this.notificationsRepository.findProviderById(
      currentUser.tenantId,
      providerId,
    );
    const result = await this.notificationsRepository.disableProvider(
      currentUser.tenantId,
      providerId,
    );
    if (!existing || result.count === 0) {
      throw new NotFoundException('Email provider setting was not found.');
    }

    await this.auditProviderChange(currentUser, 'email_provider.disabled', {
      entityId: existing.id,
      before: existing,
      after: { ...existing, enabled: false, isDefault: false },
    });

    return { disabled: true };
  }

  /**
   * ADR-0015 — production refuses CONSOLE and DEV providers.
   *
   * Server-side on purpose: the settings screen stops offering them too, but a
   * hidden option is not a control, and a stale browser tab or a direct API
   * call would otherwise recreate the sink this decision retires.
   */
  private assertProviderTypeAllowed(providerType: EmailProviderType) {
    if (
      isSinkProvider(providerType) &&
      this.effectiveProvider.sinkProvidersRetired()
    ) {
      throw new BadRequestException({
        code: 'EMAIL_PROVIDER_TYPE_NOT_ALLOWED',
        message:
          'Console and Dev email providers cannot be used in production. Choose SMTP.',
      });
    }
  }

  /*
   * Provider changes decide where a tenant's mail goes, so every write is
   * audited. The snapshot deliberately omits `configuration`: even masked it
   * describes credentials, and nothing an auditor needs is in it.
   */
  private async auditProviderChange(
    currentUser: AuthenticatedUser,
    action: string,
    input: {
      entityId: string;
      before: EmailProviderSetting | null;
      after: EmailProviderSetting;
    },
  ) {
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action,
      entityType: 'EmailProviderSetting',
      entityId: input.entityId,
      beforeSnapshot: input.before ? providerAuditSnapshot(input.before) : null,
      afterSnapshot: providerAuditSnapshot(input.after),
    });
  }

  listDeliveryLogs(
    currentUser: AuthenticatedUser,
    query: EmailDeliveryLogQueryDto,
  ) {
    return this.notificationsRepository.listDeliveryLogs(
      currentUser.tenantId,
      query,
    );
  }

  /**
   * ITEM-0182 — in-app deliveries across the tenant.
   *
   * Flattened to the row a log table shows. The recipient is identified by
   * name and work email only; what the notification said stays out of the
   * log (see `listTenantInAppDeliveryLogs`).
   */
  async listInAppDeliveryLogs(
    currentUser: AuthenticatedUser,
    query: InAppDeliveryLogQueryDto,
  ) {
    const result =
      await this.notificationsRepository.listTenantInAppDeliveryLogs(
        currentUser.tenantId,
        query,
      );

    return {
      ...result,
      items: result.items.map((row) => ({
        id: row.id,
        title: row.notification.title,
        eventCode: row.notification.eventCode,
        recipient: row.user.email,
        recipientName: [row.user.firstName, row.user.lastName]
          .filter(Boolean)
          .join(' '),
        status: row.status,
        deliveredAt: row.deliveredAt,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
    };
  }

  async getDeliveryLog(currentUser: AuthenticatedUser, deliveryLogId: string) {
    const log = await this.notificationsRepository.findDeliveryLogById(
      currentUser.tenantId,
      deliveryLogId,
    );
    if (!log) {
      throw new NotFoundException('Email delivery log was not found.');
    }
    return log;
  }

  findTemplateForEvent(input: EmailTemplateLookupInput) {
    return this.notificationsRepository.findTemplateForEvent(input);
  }

  findDefaultProvider(input: EmailProviderLookupInput) {
    return this.notificationsRepository.findDefaultProvider(input);
  }

  findPreference(input: NotificationPreferenceLookupInput) {
    return this.notificationsRepository.findPreference(input);
  }

  createDeliveryLog(input: EmailDeliveryLogCreateInput) {
    return this.notificationsRepository.createDeliveryLog(input);
  }

  async emit(input: {
    tenantId: string;
    eventKey: string;
    moduleKey: string;
    actorUserId?: string | null;
    relatedEntityType: string;
    relatedEntityId: string;
    relatedRecordNumber?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const moduleKey = input.moduleKey.toLowerCase();
    const rules = await this.notificationsRepository.listEnabledRules({
      tenantId: input.tenantId,
      moduleKey,
      eventKey: input.eventKey,
    });

    /*
     * Workflows run off the same events the inbox does, so authoring one needs
     * no change in the emitting module. It is deliberately independent of the
     * inbox rules: a tenant can have a workflow for an event nobody is notified
     * about. This never throws, so a bad workflow cannot fail the action that
     * caused it.
     */
    const triggerWorkflows = () =>
      this.workflowRuntime.handleEvent({
        tenantId: input.tenantId,
        eventCode: input.eventKey,
        moduleKey,
        actorUserId: input.actorUserId ?? null,
        correlationId: input.relatedEntityId,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        variables: {
          ...(input.metadata ?? {}),
          eventKey: input.eventKey,
          moduleKey,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          relatedRecordNumber: input.relatedRecordNumber ?? '',
        },
      });

    if (!rules.length) {
      await triggerWorkflows();
      return { created: 0, items: [] };
    }

    const created: unknown[] = [];
    for (const rule of rules) {
      const ruleMetadata = mergeRecords(null, rule.metadata);
      const recipientUserIds = await this.resolveRecipients({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        moduleKey,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        resolverType: rule.recipientResolverType,
        metadata: mergeRecords(input.metadata, ruleMetadata),
      });

      if (!recipientUserIds.length) {
        this.logger.warn(
          `Notification event ${input.eventKey} resolved no recipients for ${input.moduleKey}:${input.relatedEntityType}:${input.relatedEntityId}`,
        );
        continue;
      }

      const template =
        await this.notificationsRepository.findNotificationTemplate({
          tenantId: input.tenantId,
          templateKey: rule.templateKey,
          moduleKey,
        });

      if (!template) continue;

      const variables = {
        ...(input.metadata ?? {}),
        moduleKey,
        eventKey: input.eventKey,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        relatedRecordNumber: input.relatedRecordNumber ?? '',
      };

      for (const recipientUserId of recipientUserIds) {
        const dedupeKey = this.buildDedupeKey({
          tenantId: input.tenantId,
          recipientUserId,
          eventKey: input.eventKey,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        });
        const existing =
          await this.notificationsRepository.findActiveNotificationByDedupeKey({
            tenantId: input.tenantId,
            recipientUserId,
            dedupeKey,
          });

        if (existing) continue;

        const targetUrl = this.resolveTargetUrl({
          moduleKey,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          metadata: input.metadata ?? {},
        });

        const shouldCreateInboxRecord =
          rule.channels.includes(NotificationChannel.IN_APP) ||
          rule.displayMode !== NotificationDisplayMode.EMAIL_ONLY;

        if (!shouldCreateInboxRecord) continue;

        created.push(
          await this.notificationsRepository.createTrackedNotification({
            tenantId: input.tenantId,
            recipientUserId,
            actorUserId: input.actorUserId ?? null,
            eventKey: input.eventKey,
            moduleKey,
            type: this.resolveNotificationType(
              rule.requiresAction,
              input.eventKey,
            ),
            category: this.resolveCategory(moduleKey, rule.requiresAction),
            priority: rule.priority,
            title: renderText(template.titleTemplate, variables),
            summary: renderText(template.summaryTemplate, variables),
            body: template.bodyTemplate
              ? renderText(template.bodyTemplate, variables)
              : null,
            relatedEntityType: input.relatedEntityType,
            relatedEntityId: input.relatedEntityId,
            relatedRecordNumber: input.relatedRecordNumber ?? null,
            routeName: targetUrl,
            actionLabel: 'Open record',
            targetUrl,
            metadata: {
              ...(input.metadata ?? {}),
              displayMode: rule.displayMode,
              channels: rule.channels,
            },
            requiresAction: rule.requiresAction,
            tenantTimeZone:
              stringValue(input.metadata?.tenantTimeZone) ??
              stringValue(ruleMetadata.tenantTimeZone),
            userTimeZone: stringValue(input.metadata?.userTimeZone),
            dedupeKey,
            displayMode: rule.displayMode,
          }),
        );
      }
    }

    await triggerWorkflows();

    return { created: created.length, items: created };
  }

  /**
   * The other half of `emit` for anything that asks somebody to act.
   *
   * A domain module calls this when a record reaches a state where the action
   * its notification requested can no longer be taken — cancelled, approved,
   * rejected. It is the notification layer's job rather than each call site's
   * because timesheets, claims, loans and business trips raise the same kind of
   * action-required row and would otherwise each need their own bookkeeping.
   *
   * BUG-2016. Deliberately scoped to `requiresAction` rows: an informational
   * notification about the record is still true after the record settles, and
   * removing it would be losing history rather than clearing a queue.
   */
  resolveActionRequired(input: {
    tenantId: string;
    relatedEntityType: string;
    relatedEntityId: string;
  }) {
    return this.notificationsRepository.resolveActionRequiredNotificationsForRecord(
      input,
    );
  }

  cleanupExpiredInteractionLogs(beforeUtc = new Date()) {
    // Scheduler integration is intentionally deferred until the platform has a
    // shared background job runner for retention tasks.
    return this.notificationsRepository.cleanupExpiredNotificationInteractionLogs(
      beforeUtc,
    );
  }

  bootstrapSystemDefaults() {
    return this.notificationsRepository.bootstrapSystemDefaults();
  }

  renderTemplate() {
    throw new NotImplementedException(
      'Email template rendering will be implemented in the provider integration phase.',
    );
  }

  sendNotification() {
    throw new NotImplementedException(
      'Notification dispatch will be implemented after queues/providers are introduced.',
    );
  }

  /*
   * Credentials are encrypted before they reach the database. Masking hid them
   * from API responses but left them readable in the database, a backup or a
   * replica.
   */
  private protectConfiguration(configuration: Record<string, unknown>) {
    return this.secretEncryption.encryptSecrets(configuration, (key) =>
      SECRET_KEY_PATTERN.test(key),
    ) as Prisma.InputJsonValue;
  }

  private buildDedupeKey(input: {
    tenantId: string;
    recipientUserId: string;
    eventKey: string;
    relatedEntityType: string;
    relatedEntityId: string;
  }) {
    return [
      input.tenantId,
      input.recipientUserId,
      input.eventKey,
      input.relatedEntityType,
      input.relatedEntityId,
    ].join(':');
  }

  private resolveCategory(moduleKey: string, requiresAction: boolean) {
    if (requiresAction) return NotificationEventCategory.APPROVALS;
    if (moduleKey === 'employee') return NotificationEventCategory.EMPLOYEE;
    if (moduleKey === 'attendance') return NotificationEventCategory.ATTENDANCE;
    if (moduleKey === 'leave') return NotificationEventCategory.LEAVE;
    return NotificationEventCategory.SYSTEM;
  }

  private resolveNotificationType(requiresAction: boolean, eventKey: string) {
    if (eventKey.includes('escalated')) return NotificationType.ESCALATION;
    if (requiresAction) return NotificationType.ACTION_REQUIRED;
    if (eventKey.includes('approved')) return NotificationType.SUCCESS;
    if (eventKey.includes('rejected')) return NotificationType.ERROR;
    if (eventKey.includes('expiring')) return NotificationType.REMINDER;
    return NotificationType.INFO;
  }

  private resolveTargetUrl(input: {
    moduleKey: string;
    relatedEntityType: string;
    relatedEntityId: string;
    metadata: Record<string, unknown>;
  }) {
    const explicitUrl = stringValue(input.metadata.targetUrl);
    if (explicitUrl) return explicitUrl;

    if (input.relatedEntityType === 'approvalRequest') {
      return `/approvals/${input.relatedEntityId}`;
    }
    if (input.relatedEntityType === 'employeeDocument') {
      const employeeId = stringValue(input.metadata.employeeId);
      return employeeId
        ? `/employees/${employeeId}?documentId=${encodeURIComponent(input.relatedEntityId)}`
        : '/inbox';
    }
    if (input.relatedEntityType === 'onboardingTask') {
      const onboardingId = stringValue(input.metadata.onboardingId);
      return onboardingId
        ? `/onboarding/${onboardingId}?taskId=${encodeURIComponent(input.relatedEntityId)}`
        : '/inbox';
    }
    if (input.relatedEntityType === 'attendanceRecord') {
      return `/attendance?recordId=${encodeURIComponent(input.relatedEntityId)}`;
    }
    if (input.relatedEntityType === 'attendanceCorrectionRequest') {
      return `/attendance/corrections/${input.relatedEntityId}`;
    }
    if (input.moduleKey === 'employee') {
      return `/employees/${input.relatedEntityId}`;
    }
    if (input.moduleKey === 'attendance') {
      return `/attendance?recordId=${encodeURIComponent(input.relatedEntityId)}`;
    }
    if (input.moduleKey === 'leave') {
      return `/leaves/${input.relatedEntityId}`;
    }
    return '/inbox';
  }

  private async resolveRecipients(input: {
    tenantId: string;
    actorUserId: string | null;
    moduleKey: string;
    relatedEntityType: string;
    relatedEntityId: string;
    resolverType: NotificationRecipientResolverType;
    metadata?: Record<string, unknown> | null;
  }) {
    const metadata = input.metadata ?? {};
    const recipients = new Set<string>();

    if (input.resolverType === NotificationRecipientResolverType.SELF) {
      addMaybe(recipients, input.actorUserId);
      addMaybe(recipients, stringValue(metadata.recipientUserId));
      addMany(recipients, stringArray(metadata.recipientUserIds));
    }

    if (input.resolverType === NotificationRecipientResolverType.CUSTOM_USER) {
      addMaybe(recipients, stringValue(metadata.recipientUserId));
      addMany(recipients, stringArray(metadata.recipientUserIds));
    }

    if (input.resolverType === NotificationRecipientResolverType.RECORD_OWNER) {
      addMaybe(recipients, await this.resolveRecordOwner(input));
    }

    if (
      input.resolverType === NotificationRecipientResolverType.REPORTING_MANAGER
    ) {
      addMaybe(recipients, await this.resolveReportingManager(input));
    }

    if (
      input.resolverType === NotificationRecipientResolverType.APPROVAL_ASSIGNEE
    ) {
      addMany(recipients, stringArray(metadata.approvalAssigneeUserIds));
      addMany(recipients, await this.resolveApprovalAssignees(input));
    }

    if (
      input.resolverType === NotificationRecipientResolverType.HR_ROLE ||
      input.resolverType === NotificationRecipientResolverType.MANAGER_ROLE ||
      input.resolverType === NotificationRecipientResolverType.CUSTOM_ROLE
    ) {
      addMany(recipients, await this.resolveRoleRecipients(input));
    }

    return [...recipients].filter((userId) => Boolean(userId));
  }

  private async resolveRecordOwner(input: {
    tenantId: string;
    moduleKey: string;
    relatedEntityType?: string;
    relatedEntityId: string;
    metadata?: Record<string, unknown> | null;
  }) {
    if (input.relatedEntityType === 'employeeDocument') {
      const employeeId = stringValue(input.metadata?.employeeId);
      if (!employeeId) return null;
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId: input.tenantId },
        select: { ownerUserId: true, userId: true },
      });
      return employee?.ownerUserId ?? employee?.userId ?? null;
    }

    if (input.relatedEntityType === 'onboardingTask') {
      const task = await this.prisma.onboardingTask.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { assignedUserId: true },
      });
      return task?.assignedUserId ?? null;
    }

    if (input.moduleKey === 'employee') {
      const employee = await this.prisma.employee.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { ownerUserId: true, userId: true },
      });
      return employee?.ownerUserId ?? employee?.userId ?? null;
    }

    if (input.moduleKey === 'leave') {
      const leave = await this.prisma.leaveRequest.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { employee: { select: { userId: true } } },
      });
      return leave?.employee.userId ?? null;
    }

    if (input.moduleKey === 'attendance') {
      if (input.relatedEntityType === 'attendanceCorrectionRequest') {
        const request = await this.prisma.attendanceCorrectionRequest.findFirst(
          {
            where: { id: input.relatedEntityId, tenantId: input.tenantId },
            select: { employee: { select: { userId: true } } },
          },
        );
        return request?.employee.userId ?? null;
      }

      const attendance = await this.prisma.attendanceEntry.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { employee: { select: { userId: true } } },
      });
      return attendance?.employee.userId ?? null;
    }

    return null;
  }

  private async resolveReportingManager(input: {
    tenantId: string;
    moduleKey: string;
    relatedEntityId: string;
  }) {
    const employeeId = await this.resolveRelatedEmployeeId(input);
    if (!employeeId) return null;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: input.tenantId },
      select: { manager: { select: { userId: true } } },
    });

    return employee?.manager?.userId ?? null;
  }

  private async resolveRelatedEmployeeId(input: {
    tenantId: string;
    moduleKey: string;
    relatedEntityType?: string;
    relatedEntityId: string;
    metadata?: Record<string, unknown> | null;
  }) {
    if (input.relatedEntityType === 'employeeDocument') {
      return stringValue(input.metadata?.employeeId);
    }
    if (input.relatedEntityType === 'onboardingTask') {
      const task = await this.prisma.onboardingTask.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: {
          employeeOnboarding: {
            select: {
              employeeId: true,
              targetReportingManagerEmployeeId: true,
            },
          },
        },
      });
      return (
        task?.employeeOnboarding.employeeId ??
        task?.employeeOnboarding.targetReportingManagerEmployeeId ??
        null
      );
    }
    if (input.moduleKey === 'employee') return input.relatedEntityId;
    if (input.moduleKey === 'leave') {
      const leave = await this.prisma.leaveRequest.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { employeeId: true },
      });
      return leave?.employeeId ?? null;
    }
    if (input.moduleKey === 'attendance') {
      if (input.relatedEntityType === 'attendanceCorrectionRequest') {
        const request = await this.prisma.attendanceCorrectionRequest.findFirst(
          {
            where: { id: input.relatedEntityId, tenantId: input.tenantId },
            select: { employeeId: true },
          },
        );
        return request?.employeeId ?? null;
      }

      const attendance = await this.prisma.attendanceEntry.findFirst({
        where: { id: input.relatedEntityId, tenantId: input.tenantId },
        select: { employeeId: true },
      });
      return attendance?.employeeId ?? null;
    }
    return null;
  }

  private async resolveApprovalAssignees(input: {
    tenantId: string;
    moduleKey: string;
    relatedEntityType?: string;
    relatedEntityId: string;
  }) {
    if (
      input.moduleKey === 'attendance' &&
      input.relatedEntityType === 'attendanceCorrectionRequest'
    ) {
      const assignments = await this.prisma.approvalAssignment.findMany({
        where: {
          tenantId: input.tenantId,
          status: 'PENDING',
          assignedToUserId: { not: null },
          approvalRequest: {
            moduleKey: 'attendance',
            entityType: 'attendanceCorrectionRequest',
            entityId: input.relatedEntityId,
          },
        },
        select: { assignedToUserId: true },
      });
      return assignments.flatMap((assignment) =>
        assignment.assignedToUserId ? [assignment.assignedToUserId] : [],
      );
    }

    if (input.moduleKey !== 'leave') return [];
    const steps = await this.prisma.leaveApprovalStep.findMany({
      where: {
        tenantId: input.tenantId,
        leaveRequestId: input.relatedEntityId,
        status: 'PENDING',
        approverUserId: { not: null },
      },
      select: { approverUserId: true },
    });
    return steps.flatMap((step) =>
      step.approverUserId ? [step.approverUserId] : [],
    );
  }

  private async resolveRoleRecipients(input: {
    tenantId: string;
    resolverType: NotificationRecipientResolverType;
    metadata?: Record<string, unknown> | null;
  }) {
    const metadata = input.metadata ?? {};
    const roleIds = stringArray(metadata.roleIds);
    const configuredRoleKey = stringValue(metadata.roleKey);
    const roleWhere: Prisma.RoleWhereInput = roleIds.length
      ? { id: { in: roleIds } }
      : configuredRoleKey
        ? { key: configuredRoleKey }
        : { id: '__no_configured_role__' };

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        userRoles: {
          some: { role: { tenantId: input.tenantId, ...roleWhere } },
        },
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }
}

function normalizeConfiguration(configuration: Record<string, unknown>) {
  if (!configuration || typeof configuration !== 'object') {
    throw new BadRequestException('Provider configuration must be an object.');
  }
  return configuration;
}

function validateProviderConfiguration(
  providerType: EmailProviderType,
  configuration: Record<string, unknown>,
) {
  const providerTypeKey = String(providerType);

  if (['CONSOLE', 'DEV'].includes(providerTypeKey)) {
    return;
  }

  if (providerType === EmailProviderType.SMTP) {
    const hasHost = typeof configuration.host === 'string';
    const hasPort =
      typeof configuration.port === 'number' ||
      typeof configuration.port === 'string';
    const hasAuthObject =
      typeof configuration.auth === 'object' && configuration.auth !== null;
    const hasUsername = typeof configuration.username === 'string';
    const hasPassword = typeof configuration.password === 'string';

    if (
      !hasHost ||
      !hasPort ||
      (!hasAuthObject && (!hasUsername || !hasPassword))
    ) {
      throw new BadRequestException(
        'SMTP providers require host, port, and either auth or username/password.',
      );
    }
    return;
  }

  if (
    ['SES', 'SENDGRID', 'MAILGUN', 'POSTMARK', 'CUSTOM'].includes(
      providerTypeKey,
    )
  ) {
    const hasSecret = Object.entries(configuration).some(
      ([key, value]) =>
        SECRET_KEY_PATTERN.test(key) &&
        typeof value === 'string' &&
        value.trim().length > 0,
    );

    if (!hasSecret) {
      throw new BadRequestException(
        `${providerType} providers require an API key, token, secret, or equivalent credential in configuration.`,
      );
    }
  }
}

function providerAuditSnapshot(provider: EmailProviderSetting) {
  return {
    providerType: provider.providerType,
    providerName: provider.providerName,
    enabled: provider.enabled,
    isDefault: provider.isDefault,
    fromEmail: provider.fromEmail,
    fromName: provider.fromName,
    replyToEmail: provider.replyToEmail,
  };
}

function mapEmailProviderSetting(provider: EmailProviderSetting) {
  return {
    id: provider.id,
    tenantId: provider.tenantId,
    providerType: provider.providerType,
    providerName: provider.providerName,
    enabled: provider.enabled,
    isDefault: provider.isDefault,
    fromEmail: provider.fromEmail,
    fromName: provider.fromName,
    replyToEmail: provider.replyToEmail,
    configuration: maskSensitiveConfiguration(provider.configuration),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function renderText(template: string, variables: Record<string, unknown>) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_, key: string) => {
      const value = resolvePath(variables, key);
      if (value === null || value === undefined) return '';
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value);
      }
      return '';
    },
  );
}

function resolvePath(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }
  const single = stringValue(value);
  return single ? [single] : [];
}

function addMaybe(target: Set<string>, value: string | null | undefined) {
  if (value) target.add(value);
}

function addMany(target: Set<string>, values: string[]) {
  values.forEach((value) => addMaybe(target, value));
}

function mergeRecords(
  left: Record<string, unknown> | null | undefined,
  right: unknown,
) {
  const rightRecord =
    right && typeof right === 'object' && !Array.isArray(right)
      ? (right as Record<string, unknown>)
      : {};
  return { ...(left ?? {}), ...rightRecord };
}
