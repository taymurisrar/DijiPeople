import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { RecordAssignmentModule } from '../super-admin/record-assignment.module';
import { SupportCasesController } from './support-cases.controller';
import { SupportCasesService } from './support-cases.service';

@Module({
  /*
   * PlatformUsersModule for team validation (PlatformTeamsService) and
   * RecordAssignmentModule for assignment rules on create. The latter is the
   * standalone module, not SuperAdminModule, so no import cycle is created.
   * PlatformEventsModule is global.
   */
  imports: [
    NotificationsModule,
    AuditModule,
    PlatformUsersModule,
    RecordAssignmentModule,
  ],
  controllers: [SupportCasesController],
  providers: [SupportCasesService, JwtAuthGuard],
  exports: [SupportCasesService],
})
export class SupportCasesModule {}
