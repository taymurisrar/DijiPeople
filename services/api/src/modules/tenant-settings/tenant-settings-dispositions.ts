import { DEFAULT_TENANT_SETTINGS } from './tenant-settings.catalog';

/**
 * Why a catalog key is inert. Every entry carries one, because "no reader" is a
 * symptom and the right disposition depends on the cause.
 */
export const INERT_REASONS = {
  /**
   * The behaviour the key describes is not implemented. The key stays declared
   * — removing it would break `PATCH /tenant-settings` for a tenant that
   * already stored a value — but nothing honours it and no control offers it.
   */
  NOT_IMPLEMENTED: 'The behaviour this key describes is not implemented.',

  /**
   * A real domain model or platform setting already owns this decision, and the
   * catalog copy is a second, inert source of truth for it. The fix is to use
   * the model, not to wire the key: wiring it would create exactly the
   * duplication `AGENTS.md` forbids.
   */
  DUPLICATE_OF_DOMAIN_MODEL:
    'A domain model or platform setting already owns this; the catalog copy is a duplicate.',

  /**
   * The behaviour exists and is deliberately not optional. The key offers a
   * choice the domain cannot honour — payroll cannot compute pay without an
   * active compensation assignment, and a reporting line that closes a cycle is
   * not a preference. A switch here would be a worse lie than no switch.
   */
  UNCONDITIONAL_BY_DESIGN:
    'The behaviour is unconditional; the key offers a choice the domain cannot honour.',

  /**
   * Inert, and its control is **not** yet withdrawn, because another in-flight
   * change owns these entries — the attendance settings work covering BUG-1978,
   * BUG-1979, BUG-1980, BUG-1981 and BUG-2091. Every key here is a known lie
   * still on screen. This is the one temporary reason code and it must reach
   * zero: either those keys gain readers and leave this file, or they take one
   * of the reasons above and their controls go with them.
   */
  DEFERRED_ATTENDANCE_WORK:
    'Owned by the concurrent attendance settings work; control not yet withdrawn.',
} as const;

export type InertReasonCode = keyof typeof INERT_REASONS;

/**
 * Tenant setting keys the catalog declares that no production code reads.
 *
 * BUG-1974 measured the settings surface at `eb457d9d`: of 591 declared keys,
 * 246 had no reader anywhere in the monorepo and 230 of those were rendered as
 * live, editable controls. An administrator changed one, the value was
 * validated, stored, cached, audited and echoed back, the screen said saved and
 * the value survived a reload — and nothing in the platform ever read it. There
 * was no error and no warning to give the lie away.
 *
 * Twenty-four keys were deleted outright; see the comments in
 * `tenant-settings.catalog.ts`. The rest are listed here, and their editable
 * controls have been removed from the settings pages. `GET /tenant-settings`
 * reports this list so an integrator can see which declared keys are inert
 * rather than discovering it from behaviour that never changes.
 *
 * **This list may only shrink.** Removing an entry is how a key becomes live:
 * write the reader and delete the line. `tenant-settings-reader-coverage.spec.ts`
 * fails both ways — on a declared key that is neither read nor listed here, and
 * on a key listed here that something now reads — so the two cannot drift.
 *
 * Keyed `'<category>.<key>'`, because 24 keys share a name across two
 * categories and a bare key name cannot tell them apart. That confusion is what
 * BUG-1977 was.
 */
export const INERT_TENANT_SETTING_KEYS: Readonly<
  Record<string, InertReasonCode>
