import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { OrganizationModule } from '../organization/organization.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { UsersModule } from '../users/users.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    JwtModule.register({}),
    RecruitmentModule,
    UsersModule,
    OrganizationModule,
    EmployeesModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingRepository,
    OnboardingService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [OnboardingRepository, OnboardingService],
})
export class OnboardingModule {}
