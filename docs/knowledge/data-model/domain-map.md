---
aliases: [Domain Map]
---

# Data Model Domain Map

> **Generated** by `scripts/generate-data-model.mjs`. Every model in `services/api/prisma/schema.prisma`, grouped by the domain of the module that actually reads or writes it. Do not hand-edit.

Attribution is by counted Prisma call sites, not by name. A model with no call site anywhere is listed under **Unattributed** — that is a finding, not a gap in the tooling. See [[known-gaps]].

**318 models · 299 enums · 254 tenant-scoped · 13 with an entity note**

Related: [[data-model-overview]] · [[glossary]] · [[discovery-status]]

## Identity — 13 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `Identity` | no | `users` | [[entity-identity|documented]] |
| `PasswordHistory` | no | `auth` | — |
| `Permission` | yes | `permissions` | — |
| `PlatformRefreshToken` | no | `auth` | — |
| `RefreshToken` | yes | `auth` | — |
| `Role` | yes | `roles` | [[entity-role|documented]] |
| `RoleMiscPermission` | yes | `roles` | — |
| `RolePermission` | yes | `roles` | — |
| `RolePrivilege` | yes | `permissions` | — |
| `User` | yes | `users` | [[entity-user|documented]] |
| `UserInvitation` | yes | `auth` | — |
| `UserPermission` | yes | `users` | — |
| `UserRole` | yes | `users` | — |

## People — 15 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `BusinessUnit` | yes | `organization` | [[entity-business-unit|documented]] |
| `Department` | yes | `organization` | — |
| `Designation` | yes | `organization` | — |
| `DocumentVersion` | yes | `employees` | — |
| `Employee` | yes | `employees` | [[entity-employee|documented]] |
| `EmployeeEducation` | yes | `employees` | — |
| `EmployeeHistory` | yes | `employees` | — |
| `EmployeeLevel` | yes | `employee-levels` | — |
| `EmployeePreviousEmployment` | yes | `employees` | — |
| `EmploymentType` | yes | `employment-types` | — |
| `Location` | yes | `organization` | — |
| `Organization` | yes | `organization` | — |
| `Team` | yes | `teams` | — |
| `TeamMember` | yes | `teams` | — |
| `TeamRole` | yes | `teams` | — |

## Time — 43 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `AttendanceCorrectionRequest` | yes | `attendance` | — |
| `AttendanceDay` | yes | `attendance-engine` | [[entity-attendance-day|documented]] |
| `AttendanceDevice` | yes | `attendance-integrations` | — |
| `AttendanceDeviceScope` | yes | `attendance-integrations` | — |
| `AttendanceEntry` | yes | `attendance` | — |
| `AttendanceException` | yes | `attendance-engine` | — |
| `AttendanceImportBatch` | yes | `attendance` | — |
| `AttendanceIntegration` | yes | `attendance-integrations` | — |
| `AttendanceIntegrationConfig` | yes | `attendance` | — |
| `AttendanceLocationEvidence` | yes | `attendance-engine` | — |
| `AttendancePolicy` | yes | `attendance` | — |
| `AttendanceReconciliationJob` | yes | `attendance-engine` | — |
| `AttendanceSession` | yes | `attendance-engine` | — |
| `AttendanceSyncPolicy` | yes | `attendance-integrations` | — |
| `DeviceProvisioningJob` | yes | `attendance-integrations` | — |
| `EmployeeExternalIdentity` | yes | `attendance-integrations` | — |
| `EmployeeWorkSite` | yes | `attendance-integrations` | — |
| `ExternalDeviceUser` | yes | `attendance-integrations` | — |
| `IntegrationGateway` | yes | `attendance-integrations` | — |
| `IntegrationGatewayCredential` | yes | `attendance-integrations` | — |
| `IntegrationGatewayPairingCode` | yes | `attendance-integrations` | — |
| `IntegrationRun` | yes | `attendance-integrations` | — |
| `LeaveApprovalStep` | yes | `leave` | — |
| `LeaveBalance` | yes | `leave` | — |
| `LeaveConsumptionRecord` | yes | `leave` | — |
| `LeavePolicy` | yes | `leave` | — |
| `LeavePolicyAssignment` | yes | `leave` | — |
| `LeavePolicyRule` | yes | `leave` | — |
| `LeaveRequest` | yes | `leave` | — |
| `LeaveType` | yes | `leave` | — |
| `RawAttendanceEvent` | yes | `attendance-engine` | — |
| `SlaRule` | yes | **none** | — |
| `Timesheet` | yes | `timesheets` | [[entity-timesheet|documented]] |
| `TimesheetAccessRestriction` | yes | `timesheets` | — |
| `TimesheetDay` | yes | `timesheets` | — |
| `TimesheetEntry` | yes | `timesheets` | — |
| `TimesheetExportRequest` | yes | `timesheets` | — |
| `TimesheetImportBatch` | yes | `timesheets` | — |
| `TimesheetJobExecution` | yes | `timesheets` | — |
| `TimesheetPayrollHandoff` | yes | `timesheets` | — |
| `TimesheetPolicy` | yes | `timesheets` | — |
| `TimesheetReopeningRequest` | yes | `timesheets` | — |
| `TimesheetWeek` | yes | `timesheets` | — |

