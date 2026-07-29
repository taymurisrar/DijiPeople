import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayrollOutputDocumentService } from '../payroll/payroll-output-document.service';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [PayslipsController],
  providers: [PayslipsService, PayrollOutputDocumentService],
  exports: [PayslipsService],
})
export class PayslipsModule {}
