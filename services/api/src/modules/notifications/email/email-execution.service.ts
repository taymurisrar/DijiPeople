import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailProviderType,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { performance } from 'node:perf_hooks';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { NotificationsRepository } from '../notifications.repository';
import { EmailProviderFactory } from './email-provider-factory.service';
import {
  EmailTemplateRendererService,
  EmailTemplateRenderResult,
} from './email-template-renderer.service';

export type SendTemplateEmailInput = {
  tenantId: string;
  eventCode: string;
  templateKey?: string;
  templateId?: string;
  recipient: string;
  cc?: string | null;
  bcc?: string | null;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  requestedByUserId?: string | null;
  dryRun?: boolean;
};

export type SendTemplateEmailResult = {
  sent: boolean;
  dryRun: boolean;
  skipped: boolean;
  status: EmailDeliveryStatus;
  providerType: EmailProviderType | null;
  providerMessageId?: string | null;
  deliveryLogId: string;
  rendered: EmailTemplateRenderResult;
};

const AUTH_NOTIFICATION_EVENTS = new Set([
  'AUTH_ACCOUNT_ACTIVATION',
  'AUTH_PASSWORD_RESET',
  'AUTH_OTP',
]);

@Injectable()
export class EmailExecutionService {
  private readonly logger = new Logger(EmailExecutionService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly renderer: EmailTemplateRendererService,
    private readonly providerFactory: EmailProviderFactory,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
  ) {}

  async previewTemplate(input: {
    tenantId: string;
    templateId: string;
    variables: Record<string, unknown>;
  }) {
    const template = await this.repository.findVisibleTemplateById(
      input.tenantId,
      input.templateId,
    );

    if (!template) {
      throw new BadRequestException('Email template was not found.');
    }

    return this.renderer.render({
      template,
      variables: input.variables,
    });
  }

