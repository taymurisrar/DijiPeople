import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [AuditModule, ApprovalsModule, NotificationsModule],
  controllers: [LoansController],
  providers: [LoansService, SecretEncryptionService],
  exports: [LoansService],
})
export class LoansModule {}