## Pay — 53 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `Bank` | yes | `loans` | — |
| `BenefitConsumption` | yes | `benefits` | — |
| `BenefitPolicy` | yes | `benefits` | — |
| `BusinessTrip` | yes | `business-trips` | — |
| `BusinessTripAllowance` | yes | `payroll` | — |
| `BusinessTripApproval` | yes | `business-trips` | — |
| `ClaimLineItem` | yes | `claims` | — |
| `ClaimRequest` | yes | `claims` | — |
| `ClaimSubType` | yes | `claims` | — |
| `ClaimType` | yes | `claims` | — |
| `EmployeeBankAccount` | yes | `loans` | — |
| `EmployeeBenefitAssignment` | yes | `benefits` | — |
| `EmployeeCompensation` | yes | `payroll` | — |
| `EmployeeCompensationComponent` | yes | `compensation` | — |
| `EmployeeCompensationHistory` | yes | `compensation` | — |
| `EmployeeTaxProfile` | yes | `tax-rules` | — |
| `EmployerBankAccount` | yes | `payroll` | — |
| `LoanInstallment` | yes | `loans` | — |
| `LoanPolicy` | yes | `loans` | — |
| `LoanRequest` | yes | `loans` | — |
| `OvertimePolicy` | yes | `time-payroll` | — |
| `PayComponent` | yes | `pay-components` | [[entity-pay-component|documented]] |
| `PayComponentEligibilityRule` | yes | `pay-components` | — |
| `PayrollAdjustment` | yes | `payroll` | — |
| `PayrollBankExport` | yes | `payroll` | — |
| `PayrollCalendar` | yes | `payroll` | — |
| `PayrollCostAllocationLine` | yes | `payroll` | — |
| `PayrollCycle` | yes | `payroll` | — |
| `PayrollException` | yes | `payroll` | — |
| `PayrollExchangeRateLock` | yes | `payroll` | — |
| `PayrollGlAccount` | yes | `payroll` | — |
| `PayrollInputSnapshot` | yes | `payroll` | — |
| `PayrollJournalEntry` | yes | `payroll` | — |
| `PayrollJournalEntryLine` | yes | `payroll` | — |
| `PayrollPaymentLine` | yes | `payroll` | — |
| `PayrollPeriod` | yes | `payroll` | — |
| `PayrollPostingRule` | yes | `payroll` | — |
| `PayrollRecord` | yes | `payroll` | — |
| `PayrollRun` | yes | `payroll` | [[entity-payroll-run|documented]] |
| `PayrollRunEmployee` | yes | `payroll` | — |
| `PayrollRunLineItem` | yes | `tax-rules` | — |
| `Payslip` | yes | `payslips` | — |
| `PayslipEventLog` | yes | `payslips` | — |
| `PayslipLineItem` | yes | `payslips` | — |
| `SalaryPackageRule` | yes | `compensation` | — |
| `SalaryPackageRuleComponent` | yes | `compensation` | — |
| `TaxRule` | yes | `tax-rules` | — |
| `TaxRuleBracket` | yes | `tax-rules` | — |
| `TaxRulePayComponent` | yes | `tax-rules` | — |
| `TimePayrollInput` | yes | `time-payroll` | — |
| `TimePayrollPolicy` | yes | `time-payroll` | — |
| `TravelAllowancePolicy` | yes | `business-trips` | — |
| `TravelAllowanceRule` | yes | `business-trips` | — |

