import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AuditModule } from '../audit/audit.module';
import { DlpController } from './dlp/dlp.controller';
import { DlpService } from './dlp/dlp.service';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [AgentController, DlpController],
  // SecretEncryptionService is not global; it is provided here so DLP capture
  // can encrypt clipboard text and screenshot bytes at rest. StorageService is
  // global (StorageModule) and needs no provider entry.
  providers: [AgentService, DlpService, SecretEncryptionService],
  exports: [AgentService],
})
export class AgentModule {}
