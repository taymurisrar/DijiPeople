import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkProfilesController } from './work-profiles.controller';
import { WorkProfilesPortableService } from './work-profiles-portable.service';
import { WorkProfilesService } from './work-profiles.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [WorkProfilesController],
  providers: [WorkProfilesService, WorkProfilesPortableService],
  exports: [WorkProfilesService, WorkProfilesPortableService],
})
export class WorkProfilesModule {}
