import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DailyUpdatesController } from './daily-updates.controller';
import { DailyUpdatesService } from './daily-updates.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [DailyUpdatesController],
  providers: [DailyUpdatesService],
  exports: [DailyUpdatesService],
})
export class DailyUpdatesModule {}
