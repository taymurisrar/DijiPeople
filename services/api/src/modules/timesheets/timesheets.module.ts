import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TimesheetCalculationService } from './timesheet-calculation.service';
import { TimesheetExportService } from './timesheet-export.service';
import { TimesheetExportsController } from './timesheet-exports.controller';
import { TimesheetGenerationService } from './timesheet-generation.service';
import { TimesheetJobsController } from './timesheet-jobs.controller';
import { TimesheetJobsService } from './timesheet-jobs.service';
import { TimesheetPoliciesController } from './timesheet-policies.controller';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsRepository } from './timesheets.repository';
import { TimesheetsService } from './timesheets.service';
import { TimesheetWorkflowService } from './timesheet-workflow.service';

@Module({
  imports: [
    JwtModule.register({}),
    ApprovalsModule,
    AttendanceModule,
    AuditModule,
    EmployeesModule,
    NotificationsModule,
    TenantSettingsModule,
  ],
  controllers: [
    TimesheetsController,
    TimesheetPoliciesController,
    TimesheetExportsController,
    TimesheetJobsController,
  ],
  providers: [
    TimesheetsRepository,
    TimesheetsService,
    TimesheetPolicyResolverService,
    TimesheetCalculationService,
    TimesheetGenerationService,
    TimesheetWorkflowService,
    TimesheetExportService,
    TimesheetJobsService,
    ExcelExportService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    TimesheetsRepository,
    TimesheetsService,
    TimesheetPolicyResolverService,
    TimesheetCalculationService,
    TimesheetGenerationService,
    TimesheetWorkflowService,
    TimesheetExportService,
    TimesheetJobsService,
  ],
})
export class TimesheetsModule {}
