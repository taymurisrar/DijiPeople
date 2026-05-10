import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailProviderType,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
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

@Injectable()
export class EmailService {
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

  async sendTemplateEmail(
    input: SendTemplateEmailInput,
  ): Promise<SendTemplateEmailResult> {
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

    const metadata = {
      ...(input.metadata ?? {}),
      requestedByUserId: input.requestedByUserId ?? null,
      dryRun: Boolean(input.dryRun),
    };

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
        metadata: {
          ...metadata,
          skipReason: !settings.emailEnabled
            ? 'TENANT_EMAIL_DISABLED'
            : 'EVENT_EMAIL_DISABLED',
        },
        requestedAt: new Date(),
      });

      return {
        sent: false,
        dryRun: false,
        skipped: true,
        status: EmailDeliveryStatus.SKIPPED,
        providerType: null,
        deliveryLogId: log.id,
        rendered,
      };
    }

    const resolvedProvider = await this.providerFactory.resolveProvider(
      input.tenantId,
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
        metadata,
      });

      return {
        sent: false,
        dryRun: false,
        skipped: false,
        status: EmailDeliveryStatus.FAILED,
        providerType: null,
        deliveryLogId: failedLog.id,
        rendered,
      };
    }

    const initialStatus = input.dryRun
      ? EmailDeliveryStatus.DRY_RUN
      : EmailDeliveryStatus.PENDING;

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
      metadata: {
        ...metadata,
        providerSource: resolvedProvider.source,
        providerSettingId: resolvedProvider.providerSettingId,
      },
    });

    if (input.dryRun) {
      return {
        sent: false,
        dryRun: true,
        skipped: false,
        status: EmailDeliveryStatus.DRY_RUN,
        providerType: resolvedProvider.providerType,
        deliveryLogId: log.id,
        rendered,
      };
    }

    await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
      status: EmailDeliveryStatus.PROCESSING,
      processedAt: new Date(),
    });

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
        metadata,
      });

      await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
        status: EmailDeliveryStatus.SENT,
        deliveredAt: new Date(),
        providerMessageId: sendResult.providerMessageId ?? null,
        metadata: {
          ...metadata,
          providerSource: resolvedProvider.source,
          providerSettingId: resolvedProvider.providerSettingId,
          providerResponse: sendResult.response ?? Prisma.JsonNull,
        } as Prisma.InputJsonValue,
      });

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

      await this.repository.updateDeliveryLogStatus(input.tenantId, log.id, {
        status: EmailDeliveryStatus.FAILED,
        failedAt: new Date(),
        errorMessage: redactErrorMessage(message),
      });

      return {
        sent: false,
        dryRun: false,
        skipped: false,
        status: EmailDeliveryStatus.FAILED,
        providerType: resolvedProvider.providerType,
        deliveryLogId: log.id,
        rendered,
      };
    }
  }
}

function redactErrorMessage(message: string) {
  return message.replace(
    /(password|secret|token|api[_-]?key)=?[^,\s]*/gi,
    '$1=[redacted]',
  );
}
