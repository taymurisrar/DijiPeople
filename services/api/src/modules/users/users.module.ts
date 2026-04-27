import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesRepository } from '../roles/roles.repository';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [JwtModule.register({}), AuditModule, PermissionsModule],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    RolesRepository,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
