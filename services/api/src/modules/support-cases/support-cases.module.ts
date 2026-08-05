import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportCasesController } from './support-cases.controller';
import { SupportCasesService } from './support-cases.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SupportCasesController],
  providers: [SupportCasesService, JwtAuthGuard],
  exports: [SupportCasesService],
})
export class SupportCasesModule {}
