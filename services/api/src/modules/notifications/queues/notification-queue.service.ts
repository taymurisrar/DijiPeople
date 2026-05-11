import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  SendTemplateEmailInput,
  SendTemplateEmailResult,
} from '../email/email-execution.service';
import type { NotificationJobOptions } from '../jobs/notification-job-options.interface';
import type { EmailNotificationJobPayload } from '../jobs/notification-job-payload.interface';

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(private readonly configService: ConfigService) {}

  isQueueEnabled() {
    return this.configService.get<string>('NOTIFICATIONS_QUEUE_ENABLED') === 'true';
  }

  getQueueDiagnostics() {
    return {
      enabled: this.isQueueEnabled(),
      adapter: this.isQueueEnabled() ? 'sync-fallback' : 'sync',
      redisConfigured: Boolean(this.configService.get<string>('REDIS_HOST')),
      redisHost: this.configService.get<string>('REDIS_HOST') ?? null,
      redisPort: this.configService.get<string>('REDIS_PORT') ?? null,
      note: this.isQueueEnabled()
        ? 'BullMQ package/Redis worker is not wired in this workspace yet; sync fallback is active.'
        : 'Notification queue disabled; sync execution is active.',
    };
  }

  async dispatchEmail(
    input: SendTemplateEmailInput,
    executeSync: (input: SendTemplateEmailInput) => Promise<SendTemplateEmailResult>,
    options: NotificationJobOptions = {},
  ) {
    const job = this.buildEmailJobPayload(input, options);

    if (!this.isQueueEnabled()) {
      return executeSync({
        ...input,
        metadata: {
          ...(input.metadata ?? {}),
          queue: {
            enabled: false,
            mode: 'sync',
            jobId: job.jobId,
          },
        },
      });
    }

    this.logger.warn(
      JSON.stringify({
        message: 'Notification queue requested but BullMQ is not wired; using sync fallback.',
        tenantId: input.tenantId,
        eventCode: input.eventCode,
        jobId: job.jobId,
      }),
    );

    return executeSync({
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        queue: {
          enabled: true,
          mode: 'sync-fallback',
          jobId: job.jobId,
          attempts: options.attempts ?? 1,
        },
      },
    });
  }

  private buildEmailJobPayload(
    input: SendTemplateEmailInput,
    options: NotificationJobOptions,
  ): EmailNotificationJobPayload {
    const metadata = input.metadata ?? {};
    const metadataSourceModule =
      typeof metadata.sourceModule === 'string' ? metadata.sourceModule : null;
    const metadataCorrelationId =
      typeof metadata.correlationId === 'string'
        ? metadata.correlationId
        : null;

    return {
      jobId: randomUUID(),
      tenantId: input.tenantId,
      eventCode: input.eventCode,
      channel: 'EMAIL',
      sourceModule: options.sourceModule ?? metadataSourceModule,
      correlationId: options.correlationId ?? metadataCorrelationId,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedAt: new Date().toISOString(),
      email: input,
    };
  }
}
