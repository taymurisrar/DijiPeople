import { Injectable } from '@nestjs/common';
import { EmailProviderFactory } from './email/email-provider-factory.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationQueueService } from './queues/notification-queue.service';

@Injectable()
export class NotificationDiagnosticsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly providerFactory: EmailProviderFactory,
    private readonly queueService: NotificationQueueService,
  ) {}

  async getTenantDiagnostics(tenantId: string) {
    const [delivery, provider] = await Promise.all([
      this.repository.getDiagnostics(tenantId),
      this.providerFactory.resolveProvider(tenantId),
    ]);

    return {
      delivery,
      provider: provider
        ? {
            configured: true,
            providerType: provider.providerType,
            source: provider.source,
            providerSettingId: provider.providerSettingId,
          }
        : {
            configured: false,
            providerType: null,
            source: null,
            providerSettingId: null,
          },
      queue: this.queueService.getQueueDiagnostics(),
    };
  }
}
