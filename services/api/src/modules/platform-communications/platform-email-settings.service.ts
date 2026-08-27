import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProviderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  type PlatformPermission,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';
import { EmailProviderFactory } from '../notifications/email/email-provider-factory.service';
import { PlatformEmailProviderResolver } from '../notifications/email/platform-email-provider.resolver';
import {
  maskSensitiveConfiguration,
  redactEmailError,
  sanitizeHtmlTemplate,
} from '../notifications/email/email-safety';
import type { ResolvedEmailProvider } from '../notifications/email/email-provider-factory.service';
import type {
  UpdatePlatformEmailSettingsDto,
  UpdatePlatformEmailTemplateDto,
} from './dto/platform-email-settings.dto';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';

import {
  DEFAULT_PLATFORM_EMAIL_SETTINGS as DEFAULT_SETTINGS,
  PLATFORM_EMAIL_SETTINGS_KEY as SETTINGS_KEY,
  normalizePlatformEmailSettings as normalizeStoredSettings,
  type StoredPlatformEmailSettings,
} from '../notifications/email/platform-email-settings.shared';
const TEMPLATE_SETTINGS_KEY = 'platform-email-templates';
const PLATFORM_TEMPLATE_ID_PATTERN = /^platform:[A-Z][A-Z0-9_]{1,99}$/;

type PlatformTemplate = {
  id: string;
  eventCode: string;
  templateKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  availableVariables: string[];
  status: 'ACTIVE' | 'DRAFT';
  version: number;
  updatedAt: string;
};

const PLATFORM_TEMPLATE_DEFAULTS: PlatformTemplate[] = [
  platformTemplate(
    'CONTRACT_SIGNATURE_REQUEST',
    'Agreement signature request',
    'Invites an agreement party to review and sign the immutable document.',
    'Signature requested: {{contractTitle}}',
    '<h1>Signature requested</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p><a href="{{signingUrl}}"><strong>Review and sign agreement</strong></a></p><p>Agreement: {{contractNumber}}<br>Expires: {{expiresAt}}</p><p>DijiPeople Platform</p>',
    [
      'recipientName',
      'contractTitle',
      'contractNumber',
      'message',
      'signingUrl',
      'expiresAt',
    ],
  ),
  platformTemplate(
    'PARTNER_AGREEMENT_SIGNATURE_REQUEST',
    'Partner agreement signature request',
    'Invites a partner signatory to review and sign.',
    'Partner agreement ready to sign: {{contractTitle}}',
    '<h1>Your partner agreement is ready</h1><p>Hello {{recipientName}},</p><p>{{message}}</p><p><a href="{{signingUrl}}"><strong>Review and sign securely</strong></a></p><p>Agreement: {{contractNumber}}<br>Expires: {{expiresAt}}</p><p>DijiPeople Partnerships</p>',
    [
      'recipientName',
      'contractTitle',
      'contractNumber',
      'message',
      'signingUrl',
      'expiresAt',
    ],
  ),
  platformTemplate(
    'CONTRACT_FULLY_SIGNED',
    'Completed agreement and signed copy',
    'Confirms completion and accompanies the immutable signed PDF.',
    'Completed agreement: {{contractNumber}}',
    '<h1>Agreement completed</h1><p>Hello {{recipientName}},</p><p>{{contractTitle}} has been signed by every required party.</p><p>The immutable signed PDF is attached for your records. Its audit metadata and document fingerprint are embedded in the signed copy.</p><p>Agreement: {{contractNumber}}<br>Completed: {{completedAt}}</p><p>DijiPeople Platform</p>',
    ['recipientName', 'contractTitle', 'contractNumber', 'completedAt'],
  ),
  platformTemplate(
    'CONTRACT_SIGNATURE_CHANGES_REQUESTED',
    'Agreement changes requested',
    'Alerts the platform owner when a signer returns an agreement for revision.',
    'Changes requested: {{contractNumber}}',
    '<h1>A signer requested changes</h1><p>{{recipientName}} returned {{contractTitle}} to the platform team.</p><p><strong>Reason</strong><br>{{reason}}</p><p>Agreement: {{contractNumber}}</p><p>DijiPeople Platform</p>',
    ['recipientName', 'contractTitle', 'contractNumber', 'reason'],
  ),
];

