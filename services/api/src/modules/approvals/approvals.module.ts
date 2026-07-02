import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { ApprovalMatricesController } from './approval-matrices.controller';
import { ApprovalMatricesService } from './approval-matrices.service';
import { ApprovalMatrixRepository } from './approval-matrix.repository';
import { ApprovalMatrixResolverService } from './approval-matrix-resolver.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [AuditModule],
  controllers: [ApprovalsController, ApprovalMatricesController],
  providers: [
    ApprovalsService,
    ApprovalMatricesService,
    ApprovalMatrixRepository,
    ApprovalMatrixResolverService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    ApprovalsService,
    ApprovalMatricesService,
    ApprovalMatrixRepository,
    ApprovalMatrixResolverService,
  ],
})
export class ApprovalsModule {}
