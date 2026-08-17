import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { PublicTenantCacheService } from '../tenants/public-tenant-cache.service';
import { FeatureAccessService } from './feature-access.service';
import { ActiveOrganizationService } from './active-organization.service';
import { ConfigurationResolverService } from './configuration-resolver.service';
import { EnterpriseConfigurationController } from './enterprise-configuration.controller';
import { FieldSecurityController } from './field-security.controller';
import { EnterpriseConfigurationService } from './enterprise-configuration.service';
import { SettingsContextController } from './settings-context.controller';
import { SettingsContextService } from './settings-context.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantBrandingController } from './tenant-branding.controller';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';
import { TenantSettingsRepository } from './tenant-settings.repository';
import { TenantSettingsService } from './tenant-settings.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [
    TenantSettingsController,
    TenantBrandingController,
    SettingsContextController,
    EnterpriseConfigurationController,
    FieldSecurityController,
  ],
  providers: [
    ActiveOrganizationService,
    ConfigurationResolverService,
    SettingsContextService,
    EnterpriseConfigurationService,
    TenantSettingsRepository,
    TenantSettingsService,
    TenantSettingsResolverService,
    PublicTenantCacheService,
    FeatureAccessService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    ActiveOrganizationService,
    TenantSettingsRepository,
    TenantSettingsService,
    TenantSettingsResolverService,
    ConfigurationResolverService,
    EnterpriseConfigurationService,
    FeatureAccessService,
  ],
})
export class TenantSettingsModule {}
