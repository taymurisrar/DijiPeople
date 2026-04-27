import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [
    JwtModule.register({}),
    EmployeesModule,
    AuditModule,
    TenantSettingsModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [AttendanceRepository, AttendanceService],
})
export class AttendanceModule {}
