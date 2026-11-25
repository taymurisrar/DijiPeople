import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkProfilesController } from './work-profiles.controller';
import { WorkProfilesService } from './work-profiles.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [WorkProfilesController],
  providers: [WorkProfilesService],
  exports: [WorkProfilesService],
})
export class WorkProfilesModule {}
