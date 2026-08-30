import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  EmailProviderSetting,
  EmailProviderType,
  EmailTemplate,
  EmailTemplateStatus,
  NotificationChannel,
  NotificationDisplayMode,
  NotificationEventCategory,
  NotificationRecipientResolverType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CloneEmailTemplateDto,
  CreateEmailProviderDto,
  CreateEmailTemplateDto,
  EmailDeliveryLogQueryDto,
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailProviderDto,
  UpdateEmailTemplateDto,
  UpdateNotificationPreferencesDto,
} from './dto';
import { EmailService } from './email/email.service';
import {
  maskSensitiveConfiguration,
  mergeConfigurationPreservingMaskedSecrets,
  sanitizeHtmlTemplate,
  SECRET_KEY_PATTERN,
} from './email/email-safety';
import { TENANT_MODULES } from '../../common/constants/tenant-modules';
import {
  buildNotificationScopeKey,
  EMAIL_TEMPLATE_SCOPE_LEVELS,
  buildTenantNotificationScopeKey,
  EmailTemplateScopeLevel,
  parseNotificationScopeKey,
} from './notifications.constants';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { NotificationsRepository } from './notifications.repository';
import { WorkflowRuntimeService } from '../workflows/workflow-runtime.service';
import type {
  EmailDeliveryLogCreateInput,
  EmailProviderLookupInput,
  EmailTemplateLookupInput,
  NotificationPreferenceLookupInput,
} from './interfaces/notification-contracts.interface';

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

  async listPreferences(currentUser: AuthenticatedUser) {
    const [events, preferences] = await Promise.all([
      this.notificationsRepository.listEvents(),
      this.notificationsRepository.listPreferences(currentUser.tenantId),
    ]);

    return {
      sourceOfTruth:
        'TenantSetting controls global lightweight notification toggles. NotificationPreference controls per-event channel enablement.',
      items: events.flatMap((event) =>
        event.supportedChannels.map((channel) => {
          const preference = preferences.find(
            (item) => item.eventCode === event.code && item.channel === channel,
          );

          return {
            eventCode: event.code,
            channel,
            enabled: preference?.enabled ?? event.enabledByDefault,
            preferenceId: preference?.id ?? null,
            metadata: preference?.metadata ?? null,
          };
        }),
      ),
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

      updated.push(
        await this.notificationsRepository.upsertTenantPreference({
          tenantId: currentUser.tenantId,
          eventCode: preference.eventCode,
          channel: preference.channel,
          enabled: preference.enabled,
          metadata:
            preference.metadata === undefined || preference.metadata === null
              ? Prisma.JsonNull
              : (preference.metadata as Prisma.InputJsonValue),
        }),
      );
    }

    return { items: updated };
  }

  async listTemplates(currentUser: AuthenticatedUser) {
    const templates = await this.notificationsRepository.listTemplates(
      currentUser.tenantId,
    );
    return { items: templates.map(mapEmailTemplate) };
  }

  async getTemplate(currentUser: AuthenticatedUser, templateId: string) {
    const template = await this.notificationsRepository.findVisibleTemplateById(
      currentUser.tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }
    return mapEmailTemplate(template);
  }

  /*
   * Everything the authoring screen needs to offer a placement: the tenant's
   * own organizations, business units, departments and teams, plus the module
   * catalogue. Reading it requires the same permission as reading a template.
   */
  async listTemplateScopeOptions(currentUser: AuthenticatedUser) {
    const targets = await this.notificationsRepository.listScopeTargets(
      currentUser.tenantId,
    );

    return {
      levels: EMAIL_TEMPLATE_SCOPE_LEVELS.map((level) => ({
        value: level,
        label: SCOPE_LEVEL_LABELS[level],
      })),
      ...targets,
      modules: TENANT_MODULES.map((module) => ({
        value: module.key,
        label: module.label,
      })),
    };
  }

  async createTemplate(
    currentUser: AuthenticatedUser,
    dto: CreateEmailTemplateDto,
  ) {
    await this.assertEventExists(dto.eventCode);
    this.validateTemplateContent(dto.subjectTemplate, dto.htmlTemplate);

    const scopeKey = await this.resolveTemplateScopeKey(
      currentUser.tenantId,
      dto.scopeLevel,
      dto.scopeId,
    );

    const template = await this.notificationsRepository.createTenantTemplate({
      tenantId: currentUser.tenantId,
      scopeKey,
      moduleKey: dto.moduleKey?.trim() || null,
      eventCode: dto.eventCode.trim(),
      templateKey: dto.templateKey.trim(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      subjectTemplate: dto.subjectTemplate.trim(),
      htmlTemplate: sanitizeHtmlTemplate(dto.htmlTemplate),
      textTemplate: dto.textTemplate?.trim() || null,
      availableVariables: dto.availableVariables as Prisma.InputJsonValue,
      status: dto.status ?? EmailTemplateStatus.DRAFT,
      actorUserId: currentUser.userId,
    });

    return mapEmailTemplate(template);
  }

  async updateTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: UpdateEmailTemplateDto,
  ) {
    const existing = await this.assertTenantTemplate(
      currentUser.tenantId,
      templateId,
    );

    if (dto.subjectTemplate !== undefined || dto.htmlTemplate !== undefined) {
      this.validateTemplateContent(
        dto.subjectTemplate ?? existing.subjectTemplate,
        dto.htmlTemplate ?? existing.htmlTemplate,
      );
    }

    /*
     * Re-placing a template moves it to a different scope key. The unique
     * constraint on (scopeKey, templateKey) means the target may already be
     * taken, which is reported plainly rather than surfacing a database error.
     */
    const scopeKey =
      dto.scopeLevel !== undefined || dto.scopeId !== undefined
        ? await this.resolveTemplateScopeKey(
            currentUser.tenantId,
            dto.scopeLevel,
            dto.scopeId,
          )
        : null;

    if (scopeKey && scopeKey !== existing.scopeKey) {
      const clash =
        await this.notificationsRepository.findTemplateByScopeAndKey(
          scopeKey,
          existing.templateKey,
        );
      if (clash) {
        throw new BadRequestException(
          'Another template with this key already exists at the selected scope.',
        );
      }
    }

    const activateAfterUpdate = dto.status === EmailTemplateStatus.ACTIVE;
    const data: Prisma.EmailTemplateUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.subjectTemplate !== undefined
        ? { subjectTemplate: dto.subjectTemplate.trim() }
        : {}),
      ...(dto.htmlTemplate !== undefined
        ? { htmlTemplate: sanitizeHtmlTemplate(dto.htmlTemplate) }
        : {}),
      ...(dto.textTemplate !== undefined
        ? { textTemplate: dto.textTemplate?.trim() || null }
        : {}),
      ...(dto.availableVariables !== undefined
        ? {
            availableVariables: dto.availableVariables as Prisma.InputJsonValue,
          }
        : {}),
      ...(dto.moduleKey !== undefined
        ? { moduleKey: dto.moduleKey?.trim() || null }
        : {}),
      ...(scopeKey && scopeKey !== existing.scopeKey ? { scopeKey } : {}),
      ...(dto.status !== undefined && !activateAfterUpdate
        ? { status: dto.status }
        : {}),
    };

    let template = await this.notificationsRepository.updateTenantTemplate(
      currentUser.tenantId,
      templateId,
      data,
      currentUser.userId,
    );

    if (activateAfterUpdate) {
      const activatedTemplate =
        await this.notificationsRepository.activateTenantTemplate(
          currentUser.tenantId,
          templateId,
        );
      if (!activatedTemplate) {
        throw new NotFoundException('Email template was not found.');
      }
      template = activatedTemplate;
    }

    return mapEmailTemplate(template);
  }

  async cloneTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: CloneEmailTemplateDto = {},
  ) {
    const source = await this.notificationsRepository.findVisibleTemplateById(
      currentUser.tenantId,
      templateId,
    );
    if (!source) {
      throw new NotFoundException('Email template was not found.');
    }

    const templateKey =
      dto.templateKey?.trim() ||
      (source.isSystem ? source.templateKey : `${source.templateKey}-copy`);

    const template = await this.notificationsRepository.createTenantTemplate({
      tenantId: currentUser.tenantId,
      eventCode: source.eventCode,
      templateKey,
      name: dto.name?.trim() || `${source.name} copy`,
      description: source.description,
      subjectTemplate: source.subjectTemplate,
      htmlTemplate: source.htmlTemplate,
      textTemplate: source.textTemplate,
      availableVariables: source.availableVariables as Prisma.InputJsonValue,
      status: EmailTemplateStatus.DRAFT,
      actorUserId: currentUser.userId,
    });

    return mapEmailTemplate(template);
  }

  async activateTemplate(currentUser: AuthenticatedUser, templateId: string) {
    await this.assertTenantTemplate(currentUser.tenantId, templateId);
    const template = await this.notificationsRepository.activateTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }
    return mapEmailTemplate(template);
  }

  async archiveTemplate(currentUser: AuthenticatedUser, templateId: string) {
    await this.assertTenantTemplate(currentUser.tenantId, templateId);
    await this.notificationsRepository.archiveTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    return { archived: true };
  }

  async listProviderSettings(currentUser: AuthenticatedUser) {
    const providers = await this.notificationsRepository.listProviderSettings(
      currentUser.tenantId,
    );
    return { items: providers.map(mapEmailProviderSetting) };
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

  async createProvider(
    currentUser: AuthenticatedUser,
    dto: CreateEmailProviderDto,
  ) {
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
    const configuration =
      dto.configuration !== undefined
        ? mergeConfigurationPreservingMaskedSecrets(
            existing.configuration,
            normalizeConfiguration(dto.configuration),
          )
        : (existing.configuration as Record<string, unknown>);
    validateProviderConfiguration(providerType, configuration);

    const enabled = dto.enabled ?? existing.enabled;
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
    const provider = await this.notificationsRepository.setDefaultProvider(
      currentUser.tenantId,
      providerId,
    );
    if (!provider) {
      throw new NotFoundException('Email provider setting was not found.');
    }
    return mapEmailProviderSetting(provider);
  }

  async disableProvider(currentUser: AuthenticatedUser, providerId: string) {
    const result = await this.notificationsRepository.disableProvider(
      currentUser.tenantId,
      providerId,
    );
    if (result.count === 0) {
      throw new NotFoundException('Email provider setting was not found.');
    }
    return { disabled: true };
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

  async previewTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: PreviewEmailTemplateDto,
  ) {
    await this.getTemplate(currentUser, templateId);
    return this.emailService.previewTemplate({
      tenantId: currentUser.tenantId,
      templateId,
      variables: dto.variables,
    });
  }

  async testSendTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: TestSendEmailTemplateDto,
  ) {
    const template = await this.notificationsRepository.findVisibleTemplateById(
      currentUser.tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }

    return this.emailService.sendTemplateEmail({
      tenantId: currentUser.tenantId,
      eventCode: template.eventCode,
      templateId,
      recipient: dto.recipient.trim().toLowerCase(),
      cc: dto.cc?.trim() || null,
      bcc: dto.bcc?.trim() || null,
      variables: dto.variables,
      metadata: dto.metadata,
      requestedByUserId: currentUser.userId,
      dryRun: dto.dryRun ?? false,
    });
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
   * Turns an authored placement into a scope key. Every level below tenant is
   * checked against the tenant first: without that, a user could point a
   * template at another tenant's business unit and have it resolve for them.
   */
  private async resolveTemplateScopeKey(
    tenantId: string,
    level: EmailTemplateScopeLevel | undefined,
    scopeId: string | null | undefined,
  ) {
    if (!level || level === 'TENANT') {
      return buildTenantNotificationScopeKey(tenantId);
    }

    if (!scopeId) {
      throw new BadRequestException(
        `A ${SCOPE_LABELS[level]} must be selected for this scope.`,
      );
    }

    const exists = await this.notificationsRepository.scopeTargetExists({
      tenantId,
      level,
      scopeId,
    });

    if (!exists) {
      throw new BadRequestException(
        `The selected ${SCOPE_LABELS[level]} was not found in this tenant.`,
      );
    }

    return buildNotificationScopeKey(level, scopeId);
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

  private async assertEventExists(eventCode: string) {
    const event = await this.notificationsRepository.findEventByCode(
      eventCode.trim(),
    );
    if (!event) {
      throw new BadRequestException(
        `Unsupported notification event: ${eventCode}.`,
      );
    }
    return event;
  }

  private async assertTenantTemplate(tenantId: string, templateId: string) {
    const template = await this.notificationsRepository.findVisibleTemplateById(
      tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }
    if (template.isSystem || !template.tenantId) {
      throw new ForbiddenException(
        'System email templates cannot be modified by tenant users. Clone the template first.',
      );
    }
    if (template.tenantId !== tenantId) {
      throw new NotFoundException('Email template was not found.');
    }
    return template;
  }

  private validateTemplateContent(
    subjectTemplate: string,
    htmlTemplate: string,
  ) {
    if (!subjectTemplate.trim()) {
      throw new BadRequestException('Email subject template cannot be empty.');
    }
    sanitizeHtmlTemplate(htmlTemplate);
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

const SCOPE_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'tenant',
  ORGANIZATION: 'organization',
  BUSINESS_UNIT: 'business unit',
  DEPARTMENT: 'department',
  TEAM: 'team',
};

const SCOPE_LEVEL_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'Whole tenant',
  ORGANIZATION: 'Organization',
  BUSINESS_UNIT: 'Business unit',
  DEPARTMENT: 'Department',
  TEAM: 'Team',
};

function mapEmailTemplate(template: EmailTemplate) {
  return {
    id: template.id,
    tenantId: template.tenantId,
    eventCode: template.eventCode,
    templateKey: template.templateKey,
    name: template.name,
    description: template.description,
    subjectTemplate: template.subjectTemplate,
    htmlTemplate: template.htmlTemplate,
    textTemplate: template.textTemplate,
    availableVariables: template.availableVariables,
    moduleKey: template.moduleKey,
    scopeKey: template.scopeKey,
    scopeLevel: parseNotificationScopeKey(template.scopeKey).level,
    scopeId: parseNotificationScopeKey(template.scopeKey).id,
    status: template.status,
    version: template.version,
    isSystem: template.isSystem,
    createdBy: template.createdBy,
    updatedBy: template.updatedBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
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
