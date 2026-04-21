import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrganizationModule } from '../organization/organization.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesRepository } from '../roles/roles.repository';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { UsersModule } from '../users/users.module';
import { EmployeeProfilesService } from './employee-profiles.service';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    AuthModule,
    OrganizationModule,
    AuditModule,
    DocumentsModule,
    PermissionsModule,
    TenantSettingsModule,
  ],
  controllers: [EmployeesController],
  providers: [
    EmployeesRepository,
    EmployeesService,
    EmployeeProfilesService,
    RolesRepository,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [EmployeesRepository, EmployeesService, EmployeeProfilesService],
})
export class EmployeesModule {}
