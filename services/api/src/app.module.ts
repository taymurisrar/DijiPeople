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
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { StorageModule } from './common/storage/storage.module';
import { TenantEntitlementModule } from './common/security/tenant-entitlement.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AttendanceIntegrationsModule } from './modules/attendance-integrations/attendance-integrations.module';
import { AttendanceEngineModule } from './modules/attendance-engine/attendance-engine.module';
import { AppReleasesModule } from './modules/app-releases/app-releases.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { AgentModule } from './modules/agent/agent.module';
import { BusinessTripsModule } from './modules/business-trips/business-trips.module';
import { TimePayrollModule } from './modules/time-payroll/time-payroll.module';
import { TaxRulesModule } from './modules/tax-rules/tax-rules.module';
import { CompensationModule } from './modules/compensation/compensation.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { SettingsRuntimeModule } from './modules/settings-runtime/settings-runtime.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DataManagementModule } from './modules/data-management/data-management.module';
import { CustomizationModule } from './modules/customization/customization.module';
import { NavigationModule } from './modules/navigation/navigation.module';
import { DataModule } from './modules/data/data.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeeLevelsModule } from './modules/employee-levels/employee-levels.module';
import { EmploymentTypesModule } from './modules/employment-types/employment-types.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { LeaveModule } from './modules/leave/leave.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LoansModule } from './modules/loans/loans.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { ModuleViewsModule } from './modules/views/module-views.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayComponentsModule } from './modules/pay-components/pay-components.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PlatformMonitoringModule } from './modules/platform-monitoring/platform-monitoring.module';
import { LegalModule } from './modules/legal/legal.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PlatformEventsModule } from './modules/platform-events/platform-events.module';
import { PlatformUsersModule } from './modules/platform-users/platform-users.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PayslipsModule } from './modules/payslips/payslips.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SlaModule } from './modules/sla/sla.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { ErrorLogsModule } from './modules/error-logs/error-logs.module';
import { DemoDataModule } from './modules/demo-data/demo-data.module';
import { PartnersModule } from './modules/partners/partners.module';
import { PlatformRuntimeModule } from './modules/platform-runtime/platform-runtime.module';
import { TenantControlPlaneModule } from './modules/tenant-control-plane/tenant-control-plane.module';
import { TenantDomainsModule } from './modules/tenant-domains/tenant-domains.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { PartnerExperienceModule } from './modules/partner-experience/partner-experience.module';
import { SupportCasesModule } from './modules/support-cases/support-cases.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule,
    PrismaModule,
    RequestContextModule,
    StorageModule,
    TenantEntitlementModule,
    AttendanceModule,
    AttendanceIntegrationsModule,
    AttendanceEngineModule,
    AppReleasesModule,
    ApprovalsModule,
    AgentModule,
    AuditModule,
    AuthModule,
    BillingModule,
    BusinessTripsModule,
    TimePayrollModule,
    TaxRulesModule,
    ClaimsModule,
    BenefitsModule,
    SettingsRuntimeModule,
    CompensationModule,
    CustomizationModule,
    NavigationModule,
    DataModule,
    DashboardModule,
    DocumentsModule,
    DataManagementModule,
    DemoDataModule,
    EmployeeLevelsModule,
    EmploymentTypesModule,
    EmployeesModule,
    InboxModule,
    LeaveModule,
    LeadsModule,
    LoansModule,
    LookupsModule,
    ModuleViewsModule,
    NotificationsModule,
    WorkflowsModule,
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
    ErrorLogsModule,
    TenantSettingsModule,
    TeamsModule,
    TimesheetsModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    SlaModule,
    PermissionsModule,
    PlatformMonitoringModule,
    LegalModule,
    OutboxModule,
    PlatformEventsModule,
    PlatformUsersModule,
    PartnersModule,
    ContractsModule,
    PartnerExperienceModule,
    SupportCasesModule,
    PlatformRuntimeModule,
    TenantDomainsModule,
    TenantControlPlaneModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BusinessUnitAccessMiddleware,
    RequestIdMiddleware,
    HttpExceptionFilter,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });

    consumer
      .apply(BusinessUnitAccessMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
