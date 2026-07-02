import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsRuntimeController } from './settings-runtime.controller';
import { SettingsRuntimeService } from './settings-runtime.service';

@Module({
  imports: [AuditModule],
  controllers: [SettingsRuntimeController],
  providers: [SettingsRuntimeService],
})
export class SettingsRuntimeModule {}
