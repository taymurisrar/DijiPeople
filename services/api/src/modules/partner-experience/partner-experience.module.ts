import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PartnerAuthGuard } from './partner-auth.guard';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import {
  PartnerAuthController,
  PartnerExperienceAdminController,
  PartnerPortalController,
  PublicPartnersController,
} from './partner-experience.controller';
import { PartnerExperienceService } from './partner-experience.service';
import { PlatformCommunicationsModule } from '../platform-communications/platform-communications.module';

@Module({
  imports: [AuthModule, PlatformCommunicationsModule],
  controllers: [
    PublicPartnersController,
    PartnerAuthController,
    PartnerPortalController,
    PartnerExperienceAdminController,
  ],
  providers: [
    PartnerExperienceService,
    PartnerAuthGuard,
    JwtAuthGuard,
    PublicRateLimitGuard,
  ],
  exports: [PartnerExperienceService],
})
export class PartnerExperienceModule {}
