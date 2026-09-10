import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformMonitoringController } from './platform-monitoring.controller';
import { PlatformMonitoringService } from './platform-monitoring.service';
import { StorageReadinessController } from './storage-readiness.controller';

@Module({
  imports: [AuditModule],
  controllers: [PlatformMonitoringController, StorageReadinessController],
  providers: [PlatformMonitoringService],
  exports: [PlatformMonitoringService],
})
export class PlatformMonitoringModule {}
