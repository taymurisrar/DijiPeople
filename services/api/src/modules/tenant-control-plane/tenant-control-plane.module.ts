import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CustomizationModule } from '../customization/customization.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PlatformEventsModule } from '../platform-events/platform-events.module';
import { RolesModule } from '../roles/roles.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { TenantAccessService } from './tenant-access.service';
import { TenantAppsService } from './tenant-apps.service';
import { TenantControlPlaneController } from './tenant-control-plane.controller';
import { TenantControlPlaneService } from './tenant-control-plane.service';
import { TenantErasureService } from './tenant-erasure.service';
import { TenantModulesService } from './tenant-modules.service';
import { TenantOperationsService } from './tenant-operations.service';
import { TenantProvisioningRunModule } from './tenant-provisioning-run.service';

/**
 * Platform Admin's control plane over one tenant workspace.
 *
 * It composes the modules that already own each concern — feature entitlement,
 * roles, invitations, auth, customization, audit and platform events — rather
 * than re-implementing any of them. `SuperAdminModule` is imported one way only,
 * for the domain provisioning service; the provisioning *recorder* lives in its
 * own module so both sides can use it without a cycle.
 */
@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    AuthModule,
    CustomizationModule,
    PermissionsModule,
    PlatformEventsModule,
    RolesModule,
    SuperAdminModule,
    TenantSettingsModule,
    TenantProvisioningRunModule,
  ],
  controllers: [TenantControlPlaneController],
  providers: [
    TenantControlPlaneService,
    TenantAccessService,
    TenantModulesService,
    TenantAppsService,
    TenantOperationsService,
    TenantErasureService,
    JwtAuthGuard,
  ],
  exports: [
    TenantControlPlaneService,
    TenantAccessService,
    TenantModulesService,
    TenantAppsService,
    TenantOperationsService,
    TenantErasureService,
  ],
})
export class TenantControlPlaneModule {}
