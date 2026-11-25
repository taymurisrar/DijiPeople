import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';
import { WorkQueuesController } from './work-queues.controller';
import { WorkQueuesService } from './work-queues.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [WorkItemsController, WorkQueuesController],
  providers: [WorkItemsService, WorkQueuesService],
  exports: [WorkItemsService, WorkQueuesService],
})
export class WorkItemsModule {}
