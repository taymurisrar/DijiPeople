import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { BenefitEligibilityService } from './benefit-eligibility.service';
import { BenefitsController } from './benefits.controller';
import { BenefitsService } from './benefits.service';

@Module({
  imports: [AuditModule, ApprovalsModule],
  controllers: [BenefitsController],
  providers: [BenefitsService, BenefitEligibilityService],
  exports: [BenefitsService, BenefitEligibilityService],
})
export class BenefitsModule {}
