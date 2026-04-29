import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from './common/mailer/mailer.module';
import { BusinessUnitAccessMiddleware } from './common/middleware/business-unit-access.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { StorageModule } from './common/storage/storage.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AgentModule } from './modules/agent/agent.module';
import { CompensationModule } from './modules/compensation/compensation.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CustomizationModule } from './modules/customization/customization.module';
import { DataModule } from './modules/data/data.module';
import { EmployeeLevelsModule } from './modules/employee-levels/employee-levels.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LeaveModule } from './modules/leave/leave.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { ModuleViewsModule } from './modules/views/module-views.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayComponentsModule } from './modules/pay-components/pay-components.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PayslipsModule } from './modules/payslips/payslips.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule,
    PrismaModule,
    RequestContextModule,
    StorageModule,
    AttendanceModule,
    AgentModule,
    AuditModule,
    AuthModule,
    ClaimsModule,
    CompensationModule,
    CustomizationModule,
    DataModule,
    DocumentsModule,
    EmployeeLevelsModule,
    EmployeesModule,
    LeaveModule,
    LeadsModule,
    LookupsModule,
    ModuleViewsModule,
    OnboardingModule,
    OrganizationModule,
    PayComponentsModule,
    PayrollModule,
    PayslipsModule,
    PoliciesModule,
    ProjectsModule,
    RecruitmentModule,
    ReportsModule,
    SuperAdminModule,
    TenantSettingsModule,
    TeamsModule,
    TimesheetsModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
  ],
  controllers: [AppController],
  providers: [AppService, BusinessUnitAccessMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(BusinessUnitAccessMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
