/**
 * How a tenant is erased, expressed as data rather than as a cascade.
 *
 * WHY NOT `prisma.tenant.delete()` ON ITS OWN. Most tenant-owned models cascade
 * from Tenant, but 87 foreign keys *between* tenant-owned models are declared
 * `Restrict`, and PostgreSQL enforces RESTRICT immediately — it does not care
 * that the referencing row is about to be removed by the same cascade. A single
 * delete therefore fails part-way through. Deleting in dependency order and
 * then removing the tenant row is what actually works.
 *
 * HOW THE ORDER WAS DERIVED. Topological sort over every model carrying a
 * `tenantId`, using the foreign keys that can block a delete — `Restrict`,
 * `NoAction`, and required relations with no explicit `onDelete` (which Prisma
 * defaults to `Restrict`). `SetNull` edges impose no ordering.
 *
 * `Cascade` EDGES DO IMPOSE ORDERING, contrary to what this comment used to
 * claim. Deleting a row cascades into its children, and each child's own
 * inbound RESTRICT edges fire during that delete. `Payslip -> PayrollRunEmployee`
 * is Restrict and `PayrollRunEmployee` cascades from `PayrollRun`, so deleting a
 * payroll run was refused by a payslip that nothing had deleted yet — while every
 * direct-edge check passed, because nothing references `PayrollRun` directly.
 * Any tenant with one payslip could not be erased at all. The order must
 * therefore account for what a delete cascades *into*.
 *
 * The sort has no cycles; `tenant-erasure.constants.spec.ts` re-derives both
 * rules from `schema.prisma` and fails if a new model is missing or misplaced,
 * so this list cannot silently drift out of date.
 */

/**
 * Detached rather than deleted: `tenantId` is set to null and the row survives.
 *
 * `clearFields` is the part that is easy to miss and fatal when missed. A
 * retained row does not only point at the tenant — it can also point at rows the
 * erasure is about to delete, and those foreign keys are `Restrict` too. A
 * support case that referenced an invoice kept that invoice alive, and the whole
 * transaction rolled back with a constraint name and no explanation. Detaching
 * clears both in one statement, while the row can still be found by `tenantId`.
 */
export const TENANT_ERASURE_DETACHED_MODELS: Array<{
  model: string;
  clearFields: string[];
}> = [
  {
    /* Legal record of what was agreed. Outlives the workspace it described. */
    model: 'contract',
    clearFields: ['subscriptionId'],
  },
  {
    /* Support history, including cases raised by people who no longer exist. */
    model: 'supportCase',
    clearFields: ['subscriptionId', 'invoiceId'],
  },
  {
    /* The commercial onboarding cycle that produced the tenant. */
    model: 'customerOnboarding',
    clearFields: [],
  },
];

/**
 * Link rows that point into the delete set with a NOT NULL foreign key.
 *
 * These cannot be detached — there is no null to write — so the link itself is
 * removed. `relation` is the path from the link row to its tenant-owned parent,
 * which is how the delete stays tenant-scoped without the link row carrying a
 * `tenantId` of its own.
 *
 * `SupportCaseIncident` joins a support case to the error log that caused it.
 * The support case is kept; the error log is tenant content and goes; the join
 * between them cannot outlive one of its two ends.
 */
export const TENANT_ERASURE_LINK_CLEANUPS: Array<{
  model: string;
  relation: string;
  note: string;
}> = [
  {
    model: 'supportCaseIncident',
    relation: 'errorLog',
    note: 'Links a retained support case to a tenant error log that is being erased.',
  },
];

/**
 * Deliberately untouched. These carry a `tenantId` column but sit on the
 * platform side of the boundary: the erasure receipt exists precisely to
 * outlive the tenant, and platform events are DijiPeople's own operational
 * telemetry, not tenant business content.
 */
export const TENANT_ERASURE_PRESERVED_MODELS = [
  'tenantErasureReceipt',
  'platformEvent',
] as const;

