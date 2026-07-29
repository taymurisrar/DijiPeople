import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { CompensationController } from './compensation.controller';
import { CompensationFormulaService } from './compensation-formula.service';
import { CompensationResolverService } from './compensation-resolver.service';
import { CompensationService } from './compensation.service';
import { SalaryPackageRulesController } from './salary-package-rules.controller';
import { SalaryPackageRulesService } from './salary-package-rules.service';

@Module({
  imports: [AuditModule, TenantSettingsModule],
  controllers: [CompensationController, SalaryPackageRulesController],
  providers: [
    CompensationService,
    CompensationFormulaService,
    CompensationResolverService,
    SalaryPackageRulesService,
  ],
  exports: [
    CompensationService,
    CompensationFormulaService,
    CompensationResolverService,
    SalaryPackageRulesService,
  ],
})
export class CompensationModule {}
