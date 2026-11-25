import { forwardRef, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowDeliveryReconciler } from './workflow-delivery-reconciler';
import { WorkflowActionHandler } from './workflow-action.handler';
import { WorkflowDispatchService } from './workflow-dispatch.service';
import { WorkflowRuntimeService } from './workflow-runtime.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [WorkflowsController],
  providers: [
    WorkflowRuntimeService,
    WorkflowDispatchService,
    WorkflowDeliveryReconciler,
    // Registers itself with the outbox dispatcher on init (WP-03.S3).
    WorkflowActionHandler,
    WorkflowsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [WorkflowRuntimeService, WorkflowDispatchService],
})
export class WorkflowsModule {}
