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
import { PayrollController } from './payroll.controller';
import { PayrollGlController } from './payroll-gl.controller';
import { PayrollRunController } from './payroll-run.controller';
import { PayrollJournalService } from './payroll-journal.service';
import { PayrollPostingRuleResolverService } from './payroll-posting-rule-resolver.service';
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
    TimePayrollModule,
    TaxRulesModule,
  ],
  controllers: [PayrollController, PayrollRunController, PayrollGlController],
  providers: [
    PayrollRepository,
    PayrollJournalService,
    PayrollPostingRuleResolverService,
    PayrollRunService,
    PayrollService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [PayrollRepository, PayrollRunService, PayrollService, PayrollJournalService],
})
export class PayrollModule {}
