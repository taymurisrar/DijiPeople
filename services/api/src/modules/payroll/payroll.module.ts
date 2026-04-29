import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';
import { CompensationModule } from '../compensation/compensation.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PayrollController } from './payroll.controller';
import { PayrollRunController } from './payroll-run.controller';
import { PayrollRepository } from './payroll.repository';
import { PayrollRunService } from './payroll-run.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    CompensationModule,
    EmployeesModule,
    TenantSettingsModule,
  ],
  controllers: [PayrollController, PayrollRunController],
  providers: [
    PayrollRepository,
    PayrollRunService,
    PayrollService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [PayrollRepository, PayrollRunService, PayrollService],
})
export class PayrollModule {}
