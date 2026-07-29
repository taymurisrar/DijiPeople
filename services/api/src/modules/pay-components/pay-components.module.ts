import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompensationModule } from '../compensation/compensation.module';
import { PayComponentsController } from './pay-components.controller';
import { PayComponentsService } from './pay-components.service';

@Module({
  imports: [AuditModule, CompensationModule],
  controllers: [PayComponentsController],
  providers: [PayComponentsService],
  exports: [PayComponentsService],
})
export class PayComponentsModule {}
