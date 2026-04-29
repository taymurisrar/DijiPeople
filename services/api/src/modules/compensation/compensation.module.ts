import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompensationController } from './compensation.controller';
import { CompensationResolverService } from './compensation-resolver.service';
import { CompensationService } from './compensation.service';

@Module({
  imports: [AuditModule],
  controllers: [CompensationController],
  providers: [CompensationService, CompensationResolverService],
  exports: [CompensationService, CompensationResolverService],
})
export class CompensationModule {}
