import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionBootstrapService } from './permission-bootstrap.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PermissionsController],
  providers: [
    PermissionsRepository,
    PermissionsService,
    PermissionBootstrapService,
    JwtAuthGuard,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [
    PermissionsRepository,
    PermissionsService,
    PermissionBootstrapService,
  ],
})
export class PermissionsModule {}
