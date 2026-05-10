import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { EmailDeliveryLogService } from './email/email-delivery-log.service';
import { EmailProviderFactory } from './email/email-provider-factory.service';
import { EmailProviderService } from './email/email-provider.service';
import { EmailService } from './email/email.service';
import { EmailTemplateRendererService } from './email/email-template-renderer.service';
import { EmailTemplateService } from './email/email-template.service';
import {
  ConsoleEmailProvider,
  SmtpEmailProvider,
} from './email/providers';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TenantSettingsModule],
  controllers: [NotificationsController],
  providers: [
    ConsoleEmailProvider,
    EmailDeliveryLogService,
    EmailProviderFactory,
    EmailProviderService,
    EmailService,
    EmailTemplateRendererService,
    EmailTemplateService,
    NotificationsRepository,
    NotificationsService,
    SmtpEmailProvider,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    EmailDeliveryLogService,
    EmailProviderFactory,
    EmailProviderService,
    EmailService,
    EmailTemplateRendererService,
    EmailTemplateService,
    NotificationsRepository,
    NotificationsService,
  ],
})
export class NotificationsModule {}
