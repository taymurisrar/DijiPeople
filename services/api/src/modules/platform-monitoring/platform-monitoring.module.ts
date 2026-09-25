import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformHealthController } from './platform-health.controller';
import { PlatformHealthService } from './platform-health.service';
import { PlatformMonitoringController } from './platform-monitoring.controller';
import { PlatformMonitoringService } from './platform-monitoring.service';
import { StorageReadinessController } from './storage-readiness.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    PlatformMonitoringController,
    StorageReadinessController,
    PlatformHealthController,
  ],
  providers: [PlatformMonitoringService, PlatformHealthService],
  exports: [PlatformMonitoringService, PlatformHealthService],
})
export class PlatformMonitoringModule {}
