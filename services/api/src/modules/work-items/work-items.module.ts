import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkBlockersController } from './work-blockers.controller';
import { WorkBlockersService } from './work-blockers.service';
import { WorkDecisionsController } from './work-decisions.controller';
import { WorkDecisionsService } from './work-decisions.service';
import { WorkDutiesController } from './work-duties.controller';
import { WorkDutiesService } from './work-duties.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';
import { WorkQueuesController } from './work-queues.controller';
import { WorkQueuesService } from './work-queues.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [
    WorkItemsController,
    WorkQueuesController,
    WorkBlockersController,
    WorkDutiesController,
    WorkDecisionsController,
  ],
  providers: [
    WorkItemsService,
    WorkQueuesService,
    WorkBlockersService,
    WorkDutiesService,
    WorkDecisionsService,
  ],
  exports: [
    WorkItemsService,
    WorkQueuesService,
    WorkBlockersService,
    WorkDutiesService,
    WorkDecisionsService,
  ],
})
export class WorkItemsModule {}
