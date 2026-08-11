import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProviderType, EmailTemplateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  type PlatformPermission,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';
import { EmailProviderFactory } from '../notifications/email/email-provider-factory.service';
import {
  maskSensitiveConfiguration,
  redactEmailError,
  sanitizeHtmlTemplate,
} from '../notifications/email/email-safety';
import type { ResolvedEmailProvider } from '../notifications/email/email-provider-factory.service';
import type {
  PlatformEmailProviderType,
  SmtpSecurityMode,
  UpdatePlatformEmailSettingsDto,
  UpdatePlatformEmailTemplateDto,
} from './dto/platform-email-settings.dto';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';

const SETTINGS_KEY = 'email-provider';

type StoredPlatformEmailSettings = {
  enabled: boolean;
  providerType: PlatformEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  smtp: {
    host: string;
    port: number;
    authEnabled: boolean;
    username: string;
    password?: string;
    security: SmtpSecurityMode;
    connectionTimeoutMs: number;
  };
};

const DEFAULT_SETTINGS: StoredPlatformEmailSettings = {
  enabled: false,
  providerType: 'CONSOLE',
  fromName: 'DijiPeople',
  fromEmail: 'notifications@dijipeople.local',
  replyToEmail: null,
  smtp: {
    host: '',
    port: 587,
    authEnabled: true,
    username: '',
    security: 'STARTTLS',
    connectionTimeoutMs: 10000,
  },
};

