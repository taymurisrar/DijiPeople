import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeeLevelsController } from './employee-levels.controller';
import { EmployeeLevelsService } from './employee-levels.service';

@Module({
  imports: [AuditModule],
  controllers: [EmployeeLevelsController],
  providers: [EmployeeLevelsService],
  exports: [EmployeeLevelsService],
})
export class EmployeeLevelsModule {}