## Talent — 26 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `Application` | yes | `recruitment` | — |
| `ApplicationHistory` | yes | `recruitment` | — |
| `ApplicationStageHistory` | yes | `recruitment` | — |
| `Candidate` | yes | `recruitment` | — |
| `CandidateEducation` | yes | `recruitment` | — |
| `CandidateEvaluation` | yes | `recruitment` | — |
| `CandidateExperience` | yes | `recruitment` | — |
| `CandidateHistory` | yes | `recruitment` | — |
| `CandidateIdentity` | yes | `recruitment` | — |
| `Customer` | yes | `projects` | — |
| `Document` | yes | `documents` | — |
| `DocumentCategory` | yes | `documents` | — |
| `DocumentLink` | yes | `documents` | — |
| `DocumentParsingJob` | yes | `recruitment` | — |
| `DocumentReference` | yes | `recruitment` | — |
| `DocumentType` | yes | `documents` | — |
| `EmployeeOnboarding` | yes | `onboarding` | — |
| `JobOpening` | yes | `recruitment` | — |
| `OnboardingTask` | yes | `onboarding` | — |
| `OnboardingTemplate` | yes | `onboarding` | — |
| `Policy` | yes | `policies` | — |
| `PolicyAssignment` | yes | `policies` | — |
| `Project` | yes | `projects` | — |
| `ProjectAssignment` | yes | `projects` | — |
| `RecruitmentPipeline` | yes | `recruitment` | — |
| `RecruitmentPipelineStage` | yes | `recruitment` | — |

## Governance — 12 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `ApprovalAction` | yes | `approvals` | — |
| `ApprovalAssignment` | yes | `approvals` | — |
| `ApprovalMatrix` | yes | `approvals` | — |
| `ApprovalRequest` | yes | `approvals` | — |
| `ApprovalStep` | yes | `approvals` | — |
| `ErrorLog` | yes | `error-logs` | — |
| `ErrorLogOccurrence` | no | `error-logs` | — |
| `SlaEventLog` | yes | `sla` | — |
| `SlaTracking` | yes | `sla` | — |
| `Workflow` | yes | `workflows` | — |
| `WorkflowAction` | no | `workflows` | — |
| `WorkflowRun` | yes | `workflows` | — |

