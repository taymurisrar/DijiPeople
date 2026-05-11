import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { EmailService, SendTemplateEmailResult } from './email/email.service';
import { InAppNotificationsService } from './in-app-notifications.service';

export type NotificationDispatchInput = {
  tenantId: string;
  eventCode: string;
  channels: NotificationChannel[];
  sourceModule: string;
  correlationId?: string | null;
  requestedByUserId?: string | null;
  email?: {
    templateKey?: string;
    templateId?: string;
    recipient: string;
    cc?: string | null;
    bcc?: string | null;
    variables: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    dryRun?: boolean;
  };
  inApp?: {
    title: string;
    body?: string | null;
    targetUrl?: string | null;
    recipientUserIds: string[];
    type?: NotificationType;
    payload?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  };
};

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly inAppNotificationsService: InAppNotificationsService,
  ) {}

  async dispatch(input: NotificationDispatchInput) {
    const results: {
      email?: SendTemplateEmailResult;
      inApp?: unknown;
    } = {};

    if (input.channels.includes(NotificationChannel.EMAIL) && input.email) {
      results.email = await this.emailService.sendTemplateEmail({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        templateKey: input.email.templateKey,
        templateId: input.email.templateId,
        recipient: input.email.recipient,
        cc: input.email.cc,
        bcc: input.email.bcc,
        variables: input.email.variables,
        requestedByUserId: input.requestedByUserId,
        dryRun: input.email.dryRun,
        metadata: {
          ...(input.email.metadata ?? {}),
          sourceModule: input.sourceModule,
          correlationId: input.correlationId ?? null,
        },
      });
    }

    if (input.channels.includes(NotificationChannel.IN_APP) && input.inApp) {
      results.inApp = await this.inAppNotificationsService.create({
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        title: input.inApp.title,
        body: input.inApp.body,
        targetUrl: input.inApp.targetUrl,
        recipientUserIds: input.inApp.recipientUserIds,
        type: input.inApp.type,
        payload: input.inApp.payload,
        metadata: {
          ...(input.inApp.metadata ?? {}),
          sourceModule: input.sourceModule,
          correlationId: input.correlationId ?? null,
        },
        createdById: input.requestedByUserId ?? null,
      });
    }

    this.logger.log(
      JSON.stringify({
        message: 'Notification dispatch completed.',
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        channels: input.channels,
        sourceModule: input.sourceModule,
      }),
    );

    return results;
  }
}
