import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LeaveModule } from './modules/leave/leave.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
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
    AuditModule,
    AuthModule,
    DocumentsModule,
    EmployeesModule,
    LeaveModule,
    LeadsModule,
    LookupsModule,
    OnboardingModule,
    OrganizationModule,
    PayrollModule,
    ProjectsModule,
    RecruitmentModule,
    ReportsModule,
    SuperAdminModule,
    TenantSettingsModule,
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
    consumer.apply(BusinessUnitAccessMiddleware).forRoutes('*');
  }
}
