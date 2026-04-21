import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { UsersModule } from '../users/users.module';
import { ApprovalMatricesController } from './approval-matrices.controller';
import { LeavePoliciesController } from './leave-policies.controller';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  imports: [JwtModule.register({}), EmployeesModule, UsersModule, AuditModule],
  controllers: [
    LeaveTypesController,
    LeavePoliciesController,
    ApprovalMatricesController,
    LeaveRequestsController,
  ],
  providers: [LeaveRepository, LeaveService, JwtAuthGuard, PermissionsGuard],
  exports: [LeaveRepository, LeaveService],
})
export class LeaveModule {}
