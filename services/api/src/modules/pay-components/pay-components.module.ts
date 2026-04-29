import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PayComponentsController } from './pay-components.controller';
import { PayComponentsService } from './pay-components.service';

@Module({
  imports: [AuditModule],
  controllers: [PayComponentsController],
  providers: [PayComponentsService],
  exports: [PayComponentsService],
})
export class PayComponentsModule {}
