import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { OvertimePolicyResolverService } from './overtime-policy-resolver.service';
import { TimePayrollController } from './time-payroll.controller';
import { TimePayrollPolicyResolverService } from './time-payroll-policy-resolver.service';
import { TimePayrollPreparationService } from './time-payroll-preparation.service';
import { TimePayrollService } from './time-payroll.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [TimePayrollController],
  providers: [
    TimePayrollService,
    TimePayrollPreparationService,
    TimePayrollPolicyResolverService,
    OvertimePolicyResolverService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    TimePayrollPreparationService,
    TimePayrollPolicyResolverService,
    OvertimePolicyResolverService,
  ],
})
export class TimePayrollModule {}
