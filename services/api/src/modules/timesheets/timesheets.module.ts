import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsRepository } from './timesheets.repository';
import { TimesheetsService } from './timesheets.service';

@Module({
  imports: [JwtModule.register({}), EmployeesModule, TenantSettingsModule],
  controllers: [TimesheetsController],
  providers: [
    TimesheetsRepository,
    TimesheetsService,
    ExcelExportService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [TimesheetsRepository, TimesheetsService],
})
export class TimesheetsModule {}
