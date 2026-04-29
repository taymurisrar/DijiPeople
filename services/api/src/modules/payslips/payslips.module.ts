import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';

@Module({
  imports: [AuditModule],
  controllers: [PayslipsController],
  providers: [PayslipsService],
  exports: [PayslipsService],
})
export class PayslipsModule {}