@Injectable()
export class PlatformEmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: SecretEncryptionService,
    private readonly providers: EmailProviderFactory,
    private readonly audit: AuditService,
  ) {}

  async getSettings(actor: AuthenticatedUser) {
    this.assertPermission(actor, 'settings.read');
    const stored = await this.readStoredSettings();
    return {
      ...this.toPublicSettings(stored, stored ? 'stored' : 'default'),
      capabilities: this.capabilitiesFor(actor),
    };
  }

  async updateSettings(
    actor: AuthenticatedUser,
    dto: UpdatePlatformEmailSettingsDto,
  ) {
    this.assertPermission(actor, 'settings.email.manage');
    if (dto.smtpPassword?.trim() || dto.clearSmtpPassword) {
      this.assertPermission(actor, 'settings.email.credentials');
    }
    if (
      dto.enabled &&
      dto.providerType === 'CONSOLE' &&
      this.config.get<string>('NODE_ENV') === 'production'
    ) {
      throw new BadRequestException(
        'Console email cannot be enabled for production delivery.',
      );
    }

    const existing =
      (await this.readStoredSettings()) ?? structuredClone(DEFAULT_SETTINGS);
    const next: StoredPlatformEmailSettings = {
      enabled: dto.enabled,
      providerType: dto.providerType,
      fromName: dto.fromName.trim(),
      fromEmail: dto.fromEmail.trim().toLowerCase(),
      replyToEmail: dto.replyToEmail?.trim().toLowerCase() || null,
      smtp: {
        host: dto.smtpHost?.trim() ?? existing.smtp.host,
        port: dto.smtpPort ?? existing.smtp.port,
        authEnabled: dto.smtpAuthEnabled ?? existing.smtp.authEnabled,
        username: dto.smtpUsername?.trim() ?? existing.smtp.username,
        security: dto.smtpSecurity ?? existing.smtp.security,
        connectionTimeoutMs:
          dto.connectionTimeoutMs ?? existing.smtp.connectionTimeoutMs,
        ...(existing.smtp.password ? { password: existing.smtp.password } : {}),
      },
    };

    if (dto.clearSmtpPassword) delete next.smtp.password;
    if (dto.smtpPassword?.trim()) {
      if (!this.encryption.isEnabled) {
        throw new BadRequestException(
          'SECRET_ENCRYPTION_KEY must be configured before saving SMTP credentials.',
        );
      }
      next.smtp.password = this.encryption.encrypt(dto.smtpPassword);
    }
    this.validate(next);

    await this.prisma.platformSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        description: 'Platform-level outbound email provider configuration.',
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      update: {
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: actor.userId,
      },
    });
    const publicSettings = this.toPublicSettings(next, 'stored');
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action: 'PLATFORM_EMAIL_SETTINGS_UPDATED',
      entityType: 'PlatformSetting',
      entityId: SETTINGS_KEY,
      beforeSnapshot: this.toPublicSettings(existing, 'stored'),
      afterSnapshot: publicSettings,
    });
    return { ...publicSettings, capabilities: this.capabilitiesFor(actor) };
  }

  async testConnection(actor: AuthenticatedUser) {
    this.assertPermission(actor, 'settings.email.test');
    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new BadRequestException('No platform email provider is enabled.');
    }
    try {
      const result = await resolved.provider.testConnection(
        resolved.configuration,
      );
      return {
        ...result,
        providerType: resolved.providerType,
        source: resolved.source,
      };
    } catch (error) {
      const reason = redactEmailError(error);
      const isTimeout = /timeout|timed out|etimedout|greeting never received/i.test(
        reason,
      );
      throw new AppError(
        isTimeout ? 'INTEGRATION_TIMEOUT' : 'INTEGRATION_FAILED',
        {
          message: isTimeout
            ? 'Email provider timeout'
            : 'Email provider connection failed',
          description: isTimeout
            ? 'The email provider took too long to respond.'
            : 'The email provider connection test failed.',
          details: {
            integration: 'platform-email',
            providerType: resolved.providerType,
            source: resolved.source,
            provider: this.describeProviderConfiguration(
              resolved.configuration,
            ),
            reason,
          },
          cause: error,
        },
      );
    }
  }

  assertCanSendTest(actor: AuthenticatedUser) {
    this.assertPermission(actor, 'settings.email.test');
  }

  async resolveProvider(): Promise<ResolvedEmailProvider | null> {
    const stored = await this.readStoredSettings();
    if (!stored) return this.providers.resolveProvider('platform');
    if (!stored.enabled) return null;
    this.validate(stored);

    const providerType =
      stored.providerType === 'SMTP'
        ? EmailProviderType.SMTP
        : EmailProviderType.CONSOLE;
    return {
      provider: this.providers.getProvider(providerType),
      providerType,
      providerSettingId: null,
      fromEmail: stored.fromEmail,
      fromName: stored.fromName,
      replyToEmail: stored.replyToEmail,
      configuration:
        providerType === EmailProviderType.SMTP
          ? this.smtpProviderConfiguration(stored)
          : {},
      source: 'platform',
    };
  }

  async listRecentDeliveries(actor: AuthenticatedUser, limit = 25) {
    this.assertPermission(actor, 'settings.read');
    const items = await this.prisma.platformOutboundEmail.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        eventCode: true,
        recipient: true,
        subject: true,
        status: true,
        providerType: true,
        providerMessageId: true,
        entityType: true,
        entityId: true,
        attemptCount: true,
        errorMessage: true,
        lastAttemptAt: true,
        sentAt: true,
        createdAt: true,
      },
    });
    return {
      items: items.map((item) => ({
        ...item,
        errorMessage: item.errorMessage
          ? redactEmailError(item.errorMessage)
          : null,
      })),
    };
  }

  async listTemplates(actor: AuthenticatedUser) {
    this.assertPermission(actor, 'settings.read');
    const items = await this.prisma.emailTemplate.findMany({
      where: { tenantId: null, isSystem: true },
      orderBy: [{ eventCode: 'asc' }, { templateKey: 'asc' }],
      select: {
        id: true,
        eventCode: true,
        templateKey: true,
        name: true,
        description: true,
        subjectTemplate: true,
        htmlTemplate: true,
        textTemplate: true,
        availableVariables: true,
        status: true,
        version: true,
        updatedAt: true,
      },
    });
    return { items };
  }

  async updateTemplate(
    actor: AuthenticatedUser,
    templateId: string,
    dto: UpdatePlatformEmailTemplateDto,
  ) {
    this.assertPermission(actor, 'settings.email.manage');
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id: templateId, tenantId: null, isSystem: true },
    });
    if (!existing)
      throw new NotFoundException('System email template not found.');
    const updated = await this.prisma.emailTemplate.update({
      where: { id: existing.id },
      data: {
        subjectTemplate: dto.subjectTemplate.trim(),
        htmlTemplate: sanitizeHtmlTemplate(dto.htmlTemplate),
        textTemplate: dto.textTemplate?.trim() || null,
        status: dto.enabled
          ? EmailTemplateStatus.ACTIVE
          : EmailTemplateStatus.DRAFT,
        version: { increment: 1 },
        updatedBy: actor.userId,
      },
    });
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action: 'PLATFORM_EMAIL_TEMPLATE_UPDATED',
      entityType: 'EmailTemplate',
      entityId: existing.id,
      beforeSnapshot: {
        templateKey: existing.templateKey,
        status: existing.status,
        version: existing.version,
      },
      afterSnapshot: {
        templateKey: updated.templateKey,
        status: updated.status,
        version: updated.version,
      },
    });
    return updated;
  }

  private async readStoredSettings() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: SETTINGS_KEY },
      select: { value: true },
    });
    return row ? normalizeStoredSettings(row.value) : null;
  }

  private smtpProviderConfiguration(settings: StoredPlatformEmailSettings) {
    return {
      host: settings.smtp.host,
      port: settings.smtp.port,
      authEnabled: settings.smtp.authEnabled,
      username: settings.smtp.username,
      password: settings.smtp.password
        ? this.encryption.decrypt(settings.smtp.password)
        : '',
      security: settings.smtp.security,
      connectionTimeoutMs: settings.smtp.connectionTimeoutMs,
    };
  }

  private describeProviderConfiguration(configuration: Record<string, unknown>) {
    return maskSensitiveConfiguration({
      host: configuration.host,
      port: configuration.port,
      security: configuration.security,
      authEnabled: configuration.authEnabled,
      connectionTimeoutMs: configuration.connectionTimeoutMs,
      username: configuration.username,
    });
  }

  private validate(settings: StoredPlatformEmailSettings) {
    if (!settings.enabled) return;
    if (!settings.fromName.trim() || !settings.fromEmail.trim()) {
      throw new BadRequestException('Sender name and email are required.');
    }
    if (settings.providerType === 'SMTP') {
      const configuration = this.smtpProviderConfiguration(settings);
      this.providers
        .getProvider(EmailProviderType.SMTP)
        .validateConfig(configuration);
    }
  }

  private toPublicSettings(
    settings: StoredPlatformEmailSettings | null,
    source: 'stored' | 'default',
  ) {
    const resolved = settings ?? DEFAULT_SETTINGS;
    return {
      enabled: resolved.enabled,
      providerType: resolved.providerType,
      fromName: resolved.fromName,
      fromEmail: resolved.fromEmail,
      replyToEmail: resolved.replyToEmail,
      smtpHost: resolved.smtp.host,
      smtpPort: resolved.smtp.port,
      smtpAuthEnabled: resolved.smtp.authEnabled,
      smtpUsername: resolved.smtp.username,
      smtpSecurity: resolved.smtp.security,
      connectionTimeoutMs: resolved.smtp.connectionTimeoutMs,
      passwordConfigured: Boolean(resolved.smtp.password),
      source,
    };
  }

  private assertPermission(
    actor: AuthenticatedUser,
    permission: PlatformPermission,
  ) {
    if (!userHasPlatformPermission(actor, permission)) {
      throw new ForbiddenException(
        'You do not have permission to manage platform email settings.',
      );
    }
  }

  private capabilitiesFor(actor: AuthenticatedUser) {
    return {
      canManage: userHasPlatformPermission(actor, 'settings.email.manage'),
      canManageCredentials: userHasPlatformPermission(
        actor,
        'settings.email.credentials',
      ),
      canTest: userHasPlatformPermission(actor, 'settings.email.test'),
    };
  }
}