  async execute(
    input: SendTemplateEmailInput,
  ): Promise<SendTemplateEmailResult> {
    const startedAt = performance.now();
    const templateResolutionStartedAt = performance.now();
    const template = input.templateId
      ? await this.repository.findVisibleTemplateById(
          input.tenantId,
          input.templateId,
        )
      : await this.repository.findTemplateForEvent({
          tenantId: input.tenantId,
          eventCode: input.eventCode,
          templateKey: input.templateKey,
        });
    const templateResolutionDurationMs = Math.round(
      performance.now() - templateResolutionStartedAt,
    );

    if (!template) {
      throw new BadRequestException(
        `No active email template is configured for event ${input.eventCode}.`,
      );
    }

    const rendered = this.renderer.render({
      template,
      variables: input.variables,
    });

    const [settings, preference] = await Promise.all([
      this.tenantSettingsResolver.getNotificationSettings(input.tenantId),
      this.repository.findPreference({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        channel: NotificationChannel.EMAIL,
      }),
    ]);

    const baseMetadata = this.buildMetadata(input, {
      templateResolutionDurationMs,
    });

    if (!settings.emailEnabled || preference?.enabled === false) {
      const log = await this.repository.createDeliveryLog({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        templateId: template.id,
        providerType: null,
        recipient: input.recipient,
        cc: input.cc,
        bcc: input.bcc,
        subject: rendered.renderedSubject,
        channel: NotificationChannel.EMAIL,
        status: EmailDeliveryStatus.SKIPPED,
        retryable: false,
        metadata: {
          ...baseMetadata,
          skipReason: !settings.emailEnabled
            ? 'TENANT_EMAIL_DISABLED'
            : 'EVENT_EMAIL_DISABLED',
          executionDurationMs: Math.round(performance.now() - startedAt),
        },
        requestedAt: new Date(),
      });

      return this.result(
        false,
        false,
        true,
        EmailDeliveryStatus.SKIPPED,
        null,
        log.id,
        rendered,
      );
    }

    const rateLimit = await this.checkAuthNotificationCooldown(input);
    if (rateLimit.limited) {
      const log = await this.repository.createDeliveryLog({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        templateId: template.id,
        providerType: null,
        recipient: input.recipient,
        cc: input.cc,
        bcc: input.bcc,
        subject: rendered.renderedSubject,
        channel: NotificationChannel.EMAIL,
        status: EmailDeliveryStatus.SKIPPED,
        retryable: false,
        metadata: {
          ...baseMetadata,
          skipReason: 'AUTH_NOTIFICATION_COOLDOWN',
          cooldownSeconds: rateLimit.cooldownSeconds,
          executionDurationMs: Math.round(performance.now() - startedAt),
        },
      });

      return this.result(
        false,
        false,
        true,
        EmailDeliveryStatus.SKIPPED,
        null,
        log.id,
        rendered,
      );
    }

    const providerResolutionStartedAt = performance.now();
    const resolvedProvider = await this.providerFactory.resolveProvider(
      input.tenantId,
    );
    const providerResolutionDurationMs = Math.round(
      performance.now() - providerResolutionStartedAt,
    );

    if (!resolvedProvider) {
      const failedLog = await this.repository.createDeliveryLog({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        templateId: template.id,
        providerType: null,
        recipient: input.recipient,
        cc: input.cc,
        bcc: input.bcc,
        subject: rendered.renderedSubject,
        channel: NotificationChannel.EMAIL,
        status: EmailDeliveryStatus.FAILED,
        errorMessage: 'No enabled email provider is configured.',
        retryable: false,
        metadata: {
          ...baseMetadata,
          providerResolutionDurationMs,
          failureCategory: 'CONFIGURATION',
          executionDurationMs: Math.round(performance.now() - startedAt),
        },
      });

      return this.result(
        false,
        false,
        false,
        EmailDeliveryStatus.FAILED,
        null,
        failedLog.id,
        rendered,
      );
    }

    const initialStatus = input.dryRun
      ? EmailDeliveryStatus.DRY_RUN
      : EmailDeliveryStatus.PENDING;
    const providerMetadata = {
      ...baseMetadata,
      providerResolutionDurationMs,
      providerSource: resolvedProvider.source,
      providerSettingId: resolvedProvider.providerSettingId,
      workerId: process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? null,
      nodeId: process.pid,
    };

    const log = await this.repository.createDeliveryLog({
      tenantId: input.tenantId,
      eventCode: input.eventCode,
      templateId: template.id,
      providerType: resolvedProvider.providerType,
      recipient: input.recipient,
      cc: input.cc,
      bcc: input.bcc,
      subject: rendered.renderedSubject,
      channel: NotificationChannel.EMAIL,
      status: initialStatus,
      retryable: false,
      metadata: providerMetadata,
    });

    if (input.dryRun) {
      return this.result(
        false,
        true,
        false,
        EmailDeliveryStatus.DRY_RUN,
        resolvedProvider.providerType,
        log.id,
        rendered,
      );
    }

    await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
      status: EmailDeliveryStatus.PROCESSING,
      processedAt: new Date(),
    });

    const providerStartedAt = performance.now();
    try {
      const sendResult = await resolvedProvider.provider.send({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        recipient: input.recipient,
        cc: input.cc,
        bcc: input.bcc,
        subject: rendered.renderedSubject,
        html: rendered.renderedHtml,
        text: rendered.renderedText,
        fromEmail: resolvedProvider.fromEmail,
        fromName: resolvedProvider.fromName,
        replyToEmail: resolvedProvider.replyToEmail,
        metadata: providerMetadata,
      });

      await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
        status: EmailDeliveryStatus.SENT,
        deliveredAt: new Date(),
        providerMessageId: sendResult.providerMessageId ?? null,
        retryable: false,
        metadata: {
          ...providerMetadata,
          providerExecutionDurationMs: Math.round(
            performance.now() - providerStartedAt,
          ),
          executionDurationMs: Math.round(performance.now() - startedAt),
          providerResponse: sendResult.response ?? Prisma.JsonNull,
        } as Prisma.InputJsonValue,
      });

      this.logger.log(
        JSON.stringify({
          message: 'Email notification sent.',
          tenantId: input.tenantId,
          eventCode: input.eventCode,
          providerType: resolvedProvider.providerType,
          deliveryLogId: log.id,
        }),
      );

      return {
        sent: true,
        dryRun: false,
        skipped: false,
        status: EmailDeliveryStatus.SENT,
        providerType: resolvedProvider.providerType,
        providerMessageId: sendResult.providerMessageId,
        deliveryLogId: log.id,
        rendered,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Email provider send failed.';
      const retryable = isRetryableProviderError(message);
      const now = new Date();

      await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
        status: EmailDeliveryStatus.FAILED,
        failedAt: now,
        errorMessage: redactErrorMessage(message),
        retryable,
        retryCount: { increment: 1 },
        lastRetryAt: now,
        nextRetryAt: retryable ? new Date(now.getTime() + 5 * 60_000) : null,
        metadata: {
          ...providerMetadata,
          providerExecutionDurationMs: Math.round(
            performance.now() - providerStartedAt,
          ),
          executionDurationMs: Math.round(performance.now() - startedAt),
          failureCategory: retryable ? 'TRANSIENT_PROVIDER' : 'PROVIDER',
        } as Prisma.InputJsonValue,
      });

      this.logger.warn(
        JSON.stringify({
          message: 'Email notification failed.',
          tenantId: input.tenantId,
          eventCode: input.eventCode,
          providerType: resolvedProvider.providerType,
          deliveryLogId: log.id,
          retryable,
        }),
      );

      return this.result(
        false,
        false,
        false,
        EmailDeliveryStatus.FAILED,
        resolvedProvider.providerType,
        log.id,
        rendered,
      );
    }
  }

  private buildMetadata(
    input: SendTemplateEmailInput,
    diagnostics: Record<string, unknown>,
  ) {
    return {
      ...(input.metadata ?? {}),
      requestedByUserId: input.requestedByUserId ?? null,
      sourceModule:
        typeof input.metadata?.sourceModule === 'string'
          ? input.metadata.sourceModule
          : typeof input.metadata?.source === 'string'
            ? input.metadata.source
            : null,
      correlationId:
        typeof input.metadata?.correlationId === 'string'
          ? input.metadata.correlationId
          : null,
      dryRun: Boolean(input.dryRun),
      ...diagnostics,
    };
  }

  private async checkAuthNotificationCooldown(input: SendTemplateEmailInput) {
    if (input.dryRun || !AUTH_NOTIFICATION_EVENTS.has(input.eventCode)) {
      return { limited: false, cooldownSeconds: 0 };
    }

    const cooldownSeconds = Number(
      process.env.AUTH_NOTIFICATION_COOLDOWN_SECONDS ?? 60,
    );
    const safeCooldownSeconds =
      Number.isFinite(cooldownSeconds) && cooldownSeconds > 0
        ? cooldownSeconds
        : 60;

    const recentCount = await this.repository.countRecentDeliveryLogs({
      tenantId: input.tenantId,
      eventCode: input.eventCode,
      recipient: input.recipient,
      since: new Date(Date.now() - safeCooldownSeconds * 1000),
    });

    return {
      limited: recentCount > 0,
      cooldownSeconds: safeCooldownSeconds,
    };
  }

  private result(
    sent: boolean,
    dryRun: boolean,
    skipped: boolean,
    status: EmailDeliveryStatus,
    providerType: EmailProviderType | null,
    deliveryLogId: string,
    rendered: EmailTemplateRenderResult,
  ): SendTemplateEmailResult {
    return {
      sent,
      dryRun,
      skipped,
      status,
      providerType,
      deliveryLogId,
      rendered,
    };
  }
}

export function redactErrorMessage(message: string) {
  return message.replace(
    /(password|secret|token|api[_-]?key)=?[^,\s]*/gi,
    '$1=[redacted]',
  );
}

function isRetryableProviderError(message: string) {
  return /timeout|timed out|network|econnreset|econnrefused|temporar|rate|throttl|4\d\d|5\d\d|try again/i.test(
    message,
  );
}
