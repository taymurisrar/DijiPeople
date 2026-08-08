import { forwardRef, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowRuntimeService } from './workflow-runtime.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [WorkflowsController],
  providers: [
    WorkflowRuntimeService,
    WorkflowsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [WorkflowRuntimeService],
})
export class WorkflowsModule {}
