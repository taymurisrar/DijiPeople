import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { ApplicationsController } from './applications.controller';
import { CandidateIdentityResolutionService } from './candidate-identity-resolution.service';
import { CandidatesController } from './candidates.controller';
import { DocumentParsingService } from './document-parsing.service';
import { JobOpeningsController } from './job-openings.controller';
import { RecruitmentRepository } from './recruitment.repository';
import { RecruitmentScoringService } from './recruitment-scoring.service';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [JwtModule.register({}), TenantSettingsModule],
  controllers: [
    JobOpeningsController,
    CandidatesController,
    ApplicationsController,
  ],
  providers: [
    RecruitmentRepository,
    RecruitmentService,
    RecruitmentScoringService,
    CandidateIdentityResolutionService,
    DocumentParsingService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [RecruitmentRepository, RecruitmentService],
})
export class RecruitmentModule {}