## Commercial — 69 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `AuditLog` | yes | `billing` | — |
| `ConsentRecord` | yes | `legal` | — |
| `Contract` | yes | `contracts` | — |
| `ContractDocument` | no | `contracts` | — |
| `ContractFieldPlacement` | no | `contracts` | — |
| `ContractParty` | no | `contracts` | — |
| `ContractPlaceholderValue` | no | `contracts` | — |
| `ContractRelatedRecord` | no | `contracts` | — |
| `ContractTemplate` | no | `contracts` | — |
| `ContractTemplateVersion` | no | `contracts` | — |
| `ContractTimeline` | no | `contracts` | — |
| `ContractVersion` | no | `contracts` | — |
| `CustomerAccount` | no | `super-admin` | [[entity-customer-account|documented]] |
| `CustomerContact` | no | `super-admin` | — |
| `CustomerNote` | no | `super-admin` | — |
| `CustomerOnboarding` | yes | `super-admin` | — |
| `Invoice` | yes | `super-admin` | — |
| `Lead` | no | `leads` | — |
| `LeadAttributionCorrection` | no | `leads` | — |
| `LegalDocument` | no | **none** | — |
| `LegalDocumentAcknowledgement` | yes | `legal` | — |
| `LegalDocumentVersion` | no | `legal` | — |
| `Market` | no | `super-admin` | — |
| `MarketCountry` | no | `super-admin` | — |
| `Partner` | no | `partner-experience` | [[entity-partner|documented]] |
| `PartnerCommission` | no | `partners` | — |
| `PartnerInquiry` | no | `partner-experience` | — |
| `PartnerLeadReview` | no | `partner-experience` | — |
| `PartnerOnboardingApplication` | no | `partner-experience` | — |
| `PartnerOnboardingSubmission` | no | `partner-experience` | — |
| `PartnerPortalUser` | no | `partner-experience` | — |
| `PartnerReferralLink` | no | `partners` | — |
| `PartnerRefreshToken` | no | `partner-experience` | — |
| `PartnerTimeline` | no | `partner-experience` | — |
| `Payment` | yes | `billing` | — |
| `Plan` | yes | `super-admin` | — |
| `PlanChangeRequest` | yes | `billing` | — |
| `PlanFeature` | yes | `super-admin` | — |
| `PlanPrice` | no | `super-admin` | — |
| `PlatformApprovalAction` | no | `contracts` | — |
| `PlatformApprovalRequest` | no | `contracts` | — |
| `PlatformApprovalStep` | no | `contracts` | — |
| `PlatformExchangeRate` | no | `super-admin` | — |
| `Promotion` | no | `super-admin` | — |
| `ReconciliationFinding` | yes | `billing` | — |
| `ReconciliationRun` | no | `billing` | — |
| `RetentionHold` | yes | `billing` | — |
| `SeatChangeRequest` | yes | `billing` | — |
| `SeatOverageEvent` | yes | `billing` | — |
| `SeatUsagePeriod` | yes | `billing` | — |
| `SeatUsageSample` | yes | `billing` | — |
| `SignatureEvent` | no | `contracts` | — |
| `SignatureEvidence` | no | `contracts` | — |
| `SignatureRecipient` | no | `contracts` | — |
| `SignatureRequest` | no | `contracts` | — |
| `StripeWebhookEvent` | no | `billing` | — |
| `Subscription` | yes | `billing` | [[entity-subscription|documented]] |
| `SubscriptionCancellation` | yes | `billing` | — |
| `SubscriptionOrder` | yes | `billing` | — |
| `SubscriptionPromotion` | no | `super-admin` | — |
| `SupportCase` | yes | `support-cases` | — |
| `SupportCaseAttachment` | no | `support-cases` | — |
| `SupportCaseCommunication` | no | `support-cases` | — |
| `SupportCaseIncident` | no | `support-cases` | — |
| `SupportCaseTimeline` | no | `support-cases` | — |
| `Tenant` | no | `super-admin` | [[entity-tenant|documented]] |
| `TenantDeletionRequest` | yes | `billing` | — |
| `TenantFeature` | yes | `super-admin` | — |
| `TenantRetention` | yes | `billing` | — |

## Configuration — 33 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `City` | no | `lookups` | — |
| `Country` | no | `lookups` | — |
| `Currency` | yes | `lookups` | — |
| `CustomDataRecord` | yes | `data` | — |
| `CustomizationColumn` | yes | `customization` | — |
| `CustomizationForm` | yes | `customization` | — |
| `CustomizationPublishSnapshot` | yes | `customization` | — |
| `CustomizationSolution` | yes | `customization` | — |
| `CustomizationSolutionComponent` | yes | `customization` | — |
| `CustomizationTable` | yes | `customization` | — |
| `CustomizationView` | yes | `customization` | — |
| `EmployeeScheduleAssignment` | yes | `tenant-settings` | — |
| `ExchangeRateSnapshot` | yes | `lookups` | — |
| `FieldSecurityPolicy` | yes | `tenant-settings` | — |
| `FieldSecurityPolicyRole` | yes | `tenant-settings` | — |
| `FieldSecurityPolicyTeam` | yes | `tenant-settings` | — |
| `FieldSecurityRule` | yes | `tenant-settings` | — |
| `FiscalYear` | yes | `tenant-settings` | — |
| `Holiday` | yes | `tenant-settings` | — |
| `HolidayCalendar` | yes | `tenant-settings` | — |
| `HolidayCalendarAssignment` | yes | `tenant-settings` | — |
| `ModuleView` | yes | `views` | — |
| `OrganizationSetting` | yes | `tenant-settings` | — |
| `PayrollRegion` | yes | `tenant-settings` | — |
| `RelationType` | yes | `lookups` | — |
| `ShiftTemplate` | yes | `tenant-settings` | — |
| `StateProvince` | no | `lookups` | — |
| `TenantBranding` | yes | `tenant-settings` | — |
| `TenantConfigurationRecord` | yes | `settings-runtime` | — |
| `TenantNavigationOverride` | yes | `navigation` | — |
| `TenantSetting` | yes | `tenant-settings` | — |
| `WorkSchedule` | yes | `tenant-settings` | — |
| `WorkScheduleDay` | yes | `tenant-settings` | — |