> = Object.freeze({
  // organization (6)
  'organization.businessDateSource': 'NOT_IMPLEMENTED',
  'organization.businessDateTimezone': 'NOT_IMPLEMENTED',
  'organization.businessDayStartTime': 'NOT_IMPLEMENTED',
  'organization.allowManualBusinessDateOverride': 'NOT_IMPLEMENTED',
  'organization.manualBusinessDate': 'NOT_IMPLEMENTED',
  'organization.lockPastBusinessDates': 'NOT_IMPLEMENTED',

  // employees (6)
  'employees.requireWorkCalendar': 'NOT_IMPLEMENTED',
  'employees.maximumDirectReports': 'NOT_IMPLEMENTED',
  'employees.validateReportingHierarchy': 'UNCONDITIONAL_BY_DESIGN',
  'employees.preventCircularReporting': 'UNCONDITIONAL_BY_DESIGN',
  'employees.preventDuplicatePassport': 'NOT_IMPLEMENTED',
  'employees.preventDuplicateEmployeeId': 'UNCONDITIONAL_BY_DESIGN',

  // attendance (19)
  'attendance.allowEarlyCheckIn': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.earliestCheckInMinutesBeforeShift': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.allowLateCheckOut': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.maximumWorkingHoursPerDay': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.minimumWorkingHoursPerDay': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.enforceWorkSiteGeofence': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.outsideGeofenceAction': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.requireWorkSiteOnOfficeAttendance': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.noAssignedScheduleBehavior': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.requireReasonForOffdayHolidayCheckIn': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.allowManualAttendanceAdjustments': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.employeesCanRequestCorrection': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.managerCanApproveCorrection': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.hrCanOverrideAttendance': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.correctionRequiresReason': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.correctionRequiresAttachment': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.maximumCorrectionAgeDays': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.detectMockLocation': 'DEFERRED_ATTENDANCE_WORK',
  'attendance.rejectMockLocation': 'DEFERRED_ATTENDANCE_WORK',

  // timesheets (79)
  'timesheets.timesheetRequired': 'NOT_IMPLEMENTED',
  'timesheets.entryMode': 'NOT_IMPLEMENTED',
  'timesheets.generatePayrollInputsAutomatically': 'NOT_IMPLEMENTED',
  'timesheets.includeOvertimeInPayrollExport': 'NOT_IMPLEMENTED',
  'timesheets.includeLeaveInPayrollExport': 'NOT_IMPLEMENTED',
  'timesheets.includeHolidaysInPayrollExport': 'NOT_IMPLEMENTED',
  'timesheets.includeUnpaidTimeInPayrollExport': 'NOT_IMPLEMENTED',
  'timesheets.submissionDeadlineDaysAfterPeriodEnd': 'NOT_IMPLEMENTED',
  'timesheets.managerApprovalDeadlineDays': 'NOT_IMPLEMENTED',
  'timesheets.allowFutureEntries': 'NOT_IMPLEMENTED',
  'timesheets.maximumBackdatedDays': 'NOT_IMPLEMENTED',
  'timesheets.generationLeadDays': 'NOT_IMPLEMENTED',
  'timesheets.visiblePastMonths': 'NOT_IMPLEMENTED',
  'timesheets.visibleFutureMonths': 'NOT_IMPLEMENTED',
  'timesheets.allowPreviousIncompleteWeek': 'NOT_IMPLEMENTED',
  'timesheets.allowPreviousOverdueWeek': 'NOT_IMPLEMENTED',
  'timesheets.allowPreviousRejectedWeek': 'NOT_IMPLEMENTED',
  'timesheets.allowFutureWeekEntry': 'NOT_IMPLEMENTED',
  'timesheets.futureWeeksAllowed': 'NOT_IMPLEMENTED',
  'timesheets.weeklySubmissionRequired': 'NOT_IMPLEMENTED',
  'timesheets.autoCompleteLeaveOnlyWeek': 'NOT_IMPLEMENTED',
  'timesheets.autoSubmitLeaveOnlyWeek': 'NOT_IMPLEMENTED',
  'timesheets.includeEmploymentDates': 'NOT_IMPLEMENTED',
  'timesheets.lockSystemClassifiedDays': 'NOT_IMPLEMENTED',
  'timesheets.allowTimerEntries': 'NOT_IMPLEMENTED',
  'timesheets.requireVarianceReason': 'NOT_IMPLEMENTED',
  'timesheets.includeAttendanceCorrections': 'NOT_IMPLEMENTED',
  'timesheets.attendanceConflictBehavior': 'NOT_IMPLEMENTED',
  'timesheets.includeApprovedLeave': 'NOT_IMPLEMENTED',
  'timesheets.includePartialLeave': 'NOT_IMPLEMENTED',
  'timesheets.recalculateRetroactiveLeave': 'NOT_IMPLEMENTED',
  'timesheets.pendingLeaveBehavior': 'NOT_IMPLEMENTED',
  'timesheets.includeScopedHolidays': 'NOT_IMPLEMENTED',
  'timesheets.requireHolidayWorkReason': 'NOT_IMPLEMENTED',
  'timesheets.requireHolidayWorkApproval': 'NOT_IMPLEMENTED',
  'timesheets.holidayHoursCategory': 'NOT_IMPLEMENTED',
  'timesheets.allowNonProjectTime': 'NOT_IMPLEMENTED',
  'timesheets.requireProjectManagerApproval': 'NOT_IMPLEMENTED',
  'timesheets.allowNonBillableActivity': 'NOT_IMPLEMENTED',
  'timesheets.requireWorkItemReference': 'NOT_IMPLEMENTED',
  'timesheets.approvalScope': 'NOT_IMPLEMENTED',
  'timesheets.defaultApproverSource': 'NOT_IMPLEMENTED',
  'timesheets.requireProjectApproval': 'NOT_IMPLEMENTED',
  'timesheets.approvalSlaHours': 'NOT_IMPLEMENTED',
  'timesheets.allowDelegation': 'NOT_IMPLEMENTED',
  'timesheets.enableApprovalEscalation': 'NOT_IMPLEMENTED',
  'timesheets.includeRegularHoursInPayroll': 'NOT_IMPLEMENTED',
  'timesheets.includeBillableHoursInPayroll': 'NOT_IMPLEMENTED',
  'timesheets.includeNonBillableHoursInPayroll': 'NOT_IMPLEMENTED',
  'timesheets.allowPayrollAdjustment': 'NOT_IMPLEMENTED',
  'timesheets.lockWeekAfterPayrollExport': 'NOT_IMPLEMENTED',
  'timesheets.requireReopeningApproval': 'NOT_IMPLEMENTED',
  'timesheets.requirePayrollAdjustmentAfterReopening': 'NOT_IMPLEMENTED',
  'timesheets.restrictReopeningToSpecifiedEntries': 'NOT_IMPLEMENTED',
  'timesheets.autoExpireReopeningDays': 'NOT_IMPLEMENTED',
  'timesheets.reapprovalBehavior': 'NOT_IMPLEMENTED',
  'timesheets.enableMissingTimesheetWarnings': 'NOT_IMPLEMENTED',
  'timesheets.warningAfterDays': 'NOT_IMPLEMENTED',
  'timesheets.restrictionAllowedModules': 'NOT_IMPLEMENTED',
  'timesheets.allowTimesheetsDuringRestriction': 'NOT_IMPLEMENTED',
  'timesheets.allowNotificationsDuringRestriction': 'NOT_IMPLEMENTED',
  'timesheets.allowProfileDuringRestriction': 'NOT_IMPLEMENTED',
  'timesheets.allowHelpDuringRestriction': 'NOT_IMPLEMENTED',
  'timesheets.emergencyOverrideEnabled': 'NOT_IMPLEMENTED',
  'timesheets.temporaryOverrideExpiryHours': 'NOT_IMPLEMENTED',
  'timesheets.excludeApprovedLeave': 'NOT_IMPLEMENTED',
  'timesheets.excludePendingApproval': 'NOT_IMPLEMENTED',
  'timesheets.allowNotifications': 'NOT_IMPLEMENTED',
  'timesheets.submissionReminderEnabled': 'NOT_IMPLEMENTED',
  'timesheets.approvalReminderEnabled': 'NOT_IMPLEMENTED',
  'timesheets.overdueNotificationEnabled': 'NOT_IMPLEMENTED',
  'timesheets.rejectionNotificationEnabled': 'NOT_IMPLEMENTED',
  'timesheets.reopeningNotificationEnabled': 'NOT_IMPLEMENTED',
  'timesheets.payrollNotificationEnabled': 'NOT_IMPLEMENTED',
  'timesheets.reminderSchedule': 'NOT_IMPLEMENTED',
  'timesheets.escalationSchedule': 'NOT_IMPLEMENTED',
  'timesheets.sanitizeSpreadsheetValues': 'NOT_IMPLEMENTED',
  'timesheets.retentionYears': 'NOT_IMPLEMENTED',
  'timesheets.requireChangeReasonAfterApproval': 'NOT_IMPLEMENTED',

  // payroll (38)
  'payroll.activeEmployeeContractAction': 'NOT_IMPLEMENTED',
  'payroll.activeCompensationAssignmentAction': 'UNCONDITIONAL_BY_DESIGN',
  'payroll.activeTaxProfileAction': 'NOT_IMPLEMENTED',
  'payroll.approvedAttendanceAction': 'NOT_IMPLEMENTED',
  'payroll.approvedTimesheetsAction': 'NOT_IMPLEMENTED',
  'payroll.approvedLeaveAction': 'NOT_IMPLEMENTED',
  'payroll.approvedOvertimeAction': 'NOT_IMPLEMENTED',
  'payroll.projectAllocationAction': 'NOT_IMPLEMENTED',
  'payroll.resolvedPostingRulesAction': 'NOT_IMPLEMENTED',
  'payroll.validPayrollCalendarAction': 'NOT_IMPLEMENTED',
  'payroll.validPayrollPeriodAction': 'NOT_IMPLEMENTED',
  'payroll.duplicatePeriodAction': 'NOT_IMPLEMENTED',
  'payroll.payrollApprovalAction': 'NOT_IMPLEMENTED',
  'payroll.missingExchangeRateAction': 'UNCONDITIONAL_BY_DESIGN',
  'payroll.currencyPrecision': 'NOT_IMPLEMENTED',
  'payroll.calculationSequenceProfile': 'NOT_IMPLEMENTED',
  'payroll.partialMonthMethod': 'NOT_IMPLEMENTED',
  'payroll.workingDaysSource': 'NOT_IMPLEMENTED',
  'payroll.ytdRecalculationEnabled': 'NOT_IMPLEMENTED',
  'payroll.retroactiveCalculationEnabled': 'NOT_IMPLEMENTED',
  'payroll.manualAdjustmentAllowed': 'NOT_IMPLEMENTED',
  'payroll.calculationPrecision': 'NOT_IMPLEMENTED',
  'payroll.allocationSource': 'NOT_IMPLEMENTED',
  'payroll.projectCostPostingBehavior': 'NOT_IMPLEMENTED',
  'payroll.bankPaymentFileFormat': 'NOT_IMPLEMENTED',
  'payroll.paymentReferenceFormat': 'NOT_IMPLEMENTED',
  'payroll.publishPayslipAfterApproval': 'NOT_IMPLEMENTED',
  'payroll.payslipPasswordProtection': 'NOT_IMPLEMENTED',
  'payroll.requireEmployeePayslipAcknowledgment': 'NOT_IMPLEMENTED',
  'payroll.reopeningPermission': 'NOT_IMPLEMENTED',
  'payroll.reversalRequirement': 'NOT_IMPLEMENTED',
  'payroll.enableGlPosting': 'NOT_IMPLEMENTED',
  'payroll.postingDateSource': 'NOT_IMPLEMENTED',
  'payroll.journalGrouping': 'NOT_IMPLEMENTED',
  'payroll.journalExportFormat': 'NOT_IMPLEMENTED',
  'payroll.autoPostAfterApproval': 'NOT_IMPLEMENTED',
  'payroll.requireBalancedJournal': 'NOT_IMPLEMENTED',
  'payroll.allowReversalPosting': 'NOT_IMPLEMENTED',

  // recruitment (28)
  'recruitment.defaultCandidateNumberRuleId': 'NOT_IMPLEMENTED',
  'recruitment.defaultCandidateSourceId': 'NOT_IMPLEMENTED',
  'recruitment.candidateRetentionPolicyId': 'NOT_IMPLEMENTED',
  'recruitment.duplicateCandidateDetection': 'NOT_IMPLEMENTED',
  'recruitment.duplicateMatchingStrategy': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyParseSkillsAndExperience': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyCreateCandidateAfterCvUpload': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyMoveRejectedCandidatesToTalentPool':
    'NOT_IMPLEMENTED',
  'recruitment.defaultOnboardingPlanId': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyActivateEmployeeAfterSuccessfulOnboarding':
    'NOT_IMPLEMENTED',
  'recruitment.defaultRecruiterAssignmentRuleId': 'NOT_IMPLEMENTED',
  'recruitment.defaultHiringManagerAssignmentRuleId': 'NOT_IMPLEMENTED',
  'recruitment.defaultInterviewPanelRuleId': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyStartOnboardingAfterHiring': 'NOT_IMPLEMENTED',
  'recruitment.requireMandatoryOnboardingTasksBeforeActivation':
    'NOT_IMPLEMENTED',
  'recruitment.requireOfferApprovalBeforeHiring': 'NOT_IMPLEMENTED',
  'recruitment.requireBackgroundVerificationBeforeHiring': 'NOT_IMPLEMENTED',
  'recruitment.requireDocumentVerificationBeforeEmployeeActivation':
    'NOT_IMPLEMENTED',
  'recruitment.candidateDocumentChecklistId': 'NOT_IMPLEMENTED',
  'recruitment.mandatoryEmployeeDocumentChecklistId': 'NOT_IMPLEMENTED',
  'recruitment.defaultCandidateEmailTemplateId': 'NOT_IMPLEMENTED',
  'recruitment.defaultOfferLetterTemplateId': 'NOT_IMPLEMENTED',
  'recruitment.defaultRejectionEmailTemplateId': 'NOT_IMPLEMENTED',
  'recruitment.defaultWelcomeEmailTemplateId': 'NOT_IMPLEMENTED',
  'recruitment.automaticallyCloseJobOpeningWhenPositionsFilled':
    'NOT_IMPLEMENTED',
  'recruitment.automaticallyScheduleOnboardingTasks': 'NOT_IMPLEMENTED',
  'recruitment.notifyHiringManagerWhenCandidateHired': 'NOT_IMPLEMENTED',
  'recruitment.notifyEmployeeWhenOnboardingStarts': 'NOT_IMPLEMENTED',

  // documents (7)
  'documents.compressionEnabled': 'NOT_IMPLEMENTED',
  'documents.encryptDocuments': 'NOT_IMPLEMENTED',
  'documents.watermarkDownloads': 'NOT_IMPLEMENTED',
  'documents.requireOwner': 'NOT_IMPLEMENTED',
  'documents.requireExpiryDate': 'NOT_IMPLEMENTED',
  'documents.requireEffectiveDate': 'NOT_IMPLEMENTED',
  'documents.requireClassification': 'NOT_IMPLEMENTED',

  // branding (10)
  'branding.brandDescription': 'NOT_IMPLEMENTED',
  'branding.hrContactEmail': 'NOT_IMPLEMENTED',
  'branding.helpCenterUrl': 'NOT_IMPLEMENTED',
  'branding.officeAddress': 'NOT_IMPLEMENTED',
  'branding.emailSenderName': 'NOT_IMPLEMENTED',
  'branding.emailFooterText': 'NOT_IMPLEMENTED',
  'branding.showLogoInEmails': 'NOT_IMPLEMENTED',
  'branding.showBrandingInReports': 'NOT_IMPLEMENTED',
  'branding.showCompanyNameInBrowserTitle': 'NOT_IMPLEMENTED',
  'branding.enableWhiteLabelSupportDetails': 'NOT_IMPLEMENTED',

  // notifications (15)
  'notifications.instantApprovalRequestEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.approvalDecisionEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.escalationReminderEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.newJoinerAnnouncementEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.profileCompletionReminderEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.documentExpiryReminderEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.lateCheckInAlertEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.leaveRequestNotificationEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.attendanceRegularizationEnabled': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.digestFrequency': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.maxReminderAttempts': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.notifyReportingManagersOnly': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.notifyHrTeamForEmployeeChanges': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.notifyEmployeesDirectly': 'DUPLICATE_OF_DOMAIN_MODEL',
  'notifications.showNotificationPreviewInApp': 'DUPLICATE_OF_DOMAIN_MODEL',

  // security (7)
  'security.requireEmailVerification': 'NOT_IMPLEMENTED',
  'security.invitationExpiryHours': 'DUPLICATE_OF_DOMAIN_MODEL',
  'security.allowInvitationResend': 'NOT_IMPLEMENTED',
  'security.passwordSetupRequiredBeforeFirstLogin': 'NOT_IMPLEMENTED',
  'security.mfaRequired': 'NOT_IMPLEMENTED',
  'security.mfaMethod': 'NOT_IMPLEMENTED',
  'security.rememberTrustedDevice': 'NOT_IMPLEMENTED',
});

