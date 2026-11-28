import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DailyUpdateEscalationScheduler } from './daily-update-escalation.scheduler';
import { DailyUpdatesController } from './daily-updates.controller';
import { DailyUpdatesService } from './daily-updates.service';

@Module({
  imports: [AuditModule, PrismaModule, NotificationsModule],
  controllers: [DailyUpdatesController],
  // The scheduler is off unless WORK_DAILY_UPDATE_ESCALATION_ENABLED=true (WP-27.S3).
  providers: [DailyUpdatesService, DailyUpdateEscalationScheduler],
  exports: [DailyUpdatesService],
})
export class DailyUpdatesModule {}
