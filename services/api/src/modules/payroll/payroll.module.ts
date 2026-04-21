import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PayrollController } from './payroll.controller';
import { PayrollRepository } from './payroll.repository';
import { PayrollService } from './payroll.service';

@Module({
  imports: [JwtModule.register({}), EmployeesModule, TenantSettingsModule],
  controllers: [PayrollController],
  providers: [PayrollRepository, PayrollService, JwtAuthGuard, PermissionsGuard],
  exports: [PayrollRepository, PayrollService],
})
export class PayrollModule {}
