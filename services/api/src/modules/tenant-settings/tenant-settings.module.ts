import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { FeatureAccessService } from './feature-access.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';
import { TenantSettingsRepository } from './tenant-settings.repository';
import { TenantSettingsService } from './tenant-settings.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [TenantSettingsController],
  providers: [
    TenantSettingsRepository,
    TenantSettingsService,
    TenantSettingsResolverService,
    FeatureAccessService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    TenantSettingsRepository,
    TenantSettingsService,
    TenantSettingsResolverService,
    FeatureAccessService,
  ],
})
export class TenantSettingsModule {}
