import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { TeamsController } from './teams.controller';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

@Module({
  imports: [JwtModule.register({}), AuditModule, RolesModule, UsersModule],
  controllers: [TeamsController],
  providers: [TeamsRepository, TeamsService, JwtAuthGuard, PermissionsGuard],
  exports: [TeamsRepository, TeamsService],
})
export class TeamsModule {}