@Injectable()
export class PlatformEmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: SecretEncryptionService,
    private readonly providers: EmailProviderFactory,
    private readonly audit: AuditService,
    private readonly platformProvider: PlatformEmailProviderResolver,
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
      const isTimeout =
        /timeout|timed out|etimedout|greeting never received/i.test(reason);
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

  /**
   * Delegates to `PlatformEmailProviderResolver`, which is the one
   * implementation of this and lives in `notifications` so the delivery path
   * can reach it too (PLAN-023). This service still owns reading, validating
   * and auditing the settings; it no longer owns resolving them into a
   * provider.
   *
   * The `resolveProvider('platform')` fallback this method used to carry — the
   * literal string as a tenant id — is preserved below for the
   * no-settings-stored case, and is *not* reachable from the resolver, so the
   * two cannot recurse into each other.
   */
  async resolveProvider(): Promise<ResolvedEmailProvider | null> {
    const stored = await this.readStoredSettings();
    if (!stored) return this.providers.resolveProvider('platform');
    if (!stored.enabled) return null;
    this.validate(stored);
    return this.platformProvider.resolve();
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
    return { items: await this.readPlatformTemplates() };
  }

  async renderTemplate(
    eventCode: string,
    fallback: { subject: string; html: string; text?: string },
    variables: Record<string, string | number | null | undefined>,
  ) {
    const template = (await this.readPlatformTemplates()).find(
      (item) => item.eventCode === eventCode && item.status === 'ACTIVE',
    );
    if (!template) return fallback;
    return {
      subject: interpolateTemplate(template.subjectTemplate, variables, false),
      html: interpolateTemplate(template.htmlTemplate, variables, true),
      text: template.textTemplate
        ? interpolateTemplate(template.textTemplate, variables, false)
        : fallback.text,
    };
  }

  async updateTemplate(
    actor: AuthenticatedUser,
    templateId: string,
    dto: UpdatePlatformEmailTemplateDto,
  ) {
    this.assertPermission(actor, 'settings.email.manage');
    if (!PLATFORM_TEMPLATE_ID_PATTERN.test(templateId)) {
      throw new BadRequestException('Platform email template ID is invalid.');
    }
    const templates = await this.readPlatformTemplates();
    const existing = templates.find((item) => item.id === templateId);
    if (!existing)
      throw new NotFoundException('Platform email template not found.');
    const updated: PlatformTemplate = {
      ...existing,
      subjectTemplate: dto.subjectTemplate.trim(),
      htmlTemplate: sanitizeHtmlTemplate(dto.htmlTemplate),
      textTemplate: dto.textTemplate?.trim() || null,
      status: dto.enabled ? 'ACTIVE' : 'DRAFT',
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const next = templates.map((item) =>
      item.id === templateId ? updated : item,
    );
    await this.prisma.platformSetting.upsert({
      where: { key: TEMPLATE_SETTINGS_KEY },
      create: {
        key: TEMPLATE_SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        description:
          'Platform-admin email templates, separate from tenant web-app templates.',
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      update: {
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: actor.userId,
      },
    });
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action: 'PLATFORM_EMAIL_TEMPLATE_UPDATED',
      entityType: 'PlatformEmailTemplate',
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

  private async readPlatformTemplates(): Promise<PlatformTemplate[]> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: TEMPLATE_SETTINGS_KEY },
      select: { value: true },
    });
    if (!Array.isArray(row?.value))
      return structuredClone(PLATFORM_TEMPLATE_DEFAULTS);
    const stored = row.value.filter(isPlatformTemplate);
    const storedByEvent = new Map(stored.map((item) => [item.eventCode, item]));
    return PLATFORM_TEMPLATE_DEFAULTS.map(
      (fallback) => storedByEvent.get(fallback.eventCode) ?? fallback,
    );
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

  private describeProviderConfiguration(
    configuration: Record<string, unknown>,
  ) {
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
    // Platform identity, asserted here and not only in the guard. This service
    // configures the platform's own outbound mail; when the guard failed open
    // (BUG-0071) nothing downstream caught it, and a tenant administrator read
    // the SMTP host, port, username and security mode. Its sibling
    // control-plane services all assert identity themselves for this reason.
    if (!actor.platform?.id) {
      throw new ForbiddenException('Platform access is required.');
    }

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

function platformTemplate(
  eventCode: string,
  name: string,
  description: string,
  subjectTemplate: string,
  htmlTemplate: string,
  availableVariables: string[],
): PlatformTemplate {
  return {
    id: `platform:${eventCode}`,
    eventCode,
    templateKey: eventCode.toLowerCase(),
    name,
    description,
    subjectTemplate,
    htmlTemplate,
    textTemplate: null,
    availableVariables,
    status: 'ACTIVE',
    version: 1,
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

/*
 * Kept local. The email-settings normalisation that used to live in this file
 * moved to the shared module in `notifications`; this predicate serves template
 * parsing, which did not move and has nothing to do with providers.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPlatformTemplate(value: unknown): value is PlatformTemplate {
  return Boolean(
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.eventCode === 'string' &&
    typeof value.subjectTemplate === 'string' &&
    typeof value.htmlTemplate === 'string',
  );
}

function interpolateTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
  html: boolean,
) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_match, key: string) => {
      const raw = variables[key];
      const value = raw == null ? '' : String(raw);
      return html
        ? value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;')
        : value.replace(/[\r\n]+/g, ' ');
    },
  );
}