/**
 * Inert keys whose editable control is still rendered.
 *
 * Only `DEFERRED_ATTENDANCE_WORK` qualifies, and only until that work lands.
 * The coverage spec allows a control for these and for nothing else.
 */
export const INERT_KEYS_WITH_PENDING_UI_REMOVAL: readonly string[] =
  Object.freeze(
    Object.keys(INERT_TENANT_SETTING_KEYS).filter(
      (id) => INERT_TENANT_SETTING_KEYS[id] === 'DEFERRED_ATTENDANCE_WORK',
    ),
  );

/** True when the catalog declares this key but nothing reads it. */
export function isInertTenantSettingKey(
  category: string,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    INERT_TENANT_SETTING_KEYS,
    `${category}.${key}`,
  );
}

/**
 * The inert keys a tenant can still see and set, grouped for the API contract.
 *
 * `GET /tenant-settings` carries this so a client is told which of the keys in
 * its response the platform does not honour. That is the half of BUG-1974's
 * acceptance criteria that deleting the keys would have satisfied by removing
 * them; keeping them and saying so preserves compatibility for the tenants that
 * already stored values.
 */
export function describeInertTenantSettingKeys(): Array<{
  category: string;
  key: string;
  reason: InertReasonCode;
  description: string;
}> {
  return Object.entries(INERT_TENANT_SETTING_KEYS)
    .map(([id, reason]) => {
      const separator = id.indexOf('.');
      const category = id.slice(0, separator);
      const key = id.slice(separator + 1);
      return {
        category,
        key,
        reason,
        description: INERT_REASONS[reason],
      };
    })
    .filter(
      (entry) =>
        // Defensive: an entry naming a key the catalog no longer declares is a
        // stale line, and reporting it would advertise a key that does not
        // exist. The coverage spec fails on one; this keeps the response honest
        // in the meantime.
        DEFAULT_TENANT_SETTINGS[
          entry.category as keyof typeof DEFAULT_TENANT_SETTINGS
        ]?.[entry.key] !== undefined,
    );
}
