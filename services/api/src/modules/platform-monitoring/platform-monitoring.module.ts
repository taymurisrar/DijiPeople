import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformMonitoringController } from './platform-monitoring.controller';
import { PlatformMonitoringService } from './platform-monitoring.service';

@Module({
  imports: [AuditModule],
  controllers: [PlatformMonitoringController],
  providers: [PlatformMonitoringService],
})
export class PlatformMonitoringModule {}
