import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PoliciesController } from './policies.controller';
import { PolicyResolverService } from './policy-resolver.service';
import { PoliciesService } from './policies.service';

@Module({
  imports: [AuditModule],
  controllers: [PoliciesController],
  providers: [PoliciesService, PolicyResolverService],
  exports: [PoliciesService, PolicyResolverService],
})
export class PoliciesModule {}
