import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { BillingService } from '../super-admin/billing.service';
import { PlansRepository } from '../super-admin/plans.repository';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { TenantsController } from './tenants.controller';
import { PublicTenantsController } from './public-tenants.controller';
import { PublicTenantCacheService } from './public-tenant-cache.service';
import { PublicTenantsService } from './public-tenants.service';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    JwtModule.register({}),
    PermissionsModule,
    AuditModule,
    TenantSettingsModule,
  ],
  controllers: [TenantsController, PublicTenantsController],
  providers: [
    PublicTenantCacheService,
    PublicTenantsService,
    TenantsRepository,
    TenantsService,
    UsersRepository,
    RolesRepository,
    PlansRepository,
    BillingService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [PublicTenantsService, TenantsRepository, TenantsService],
})
export class TenantsModule {}
