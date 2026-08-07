import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { StorageModule } from '../../common/storage/storage.module';
import { DataManagementController } from './data-management.controller';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { ImportAnalysisService } from './import-analysis.service';
import { AuthModule } from '../auth/auth.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { DataJobWorkerService } from './data-job-worker.service';
import { ExportExecutionService } from './export-execution.service';
import { ImportExecutionService } from './import-execution.service';
import { DataModuleRegistryService } from './module-registry.service';
import { DataTemplateService } from './template.service';

@Module({
  imports: [
    JwtModule.register({}),
    StorageModule,
    EmployeesModule,
    AuditModule,
    AuthModule,
    AttendanceModule,
  ],
  controllers: [DataManagementController],
  providers: [
    DataModuleRegistryService,
    DataTemplateService,
    ImportAnalysisService,
    ImportExecutionService,
    DataJobWorkerService,
    ExportExecutionService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [DataModuleRegistryService],
})
export class DataManagementModule {}
