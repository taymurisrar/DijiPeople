import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformCommunicationsService } from './platform-communications.service';

@Module({
  imports: [NotificationsModule],
  providers: [PlatformCommunicationsService],
  exports: [PlatformCommunicationsService],
})
export class PlatformCommunicationsModule {}