## Messaging — 9 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `EmailDeliveryLog` | yes | `notifications` | — |
| `EmailProviderSetting` | yes | `notifications` | — |
| `EmailTemplate` | yes | `notifications` | — |
| `Notification` | yes | `notifications` | — |
| `NotificationEvent` | no | `notifications` | — |
| `NotificationPreference` | yes | `notifications` | — |
| `NotificationRecipient` | yes | `notifications` | — |
| `NotificationRule` | yes | **none** | — |
| `NotificationTemplate` | yes | **none** | — |

## Platform ops — 29 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `ActivityEvent` | yes | `agent` | — |
| `AgentLocationRequest` | yes | `agent` | — |
| `AgentRefreshToken` | yes | `agent` | — |
| `AgentTrackingSettings` | yes | `agent` | — |
| `ApplicationRelease` | no | `app-releases` | — |
| `ClipboardCaptureEvent` | yes | `agent` | — |
| `DailyProductivitySummary` | yes | `agent` | — |
| `DataJob` | yes | `data-management` | — |
| `DataJobRow` | yes | `data-management` | — |
| `DemoSeedBatch` | yes | `demo-data` | — |
| `DlpAlert` | yes | `agent` | — |
| `DlpRule` | yes | `agent` | — |
| `EmployeeDevice` | yes | `agent` | — |
| `NotificationInteractionLog` | yes | `inbox` | — |
| `OutboxEvent` | yes | `outbox` | — |
| `OutboxEventConsumption` | no | `outbox` | — |
| `PlatformAuditLog` | no | `platform-users` | — |
| `PlatformEvent` | yes | `platform-events` | — |
| `PlatformModulePreference` | no | `platform-users` | — |
| `PlatformOutboundEmail` | no | `platform-communications` | — |
| `PlatformSetting` | no | `platform-communications` | — |
| `PlatformUser` | no | `platform-users` | — |
| `ScreenCaptureEvent` | yes | `agent` | — |
| `TenantAppAssignment` | yes | `tenant-control-plane` | — |
| `TenantDomain` | yes | `tenant-domains` | — |
| `TenantErasureReceipt` | yes | `tenant-control-plane` | — |
| `TenantProvisioningRun` | yes | `tenant-control-plane` | — |
| `TenantProvisioningStep` | yes | `tenant-control-plane` | — |
| `WorkSession` | yes | `agent` | — |

## Unattributed — 16 models

| Model | Tenant | Owning module | Note |
|---|---|---|---|
| `ClaimApproval` | yes | **none** | — |
| `DataJobBatch` | yes | **none** | — |
| `DataMappingProfile` | yes | **none** | — |
| `EmergencyContact` | yes | **none** | — |
| `EmployeeDocumentReference` | yes | **none** | — |
| `PolicySnapshot` | yes | **none** | — |
| `ProcessingCycle` | yes | **none** | — |
| `ProjectRole` | yes | **none** | — |
| `RefundRequest` | yes | **none** | — |
| `SalaryComponent` | yes | **none** | — |
| `SlaEscalationLevel` | yes | **none** | — |
| `SlaMilestone` | yes | **none** | — |
| `SlaPolicy` | yes | **none** | — |
| `Subprocessor` | no | **none** | — |
| `TenantEnvironmentGroup` | no | **none** | — |
| `TimesheetMigrationResult` | yes | **none** | — |
