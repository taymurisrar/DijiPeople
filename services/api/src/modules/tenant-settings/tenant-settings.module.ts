import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { PublicTenantCacheService } from '../tenants/public-tenant-cache.service';
import { BrandingAssetsService } from './branding-assets.service';
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
  // `forwardRef` on DocumentsModule: it already imports this module for the
  // document-settings resolver, and branding-asset upload needs its service to
  // create the document. Both directions are real. BUG-0041 / ITEM-0050.
  imports: [
    JwtModule.register({}),
    AuditModule,
    forwardRef(() => DocumentsModule),
  ],
  controllers: [
    TenantSettingsController,
    TenantBrandingController,
    SettingsContextController,
    EnterpriseConfigurationController,
    FieldSecurityController,
  ],
  providers: [
    ActiveOrganizationService,
    BrandingAssetsService,
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
    BrandingAssetsService,
    TenantSettingsRepository,
    TenantSettingsService,
    TenantSettingsResolverService,
    ConfigurationResolverService,
    EnterpriseConfigurationService,
    FeatureAccessService,
  ],
})
export class TenantSettingsModule {}
