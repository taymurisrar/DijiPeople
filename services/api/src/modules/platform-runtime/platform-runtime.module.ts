import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LeadsModule } from '../leads/leads.module';
import { PartnersModule } from '../partners/partners.module';
import { PlatformMonitoringModule } from '../platform-monitoring/platform-monitoring.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { ContractsModule } from '../contracts/contracts.module';
import { SupportCasesModule } from '../support-cases/support-cases.module';
import { PartnerExperienceModule } from '../partner-experience/partner-experience.module';
import { PlatformRuntimeController } from './platform-runtime.controller';
import { PlatformRuntimeService } from './platform-runtime.service';

@Module({
  imports: [
    AuditModule,
    LeadsModule,
    PartnersModule,
    PlatformMonitoringModule,
    SuperAdminModule,
    ContractsModule,
    SupportCasesModule,
    PartnerExperienceModule,
  ],
  controllers: [PlatformRuntimeController],
  providers: [PlatformRuntimeService],
})
export class PlatformRuntimeModule {}
