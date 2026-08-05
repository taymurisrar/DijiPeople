import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import {
  ContractsController,
  ContractTemplatesController,
  PlatformApprovalsController,
  PublicSignaturesController,
  SignatureRequestsController,
} from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PlatformCommunicationsModule } from '../platform-communications/platform-communications.module';

@Module({
  imports: [PlatformCommunicationsModule],
  controllers: [
    ContractsController,
    ContractTemplatesController,
    PlatformApprovalsController,
    PublicSignaturesController,
    SignatureRequestsController,
  ],
  providers: [ContractsService, JwtAuthGuard, PublicRateLimitGuard],
  exports: [ContractsService],
})
export class ContractsModule {}
