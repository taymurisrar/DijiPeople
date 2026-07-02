import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';
import { CompensationModule } from '../compensation/compensation.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TimePayrollModule } from '../time-payroll/time-payroll.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ExcelExportService } from '../../common/excel/excel-export.service';
import { PayrollController } from './payroll.controller';
import { PayrollGlController } from './payroll-gl.controller';
import { PayrollRunController } from './payroll-run.controller';
import { PayrollJournalService } from './payroll-journal.service';
import { PayrollPostingRuleResolverService } from './payroll-posting-rule-resolver.service';
import { PayrollRepository } from './payroll.repository';
import { PayrollRunService } from './payroll-run.service';
import { PayrollService } from './payroll.service';
import { PayrollOperationsController } from './payroll-operations.controller';
import { PayrollOperationsService } from './payroll-operations.service';
import {
  CsvPayrollExportProvider,
  ExcelPayrollExportProvider,
  GenericBankTransferExportProvider,
} from './payroll-export.providers';

@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    CompensationModule,
    EmployeesModule,
    TenantSettingsModule,
    TimePayrollModule,
    TaxRulesModule,
    BenefitsModule,
    ApprovalsModule,
  ],
  controllers: [
    PayrollController,
    PayrollRunController,
    PayrollGlController,
    PayrollOperationsController,
  ],
  providers: [
    PayrollRepository,
    PayrollJournalService,
    PayrollPostingRuleResolverService,
    PayrollRunService,
    PayrollService,
    PayrollOperationsService,
    ExcelExportService,
    CsvPayrollExportProvider,
    ExcelPayrollExportProvider,
    GenericBankTransferExportProvider,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    PayrollRepository,
    PayrollRunService,
    PayrollService,
    PayrollJournalService,
  ],
})
export class PayrollModule {}
