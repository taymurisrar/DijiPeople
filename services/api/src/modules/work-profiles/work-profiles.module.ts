import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { WorkComponentsService } from './work-components.service';
import { WorkProfilesController } from './work-profiles.controller';
import { WorkProfilesPortableService } from './work-profiles-portable.service';
import { WorkProfilesService } from './work-profiles.service';

@Module({
  imports: [AuditModule, PrismaModule, WorkItemsModule],
  controllers: [WorkProfilesController],
  providers: [
    WorkProfilesService,
    WorkProfilesPortableService,
    WorkComponentsService,
  ],
  exports: [
    WorkProfilesService,
    WorkProfilesPortableService,
    WorkComponentsService,
  ],
})
export class WorkProfilesModule {}
