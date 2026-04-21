import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PermissionsModule } from '../permissions/permissions.module';
import { BillingService } from '../super-admin/billing.service';
import { PlansRepository } from '../super-admin/plans.repository';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { TenantsController } from './tenants.controller';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

@Module({
  imports: [JwtModule.register({}), PermissionsModule],
  controllers: [TenantsController],
  providers: [
    TenantsRepository,
    TenantsService,
    UsersRepository,
    RolesRepository,
    PlansRepository,
    BillingService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [TenantsRepository, TenantsService],
})
export class TenantsModule {}