function normalizeStoredSettings(value: Prisma.JsonValue) {
  const source = isRecord(value) ? value : {};
  const smtp = isRecord(source.smtp) ? source.smtp : {};
  const providerType: PlatformEmailProviderType =
    source.providerType === 'SMTP' || source.provider === 'smtp'
      ? 'SMTP'
      : 'CONSOLE';
  return {
    enabled: source.enabled === true,
    providerType,
    fromName: text(source.fromName) || DEFAULT_SETTINGS.fromName,
    fromEmail: text(source.fromEmail) || DEFAULT_SETTINGS.fromEmail,
    replyToEmail: text(source.replyToEmail) || null,
    smtp: {
      host: text(smtp.host) || text(source.host),
      port: number(smtp.port ?? source.port, DEFAULT_SETTINGS.smtp.port),
      authEnabled: (smtp.authEnabled ?? source.authEnabled) !== false,
      username: text(smtp.username) || text(source.username),
      ...(text(smtp.password) || text(source.password)
        ? { password: text(smtp.password) || text(source.password) }
        : {}),
      security: security(smtp.security ?? source.security),
      connectionTimeoutMs: number(
        smtp.connectionTimeoutMs ?? source.connectionTimeoutMs,
        DEFAULT_SETTINGS.smtp.connectionTimeoutMs,
      ),
    },
  } satisfies StoredPlatformEmailSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function security(value: unknown): SmtpSecurityMode {
  return value === 'NONE' || value === 'TLS' ? value : 'STARTTLS';
}
