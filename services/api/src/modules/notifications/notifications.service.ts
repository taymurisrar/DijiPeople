import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  EmailProviderSetting,
  EmailProviderType,
  EmailTemplate,
  EmailTemplateStatus,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
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
import { NotificationsRepository } from './notifications.repository';
import type {
  EmailDeliveryLogCreateInput,
  EmailProviderLookupInput,
  EmailTemplateLookupInput,
  NotificationPreferenceLookupInput,
} from './interfaces/notification-contracts.interface';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly emailService: EmailService,
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

  async createTemplate(
    currentUser: AuthenticatedUser,
    dto: CreateEmailTemplateDto,
  ) {
    await this.assertEventExists(dto.eventCode);
    this.validateTemplateContent(dto.subjectTemplate, dto.htmlTemplate);

    const template = await this.notificationsRepository.createTenantTemplate({
      tenantId: currentUser.tenantId,
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
      configuration: configuration as Prisma.InputJsonValue,
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
          ? { configuration: configuration as Prisma.InputJsonValue }
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
