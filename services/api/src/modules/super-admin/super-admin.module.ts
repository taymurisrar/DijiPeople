import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesModule } from '../roles/roles.module';
import { LeadsRepository } from '../leads/leads.repository';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TenantsRepository } from '../tenants/tenants.repository';
import { UsersModule } from '../users/users.module';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import { PlansRepository } from './plans.repository';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    TenantSettingsModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    AuditModule,
  ],
  controllers: [SuperAdminController],
  providers: [
    TenantsRepository,
    PlansRepository,
    LeadsRepository,
    BillingService,
    PaymentsService,
    PlatformOnboardingService,
    PlatformLifecycleService,
    SuperAdminService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class SuperAdminModule {}
