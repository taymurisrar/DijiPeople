import { Module } from '@nestjs/common';
import { CustomizationModule } from '../customization/customization.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule as StripeBillingModule } from '../billing/billing.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformCommunicationsModule } from '../platform-communications/platform-communications.module';
import { RolesModule } from '../roles/roles.module';
import { LeadsRepository } from '../leads/leads.repository';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TenantsRepository } from '../tenants/tenants.repository';
import { TenantProvisioningRunModule } from '../tenant-control-plane/tenant-provisioning-run.service';
import { UsersModule } from '../users/users.module';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import { PlansRepository } from './plans.repository';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantIdentitiesProvisioningService } from './tenant-identities-provisioning.service';

@Module({
  imports: [
    CustomizationModule,
    JwtModule.register({}),
    AuthModule,
    TenantSettingsModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    NotificationsModule,
    PlatformCommunicationsModule,
    AuditModule,
    StripeBillingModule,
    TenantProvisioningRunModule,
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
    TenantProvisioningService,
    TenantIdentitiesProvisioningService,
    SuperAdminService,
    JwtAuthGuard,
    RolesGuard,
    PlatformPermissionsGuard,
  ],
  /*
   * `TenantIdentitiesProvisioningService` is exported so the tenant control
   * plane's retry path can replay the identity and billing step. The import is
   * one way — SuperAdminModule knows nothing about the control plane — which is
   * what keeps the two out of a cycle.
   */
  exports: [
    SuperAdminService,
    TenantProvisioningService,
    TenantIdentitiesProvisioningService,
  ],
})
export class SuperAdminModule {}
