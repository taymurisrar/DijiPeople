import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesController } from './roles.controller';
import { RbacResolverService } from './rbac-resolver.service';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  imports: [JwtModule.register({}), PermissionsModule, AuditModule],
  controllers: [RolesController],
  providers: [
    RolesRepository,
    RolesService,
    RbacResolverService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [RolesRepository, RolesService, RbacResolverService],
})
export class RolesModule {}
