import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DuplicateRuleEngine } from '../../common/validation/duplicate-rule-engine';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesRepository } from '../roles/roles.repository';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { UsersModule } from '../users/users.module';
import { EmployeeProfilesService } from './employee-profiles.service';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';
import { EmployeeAccessService } from './employee-access.service';

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
    NotificationsModule,
  ],
  controllers: [EmployeesController],
  providers: [
    EmployeesRepository,
    EmployeeAccessService,
    EmployeesService,
    EmployeeProfilesService,
    RolesRepository,
    DuplicateRuleEngine,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    EmployeesRepository,
    EmployeesService,
    EmployeeProfilesService,
    EmployeeAccessService,
  ],
})
export class EmployeesModule {}
