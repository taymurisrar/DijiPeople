import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { TaxCalculationService } from './tax-calculation.service';
import { TaxRuleResolverService } from './tax-rule-resolver.service';
import { TaxRulesController } from './tax-rules.controller';
import { TaxRulesService } from './tax-rules.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [TaxRulesController],
  providers: [
    TaxRulesService,
    TaxCalculationService,
    TaxRuleResolverService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [TaxCalculationService, TaxRuleResolverService],
})
export class TaxRulesModule {}
