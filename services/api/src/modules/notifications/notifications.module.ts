import { forwardRef, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EmailDeliveryLogService } from './email/email-delivery-log.service';
import { EmailExecutionService } from './email/email-execution.service';
import { EmailProviderFactory } from './email/email-provider-factory.service';
import { EmailProviderService } from './email/email-provider.service';
import { EmailService } from './email/email.service';
import { EmailTemplateRendererService } from './email/email-template-renderer.service';
import { EmailTemplateService } from './email/email-template.service';
import { ConsoleEmailProvider, SmtpEmailProvider } from './email/providers';
import { EmailNotificationProcessor } from './processors/email-notification.processor';
import { InAppNotificationsService } from './in-app-notifications.service';
import { NotificationDiagnosticsService } from './notification-diagnostics.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationQueueService } from './queues/notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TenantSettingsModule, forwardRef(() => WorkflowsModule)],
  controllers: [NotificationsController],
  providers: [
    ConsoleEmailProvider,
    EmailDeliveryLogService,
    EmailExecutionService,
    EmailProviderFactory,
    EmailProviderService,
    EmailService,
    EmailTemplateRendererService,
    EmailTemplateService,
    EmailNotificationProcessor,
    InAppNotificationsService,
    NotificationDiagnosticsService,
    NotificationOrchestratorService,
    NotificationQueueService,
    NotificationsRepository,
    NotificationsService,
    SecretEncryptionService,
    SmtpEmailProvider,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    EmailDeliveryLogService,
    EmailExecutionService,
    EmailProviderFactory,
    EmailProviderService,
    EmailService,
    EmailTemplateRendererService,
    EmailTemplateService,
    InAppNotificationsService,
    NotificationDiagnosticsService,
    NotificationOrchestratorService,
    NotificationQueueService,
    NotificationsRepository,
    NotificationsService,
    SecretEncryptionService,
  ],
})
export class NotificationsModule {}