/**
 * Self-referencing foreign keys that block a single-statement delete of their
 * own table (a parent row and its child row go in the same `deleteMany`).
 * Nulled first; all of them are nullable by construction, since a required
 * self-reference could never have a first row.
 */
export const TENANT_ERASURE_SELF_REFERENCES: Array<{
  model: string;
  fields: string[];
}> = [
  { model: 'businessUnit', fields: ['parentBusinessUnitId'] },
  {
    model: 'employeeLevel',
    fields: ['nextEmployeeLevelId', 'parentEmployeeLevelId'],
  },
  { model: 'organization', fields: ['parentOrganizationId'] },
  { model: 'payrollJournalEntry', fields: ['originalJournalId'] },
];

/** Dependents first, parents last. See the derivation note above. */
export const TENANT_ERASURE_DELETE_ORDER: string[] = [
  'activityEvent',
  'agentLocationRequest',
  'agentRefreshToken',
  'agentTrackingSettings',
  'application',
  'applicationHistory',
  'applicationStageHistory',
  'approvalAction',
  'approvalAssignment',
  'approvalMatrix',
  'approvalRequest',
  'approvalStep',
  'attendanceCorrectionRequest',
  'attendanceDay',
  'attendanceDevice',
  'attendanceDeviceScope',
  'attendanceEntry',
  'attendanceException',
  'attendanceImportBatch',
  'attendanceIntegration',
  'attendanceIntegrationConfig',
  'attendanceLocationEvidence',
  'attendancePolicy',
  'attendanceReconciliationJob',
  'attendanceSession',
  'attendanceSyncPolicy',
  'auditLog',
  'bank',
  'benefitConsumption',
  'businessTrip',
  'businessTripAllowance',
  'businessTripApproval',
  'candidate',
  'candidateEducation',
  'candidateEvaluation',
  'candidateExperience',
  'candidateHistory',
  'candidateIdentity',
  'claimApproval',
  'claimLineItem',
  'claimRequest',
  'currency',
  'customDataRecord',
  'customizationColumn',
  'customizationForm',
  'customizationPublishSnapshot',
  'customizationSolution',
  'customizationSolutionComponent',
  'customizationTable',
  'customizationView',
  'dailyProductivitySummary',
  'dataJob',
  'dataJobBatch',
  'dataJobRow',
  'dataMappingProfile',
  'demoSeedBatch',
  'designation',
  'deviceProvisioningJob',
  'document',
  'documentCategory',
  'documentLink',
  'documentParsingJob',
  'documentReference',
  'documentType',
  'documentVersion',
  'emailDeliveryLog',
  'emailProviderSetting',
  'emailTemplate',
  'emergencyContact',
  'employeeBenefitAssignment',
  'employeeCompensation',
  'employeeCompensationComponent',
  'employeeCompensationHistory',
  'employeeDevice',
  'employeeDocumentReference',
  'employeeEducation',
  'employeeExternalIdentity',
  'employeeHistory',
  'employeeOnboarding',
  'employeePreviousEmployment',
  'employeeScheduleAssignment',
  'employeeTaxProfile',
  'employeeWorkSite',
  'employerBankAccount',
  'errorLog',
  'exchangeRateSnapshot',
  'externalDeviceUser',
  'fieldSecurityPolicy',
  'fieldSecurityPolicyRole',
  'fieldSecurityPolicyTeam',
  'fieldSecurityRule',
  'fiscalYear',
  'holiday',
  'holidayCalendar',
  'holidayCalendarAssignment',
  'integrationGateway',
  'integrationGatewayCredential',
  'integrationGatewayPairingCode',
  'integrationRun',
  'invoice',
  'jobOpening',
  'leaveApprovalStep',
  'leaveBalance',
  'leaveConsumptionRecord',
  'leavePolicy',
  'leavePolicyAssignment',
  'leavePolicyRule',
  'leaveRequest',
  'loanInstallment',
  'loanPolicy',
  'loanRequest',
  'location',
  'moduleView',
  'notification',
  'notificationInteractionLog',
  'notificationPreference',
  'notificationRecipient',
  'notificationRule',
  'notificationTemplate',
  'onboardingTask',
  'onboardingTemplate',
  'organizationSetting',
  'overtimePolicy',
  'payComponentEligibilityRule',
  'payment',
  'payrollAdjustment',
  'payrollBankExport',
  'payrollCostAllocationLine',
  'payrollException',
  'payrollExchangeRateLock',
  'payrollInputSnapshot',
  'payrollJournalEntry',
  'payrollJournalEntryLine',
  'payrollPaymentLine',
  /*
   * OUT OF ALPHABETICAL ORDER ON PURPOSE — do not "tidy" these three back.
   *
   * `Payslip.payrollRunEmployeeId -> PayrollRunEmployee` is Restrict, and
   * `PayrollRunEmployee` is reached by CASCADE from both `PayrollRun` and
   * `PayrollPeriod`. Deleting a payroll period therefore cascades into
   * `PayrollRunEmployee`, and PostgreSQL checks that RESTRICT immediately —
   * it does not care that the payslips are about to be deleted a few
   * statements later. Any tenant with a single payslip could not be erased at
   * all; the whole transaction rolled back at `payrollPeriod`.
   *
   * Ordering by blocking edges alone cannot see this, because nothing
   * references `PayrollPeriod` directly. The order has to account for what a
   * delete cascades *into*, which is what
   * `tenant-erasure.constants.spec.ts` now re-derives.
   */
  'payslipEventLog',
  'payslipLineItem',
  'payslip',
  'payrollPeriod',
  'payrollPostingRule',
  'payrollRecord',
  'payrollRegion',
  'payrollRun',
  'payrollRunLineItem',
  'permission',
  'planFeature',
  'policyAssignment',
  'policySnapshot',
  'processingCycle',
  'project',
  'projectAssignment',
  'projectRole',
  'rawAttendanceEvent',
  'recruitmentPipeline',
  'recruitmentPipelineStage',
  'refreshToken',
  'relationType',
  'role',
  'roleMiscPermission',
  'rolePermission',
  'rolePrivilege',
  'salaryComponent',
  'salaryPackageRuleComponent',
  'shiftTemplate',
  'slaEscalationLevel',
  'slaEventLog',
  'slaMilestone',
  'slaPolicy',
  'slaRule',
  'slaTracking',
  'subscription',
  'taxRuleBracket',
  'taxRulePayComponent',
  'team',
  'teamMember',
  'teamRole',
  'tenantAppAssignment',
  'tenantBranding',
  'tenantConfigurationRecord',
  'tenantDomain',
  'tenantFeature',
  'tenantNavigationOverride',
  'tenantProvisioningRun',
  'tenantProvisioningStep',
  'tenantSetting',
  'timePayrollInput',
  'timePayrollPolicy',
  'timesheetAccessRestriction',
  'timesheetDay',
  'timesheetEntry',
  'timesheetExportRequest',
  'timesheetImportBatch',
  'timesheetJobExecution',
  'timesheetMigrationResult',
  'timesheetPayrollHandoff',
  'timesheetPolicy',
  'timesheetReopeningRequest',
  'timesheetWeek',
  'travelAllowancePolicy',
  'userInvitation',
  'userPermission',
  'userRole',
  'workScheduleDay',
  'workSession',
  'workflow',
  'workflowRun',
  'benefitPolicy',
  'claimSubType',
  'claimType',
  'customer',
  'employee',
  'employeeBankAccount',
  'leaveType',
  'payrollCycle',
  'payrollGlAccount',
  'payrollRunEmployee',
  'plan',
  'policy',
  'salaryPackageRule',
  'taxRule',
  'timesheet',
  'travelAllowanceRule',
  'user',
  'workSchedule',
  'department',
  'employeeLevel',
  'employmentType',
  'payComponent',
  'payrollCalendar',
  'businessUnit',
  'organization',
];
