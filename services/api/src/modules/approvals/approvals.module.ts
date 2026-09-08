import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { ApprovalDecisionRegistry } from './approval-decision.registry';
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
    ApprovalDecisionRegistry,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    ApprovalsService,
    ApprovalMatricesService,
    ApprovalMatrixRepository,
    ApprovalMatrixResolverService,
    /*
     * Exported so the modules that raise approvals can register how theirs are
     * decided. The dependency runs owning-module → approvals, the same
     * direction as `createWorkflow`, so nothing here needs `forwardRef`.
     */
    ApprovalDecisionRegistry,
  ],
})
export class ApprovalsModule {}
