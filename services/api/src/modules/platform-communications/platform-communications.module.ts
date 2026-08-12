import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformCommunicationsService } from './platform-communications.service';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

@Module({
  imports: [AuditModule, NotificationsModule, StorageModule],
  providers: [PlatformCommunicationsService, PlatformEmailSettingsService],
  exports: [PlatformCommunicationsService, PlatformEmailSettingsService],
})
export class PlatformCommunicationsModule {}
