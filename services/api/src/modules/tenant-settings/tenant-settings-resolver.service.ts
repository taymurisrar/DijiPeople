import { Injectable, Logger } from '@nestjs/common';
import { AttendanceMode, Prisma, WorkWeekday } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DEFAULT_TENANT_SETTINGS,
  TenantSettingCategory,
} from './tenant-settings.catalog';
import { TenantSettingsRepository } from './tenant-settings.repository';

type SettingsMap = Record<string, Record<string, unknown>>;

type CachedSettings = {
  expiresAt: number;
  value: SettingsMap;
};

export type EmployeeSettingsResolved = {
  employeeIdPrefix: string;
  employeeIdSequenceLength: number;
  autoGenerateEmployeeId: boolean;
  defaultEmploymentType: string;
  defaultWorkMode: string;
  defaultEmployeeStatus: string;
  requirePersonalEmail: boolean;
  requireEmergencyContact: boolean;
  requireJoiningDate: boolean;
  requireDepartment: boolean;
  requireDesignation: boolean;
  requireReportingManager: boolean;
  requireWorkLocation: boolean;
  autoCreateDraftOnHire: boolean;
  keepEmployeeAsDraftUntilOnboardingComplete: boolean;
  preventActivationUntilMandatoryFieldsCompleted: boolean;
  maxReportingLevels: number;
  allowSkipLevelApprovals: boolean;
  allowMatrixReporting: boolean;
  allowEmployeeWithoutManager: boolean;
  preventDuplicateByPersonalEmail: boolean;
  preventDuplicateByPhoneNumber: boolean;
  preventDuplicateByNationalId: boolean;
  warnOnPossibleDuplicate: boolean;
  onboardingChecklistTemplate: string;
};

export type OrganizationSettingsResolved = {
  companyDisplayName: string;
  legalBusinessName: string;
  industry: string;
  businessEmail: string;
  businessPhone: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  weekStartsOn: WorkWeekday;
};

export type AttendanceSettingsResolved = {
  defaultGraceMinutes: number;
  allowManualAdjustments: boolean;
  autoCheckOutEnabled: boolean;
  trackMissedCheckOut: boolean;
  allowedModes: AttendanceMode[];
  enforceOfficeLocationForOfficeMode: boolean;
  requireRemoteLocationCapture: boolean;
  locationCaptureRequired: boolean;
  locationRequiredForModes: AttendanceMode[];
  allowIpFallback: boolean;
  allowManualLocationException: boolean;
  locationTimeoutSeconds: number;
  locationRetryAttempts: number;
  highAccuracyLocation: boolean;
  maxAllowedAccuracyMeters: number | null;
  captureLocationOnCheckIn: boolean;
  captureLocationOnCheckOut: boolean;
  storeIpAddress: boolean;
  storeUserAgent: boolean;
  standardWorkHoursPerDay: number;
};

export type TimesheetSettingsResolved = {
  timesheetPeriodType: 'monthly' | 'weekly' | 'biweekly';
  weekendDays: WorkWeekday[];
  defaultWorkHours: number;
  defaultHoursForOnWork: number;
  allowWeekendWork: boolean;
  allowHolidayWork: boolean;
  requireMonthlySubmission: boolean;
  requireMONTHLYSubmission: boolean;
  autoFillWorkingDays: boolean;
  requireAllDaysCompletedBeforeSubmit: boolean;
  requireSubmissionNote: boolean;
  allowBulkImport: boolean;
  allowEmployeeSelfImport: boolean;
  allowManagerImportForTeam: boolean;
  requireApprovalBeforePayroll: boolean;
  exportTemplateFormat: 'CSV' | 'XLSX';
  lockTimesheetAfterApproval: boolean;
  allowRejectedTimesheetResubmission: boolean;
  largeExportRowThreshold: number;
  exportRetentionDays: number;
};

export type PayrollSettingsResolved = {
  payFrequency: string;
  payrollStatus: string;
  defaultPayrollGroup: string;
  defaultPaymentMode: string;
  compensationReviewCycle: string;
  defaultCurrency: string;
  defaultPayrollRegionId: string;
  baseReportingCurrency: string;
  payrollBankAccountAction: 'IGNORE' | 'WARN' | 'BLOCK';
  negativeNetPayAction: 'IGNORE' | 'WARN' | 'BLOCK';
  defaultPayrollCurrencySource:
    | 'TENANT_DEFAULT'
    | 'PAYROLL_REGION'
    | 'EMPLOYEE_COMPENSATION';
  allowMultiCurrencyPayroll: boolean;
  exchangeRateSource: 'MANUAL' | 'PROVIDER';
  exchangeRateLockPoint:
    | 'PAYROLL_RUN_CREATION'
    | 'PAYROLL_APPROVAL'
    | 'PAYMENT_DATE';
  payrollGenerationSource: 'ATTENDANCE' | 'TIMESHEETS' | 'HYBRID' | 'MANUAL';
  requireApprovedTimesheetsForPayroll: boolean;
  requireApprovedAttendanceForPayroll: boolean;
  requireApprovedLeavesForPayroll: boolean;
  requireEmployeePayrollBankAccount: boolean;
  requireEmployeeProjectAllocation: boolean;
  underAllocationAction: 'WARN' | 'BLOCK' | 'ALLOCATE_TO_BENCH';
  overAllocationAction: 'WARN' | 'BLOCK';
  defaultBenchCostCenterId: string;
  includeLeavesInPayrollSummary: boolean;
  includeHolidaysInPayrollSummary: boolean;
  includeWeekendWorkInPayrollSummary: boolean;
  defaultPayrollCycleDay: number;
  allowDraftPayrollAdjustments: boolean;
  payrollExportFormat: 'CSV' | 'XLSX';
  requirePayrollApproval: boolean;
  lockAfterApproval: boolean;
  allowPayrollRegeneration: boolean;
  payslipFormat: 'PDF';
  emailPayslipOnPublish: boolean;
};

export type RecruitmentSettingsResolved = {
  defaultRecruitmentPipelineId: string;
  onboardingWorkflow: string;
  autoCreateEmployeeFromCandidate: boolean;
  onboardingChecklistTemplate: string;
  keepEmployeeAsDraftUntilOnboardingComplete: boolean;
  preventEmployeeActivationUntilMandatoryFieldsCompleted: boolean;
  resumeParsingEnabled: boolean;
};

export type DocumentSettingsResolved = {
  maxUploadSizeMb: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
  allowedMimeTypes: string[];
  virusScanRequired: boolean;
  allowMultipleFilesPerRecord: boolean;
  maximumFilesPerRecord: number;
  archiveAfterMonths: number;
  storageProvider: string;
  retentionPolicy: string;
  deleteAfterYears: number;
  versioningEnabled: boolean;
  maximumVersions: number;
  requireDocumentCategories: boolean;
  requireDescription: boolean;
  requireDocumentNumber: boolean;
  auditDownloads: boolean;
  disableExternalDownloads: boolean;
  allowDuplicateFile: boolean;
  duplicateDetectionStrategy: string;
  requireExpiryForExpirableCategories: boolean;
  blockExpiredDocuments: boolean;
  warnBeforeExpiryDays: number;
};

export type NotificationSettingsResolved = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  browserPushEnabled: boolean;
  digestEnabled: boolean;
  approvalDigestEnabled: boolean;
  onboardingReminderEnabled: boolean;
  timesheetReminderEnabled: boolean;
  leaveDecisionEmailEnabled: boolean;
  defaultReminderLeadDays: number;
  quietHoursEnabled: boolean;
  quietHoursWindow: string;
};

export type BrandingSettingsResolved = {
  appTitle: string;
  brandName: string;
  shortBrandName: string;
  legalCompanyName: string;
  logoUrl: string;
  squareLogoUrl: string;
  faviconUrl: string;
  loginBannerImageUrl: string;
  emailHeaderLogoUrl: string;
  portalTagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  sidebarBackgroundColor: string;
  sidebarTextColor: string;
  sidebarActiveBackgroundColor: string;
  sidebarActiveTextColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  infoColor: string;
  fontFamily: string;
  themeMode: string;
  density: string;
  radius: string;
  shadow: string;
  navigationLayout: string;
  appBackgroundColor: string;
  appSurfaceColor: string;
  pageGradientStartColor: string;
  pageGradientEndColor: string;
  cardGradientStartColor: string;
  cardGradientEndColor: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  footerText: string;
  employeePortalMessage: string;
  dashboardGreeting: string;
  sidebarStyle: string;
  defaultThemeMode: string;
  supportEmail: string;
  supportPhone: string;
  privacyPolicyUrl: string;
  termsOfUseUrl: string;
  websiteUrl: string;
  showBrandingOnLoginPage: boolean;
  showBrandingInEmployeePortal: boolean;
};

export type SystemSettingsResolved = {
  dateFormat: string;
  timeFormat: string;
  locale: string;
  uiDensity: string;
  defaultThemeMode: string;
  defaultDashboardView: string;
  defaultLandingModule: string;
  defaultWeekStartDay: WorkWeekday;
  defaultRecordsPerPage: number;
  enableStickyFilters: boolean;
  defaultTimezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  autoLogoutMinutes: number;
  showHelpTips: boolean;
};

export type SecuritySettingsResolved = {
  allowRememberMe: boolean;
  sessionTimeoutMinutes: number;
  refreshTokenExpiryDays: number;
  absoluteSessionLifetimeDays: number;
  idleTimeoutMinutes: number;
};

export type PublicBrandingResolved = {
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string;
  appTitle: string;
  brandName: string;
  shortBrandName: string;
  logoUrl: string;
  faviconUrl: string;
  loginBannerImageUrl: string;
  squareLogoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  sidebarBackgroundColor: string;
  sidebarTextColor: string;
  sidebarActiveBackgroundColor: string;
  sidebarActiveTextColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  infoColor: string;
  fontFamily: string;
  themeMode: string;
  density: string;
  radius: string;
  shadow: string;
  navigationLayout: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  footerText: string;
  supportEmail: string;
  supportPhone: string;
  privacyPolicyUrl: string;
  termsOfUseUrl: string;
  portalTagline: string;
  dashboardGreeting: string;
  employeePortalMessage: string;
  showBrandingOnLoginPage: boolean;
};

@Injectable()
export class TenantSettingsResolverService {
  private readonly logger = new Logger(TenantSettingsResolverService.name);
  private databaseUnavailableWarningLogged = false;

  private readonly cache = new Map<string, CachedSettings>();

  constructor(
    private readonly tenantSettingsRepository: TenantSettingsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getOrganizationSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<OrganizationSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.organization ?? {};
    const weekStart = stringValue(category.weekStartsOn, 'MONDAY');

    return {
      companyDisplayName: stringValue(category.companyDisplayName, ''),
      legalBusinessName: stringValue(category.legalBusinessName, ''),
      industry: stringValue(category.industry, ''),
      businessEmail: stringValue(category.businessEmail, ''),
      businessPhone: stringValue(category.businessPhone, ''),
      timezone: stringValue(category.timezone, 'UTC'),
      currency: stringValue(category.currency, 'USD'),
      dateFormat: stringValue(category.dateFormat, 'MM/dd/yyyy'),
      timeFormat: stringValue(category.timeFormat, '12h'),
      weekStartsOn: Object.values(WorkWeekday).includes(
        weekStart as WorkWeekday,
      )
        ? (weekStart as WorkWeekday)
        : WorkWeekday.MONDAY,
    };
  }

  async getEmployeeSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<EmployeeSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.employees ?? {};

    return {
      employeeIdPrefix: stringValue(category.employeeIdPrefix, 'EMP'),
      employeeIdSequenceLength: numberValue(
        category.employeeIdSequenceLength,
        4,
        1,
        10,
      ),
      autoGenerateEmployeeId: booleanValue(
        category.autoGenerateEmployeeId,
        true,
      ),
      defaultEmploymentType: stringValue(
        category.defaultEmploymentType,
        'FULL_TIME',
      ),
      defaultWorkMode: stringValue(category.defaultWorkMode, 'OFFICE'),
      defaultEmployeeStatus: stringValue(
        category.defaultEmployeeStatus,
        'ACTIVE',
      ),
      requirePersonalEmail: booleanValue(category.requirePersonalEmail, false),
      requireEmergencyContact: booleanValue(
        category.requireEmergencyContact,
        true,
      ),
      requireJoiningDate: booleanValue(category.requireJoiningDate, true),
      requireDepartment: booleanValue(category.requireDepartment, false),
      requireDesignation: booleanValue(category.requireDesignation, false),
      requireReportingManager: booleanValue(
        category.requireReportingManager,
        false,
      ),
      requireWorkLocation: booleanValue(category.requireWorkLocation, false),
      autoCreateDraftOnHire: booleanValue(category.autoCreateDraftOnHire, true),
      keepEmployeeAsDraftUntilOnboardingComplete: booleanValue(
        category.keepEmployeeAsDraftUntilOnboardingComplete,
        true,
      ),
      preventActivationUntilMandatoryFieldsCompleted: booleanValue(
        category.preventActivationUntilMandatoryFieldsCompleted,
        true,
      ),
      maxReportingLevels: numberValue(category.maxReportingLevels, 5, 1, 20),
      allowSkipLevelApprovals: booleanValue(
        category.allowSkipLevelApprovals,
        false,
      ),
      allowMatrixReporting: booleanValue(category.allowMatrixReporting, false),
      allowEmployeeWithoutManager: booleanValue(
        category.allowEmployeeWithoutManager,
        true,
      ),
      preventDuplicateByPersonalEmail: booleanValue(
        category.preventDuplicateByPersonalEmail,
        true,
      ),
      preventDuplicateByPhoneNumber: booleanValue(
        category.preventDuplicateByPhoneNumber,
        false,
      ),
      preventDuplicateByNationalId: booleanValue(
        category.preventDuplicateByNationalId,
        false,
      ),
      warnOnPossibleDuplicate: booleanValue(
        category.warnOnPossibleDuplicate,
        true,
      ),
      onboardingChecklistTemplate: stringValue(
        category.onboardingChecklistTemplate,
        'standard',
      ),
    };
  }

  async getAttendanceSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<AttendanceSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.attendance ?? {};
    const modes = csvValues(category.allowedModes).filter(
      (value): value is AttendanceMode =>
        Object.values(AttendanceMode).includes(value as AttendanceMode),
    );
    const locationRequiredModes = csvValues(
      category.locationRequiredForModes,
    ).filter((value): value is AttendanceMode =>
      Object.values(AttendanceMode).includes(value as AttendanceMode),
    );
    const requireRemoteLocationCapture = booleanValue(
      category.requireRemoteLocationCapture,
      false,
    );
    const locationCaptureRequired = booleanValue(
      category.locationCaptureRequired,
      requireRemoteLocationCapture,
    );

    return {
      defaultGraceMinutes: numberValue(
        category.defaultGraceMinutes,
        10,
        0,
        180,
      ),
      allowManualAdjustments: booleanValue(
        category.allowManualAdjustments,
        true,
      ),
      autoCheckOutEnabled: booleanValue(category.autoCheckOutEnabled, false),
      trackMissedCheckOut: booleanValue(category.trackMissedCheckOut, true),
      allowedModes:
        modes.length > 0
          ? modes
          : [AttendanceMode.OFFICE, AttendanceMode.REMOTE],
      enforceOfficeLocationForOfficeMode: booleanValue(
        category.enforceOfficeLocationForOfficeMode,
        true,
      ),
      requireRemoteLocationCapture: booleanValue(
        category.requireRemoteLocationCapture,
        false,
      ),
      locationCaptureRequired,
      locationRequiredForModes:
        locationRequiredModes.length > 0
          ? locationRequiredModes
          : requireRemoteLocationCapture || locationCaptureRequired
            ? [AttendanceMode.REMOTE, AttendanceMode.HYBRID]
            : [],
      allowIpFallback: booleanValue(category.allowIpFallback, false),
      allowManualLocationException: booleanValue(
        category.allowManualLocationException,
        false,
      ),
      locationTimeoutSeconds: numberValue(
        category.locationTimeoutSeconds,
        15,
        1,
        120,
      ),
      locationRetryAttempts: numberValue(
        category.locationRetryAttempts,
        2,
        0,
        3,
      ),
      highAccuracyLocation: booleanValue(category.highAccuracyLocation, true),
      maxAllowedAccuracyMeters:
        category.maxAllowedAccuracyMeters === null ||
        category.maxAllowedAccuracyMeters === undefined ||
        category.maxAllowedAccuracyMeters === ''
          ? null
          : numberValue(category.maxAllowedAccuracyMeters, 0, 0, 100000),
      captureLocationOnCheckIn: booleanValue(
        category.captureLocationOnCheckIn,
        locationCaptureRequired,
      ),
      captureLocationOnCheckOut: booleanValue(
        category.captureLocationOnCheckOut,
        locationCaptureRequired,
      ),
      storeIpAddress: booleanValue(category.storeIpAddress, false),
      storeUserAgent: booleanValue(category.storeUserAgent, false),
      standardWorkHoursPerDay: numberValue(
        category.standardWorkHoursPerDay,
        8,
        1,
        24,
      ),
    };
  }

  async getTimesheetSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<TimesheetSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    return this.resolveTimesheetSettings(source.timesheets ?? {});
  }

  async getTimesheetSettingsForBusinessUnit(
    tenantId: string,
    businessUnitId?: string | null,
    organizationId?: string,
  ): Promise<TimesheetSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const overrides = await this.getBusinessUnitCategorySettings(
      tenantId,
      businessUnitId,
      'timesheets',
    );

    return this.resolveTimesheetSettings({
      ...(source.timesheets ?? {}),
      ...overrides,
    });
  }

  private resolveTimesheetSettings(
    category: Record<string, unknown>,
  ): TimesheetSettingsResolved {
    const periodType = enumStringValue(
      category.timesheetPeriodType,
      ['monthly', 'weekly', 'biweekly'] as const,
      'monthly',
    );
    const weekendDays = csvValues(category.weekendDays).filter(
      (value): value is WorkWeekday =>
        Object.values(WorkWeekday).includes(value as WorkWeekday),
    );
    const defaultWorkHours = numberValue(category.defaultWorkHours, 8, 1, 24);
    const requireMonthlySubmission = booleanValue(
      category.requireMonthlySubmission ?? category.requireMONTHLYSubmission,
      true,
    );

    return {
      timesheetPeriodType: periodType,
      weekendDays:
        weekendDays.length > 0
          ? weekendDays
          : [WorkWeekday.SATURDAY, WorkWeekday.SUNDAY],
      defaultWorkHours,
      defaultHoursForOnWork: numberValue(
        category.defaultHoursForOnWork,
        defaultWorkHours,
        1,
        24,
      ),
      allowWeekendWork: booleanValue(category.allowWeekendWork, true),
      allowHolidayWork: booleanValue(category.allowHolidayWork, true),
      requireMonthlySubmission,
      requireMONTHLYSubmission: requireMonthlySubmission,
      autoFillWorkingDays: booleanValue(category.autoFillWorkingDays, false),
      requireAllDaysCompletedBeforeSubmit: booleanValue(
        category.requireAllDaysCompletedBeforeSubmit,
        true,
      ),
      requireSubmissionNote: booleanValue(
        category.requireSubmissionNote,
        false,
      ),
      allowBulkImport: booleanValue(category.allowBulkImport, true),
      allowEmployeeSelfImport: booleanValue(
        category.allowEmployeeSelfImport,
        false,
      ),
      allowManagerImportForTeam: booleanValue(
        category.allowManagerImportForTeam,
        true,
      ),
      requireApprovalBeforePayroll: booleanValue(
        category.requireApprovalBeforePayroll,
        true,
      ),
      exportTemplateFormat: enumStringValue(
        category.exportTemplateFormat,
        ['CSV', 'XLSX'] as const,
        'CSV',
      ),
      lockTimesheetAfterApproval: booleanValue(
        category.lockTimesheetAfterApproval,
        true,
      ),
      allowRejectedTimesheetResubmission: booleanValue(
        category.allowRejectedTimesheetResubmission,
        true,
      ),
      largeExportRowThreshold: numberValue(
        category.largeExportRowThreshold,
        5000,
        100,
        1000000,
      ),
      exportRetentionDays: numberValue(category.exportRetentionDays, 7, 1, 365),
    };
  }

  async getPayrollSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<PayrollSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    return this.resolvePayrollSettings(source.payroll ?? {});
  }

  async getPayrollSettingsForBusinessUnit(
    tenantId: string,
    businessUnitId?: string | null,
    organizationId?: string,
  ): Promise<PayrollSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const overrides = await this.getBusinessUnitCategorySettings(
      tenantId,
      businessUnitId,
      'payroll',
    );

    return this.resolvePayrollSettings({
      ...(source.payroll ?? {}),
      ...overrides,
    });
  }

  private resolvePayrollSettings(
    category: Record<string, unknown>,
  ): PayrollSettingsResolved {
    return {
      payFrequency: stringValue(category.payFrequency, 'MONTHLY'),
      payrollStatus: stringValue(category.payrollStatus, 'ACTIVE'),
      defaultPayrollGroup: stringValue(category.defaultPayrollGroup, 'main'),
      defaultPaymentMode: stringValue(
        category.defaultPaymentMode,
        'BANK_TRANSFER',
      ),
      compensationReviewCycle: stringValue(
        category.compensationReviewCycle,
        'ANNUAL',
      ),
      defaultCurrency: stringValue(category.defaultCurrency, 'USD'),
      defaultPayrollRegionId: stringValue(category.defaultPayrollRegionId, ''),
      baseReportingCurrency: stringValue(
        category.baseReportingCurrency,
        stringValue(category.defaultCurrency, 'USD'),
      ),
      payrollBankAccountAction: enumStringValue(
        category.payrollBankAccountAction,
        ['IGNORE', 'WARN', 'BLOCK'] as const,
        booleanValue(category.requireEmployeePayrollBankAccount, false)
          ? 'BLOCK'
          : 'WARN',
      ),
      negativeNetPayAction: enumStringValue(
        category.negativeNetPayAction,
        ['IGNORE', 'WARN', 'BLOCK'] as const,
        'BLOCK',
      ),
      defaultPayrollCurrencySource: enumStringValue(
        category.defaultPayrollCurrencySource,
        ['TENANT_DEFAULT', 'PAYROLL_REGION', 'EMPLOYEE_COMPENSATION'] as const,
        'TENANT_DEFAULT',
      ),
      allowMultiCurrencyPayroll: booleanValue(
        category.allowMultiCurrencyPayroll,
        false,
      ),
      exchangeRateSource: enumStringValue(
        category.exchangeRateSource,
        ['MANUAL', 'PROVIDER'] as const,
        'MANUAL',
      ),
      exchangeRateLockPoint: enumStringValue(
        category.exchangeRateLockPoint,
        ['PAYROLL_RUN_CREATION', 'PAYROLL_APPROVAL', 'PAYMENT_DATE'] as const,
        'PAYROLL_RUN_CREATION',
      ),
      payrollGenerationSource: enumStringValue(
        category.payrollGenerationSource,
        ['ATTENDANCE', 'TIMESHEETS', 'HYBRID', 'MANUAL'] as const,
        'ATTENDANCE',
      ),
      requireApprovedTimesheetsForPayroll: booleanValue(
        category.requireApprovedTimesheetsForPayroll,
        true,
      ),
      requireApprovedAttendanceForPayroll: booleanValue(
        category.requireApprovedAttendanceForPayroll,
        true,
      ),
      requireApprovedLeavesForPayroll: booleanValue(
        category.requireApprovedLeavesForPayroll,
        true,
      ),
      requireEmployeePayrollBankAccount: booleanValue(
        category.requireEmployeePayrollBankAccount,
        false,
      ),
      requireEmployeeProjectAllocation: booleanValue(
        category.requireEmployeeProjectAllocation,
        false,
      ),
      underAllocationAction: enumStringValue(
        category.underAllocationAction,
        ['WARN', 'BLOCK', 'ALLOCATE_TO_BENCH'] as const,
        'WARN',
      ),
      overAllocationAction: enumStringValue(
        category.overAllocationAction,
        ['WARN', 'BLOCK'] as const,
        'WARN',
      ),
      defaultBenchCostCenterId: stringValue(
        category.defaultBenchCostCenterId,
        '',
      ),
      includeLeavesInPayrollSummary: booleanValue(
        category.includeLeavesInPayrollSummary,
        true,
      ),
      includeHolidaysInPayrollSummary: booleanValue(
        category.includeHolidaysInPayrollSummary,
        true,
      ),
      includeWeekendWorkInPayrollSummary: booleanValue(
        category.includeWeekendWorkInPayrollSummary,
        true,
      ),
      defaultPayrollCycleDay: numberValue(
        category.defaultPayrollCycleDay,
        25,
        1,
        31,
      ),
      allowDraftPayrollAdjustments: booleanValue(
        category.allowDraftPayrollAdjustments,
        true,
      ),
      payrollExportFormat: enumStringValue(
        category.payrollExportFormat,
        ['CSV', 'XLSX'] as const,
        'CSV',
      ),
      requirePayrollApproval: booleanValue(
        category.requirePayrollApproval,
        true,
      ),
      lockAfterApproval: booleanValue(category.lockAfterApproval, true),
      allowPayrollRegeneration: booleanValue(
        category.allowPayrollRegeneration,
        false,
      ),
      payslipFormat: enumStringValue(
        category.payslipFormat,
        ['PDF'] as const,
        'PDF',
      ),
      emailPayslipOnPublish: booleanValue(
        category.emailPayslipOnPublish,
        false,
      ),
    };
  }

  async getRecruitmentSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<RecruitmentSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.recruitment ?? {};

    return {
      defaultRecruitmentPipelineId: stringValue(
        category.defaultRecruitmentPipelineId,
        '',
      ),
      onboardingWorkflow: stringValue(category.onboardingWorkflow, 'standard'),
      autoCreateEmployeeFromCandidate: booleanValue(
        category.autoCreateEmployeeFromCandidate,
        true,
      ),
      onboardingChecklistTemplate: stringValue(
        category.onboardingChecklistTemplate,
        'standard',
      ),
      keepEmployeeAsDraftUntilOnboardingComplete: booleanValue(
        category.keepEmployeeAsDraftUntilOnboardingComplete,
        true,
      ),
      preventEmployeeActivationUntilMandatoryFieldsCompleted: booleanValue(
        category.preventEmployeeActivationUntilMandatoryFieldsCompleted,
        true,
      ),
      resumeParsingEnabled: booleanValue(category.resumeParsingEnabled, true),
    };
  }

  async getDocumentSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<DocumentSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.documents ?? {};

    return {
      maxUploadSizeMb: numberValue(category.maxUploadSizeMb, 10, 1, 200),
      allowedExtensions: csvValues(category.allowedExtensions),
      blockedExtensions: csvValues(category.blockedExtensions),
      allowedMimeTypes: csvValues(category.allowedMimeTypes).map((item) =>
        item.toLowerCase(),
      ),
      virusScanRequired: booleanValue(category.virusScanRequired, false),
      allowMultipleFilesPerRecord: booleanValue(
        category.allowMultipleFilesPerRecord,
        true,
      ),
      maximumFilesPerRecord: numberValue(
        category.maximumFilesPerRecord,
        10,
        1,
        100,
      ),
      archiveAfterMonths: numberValue(category.archiveAfterMonths, 24, 1, 1200),
      storageProvider: stringValue(category.storageProvider, 'INTERNAL'),
      retentionPolicy: stringValue(category.retentionPolicy, 'ARCHIVE_ONLY'),
      deleteAfterYears: numberValue(category.deleteAfterYears, 7, 1, 100),
      versioningEnabled: booleanValue(category.versioningEnabled, true),
      maximumVersions: numberValue(category.maximumVersions, 10, 1, 100),
      requireDocumentCategories: booleanValue(
        category.requireDocumentCategories,
        true,
      ),
      requireDescription: booleanValue(category.requireDescription, false),
      requireDocumentNumber: booleanValue(
        category.requireDocumentNumber,
        false,
      ),
      auditDownloads: booleanValue(category.auditDownloads, true),
      disableExternalDownloads: booleanValue(
        category.disableExternalDownloads,
        false,
      ),
      allowDuplicateFile: booleanValue(category.allowDuplicateFile, true),
      duplicateDetectionStrategy: stringValue(
        category.duplicateDetectionStrategy,
        'FILE_HASH_RECORD',
      ),
      requireExpiryForExpirableCategories: booleanValue(
        category.requireExpiryForExpirableCategories,
        true,
      ),
      blockExpiredDocuments: booleanValue(
        category.blockExpiredDocuments,
        false,
      ),
      warnBeforeExpiryDays: numberValue(
        category.warnBeforeExpiryDays,
        30,
        0,
        3650,
      ),
    };
  }

  async getNotificationSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<NotificationSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.notifications ?? {};

    return {
      inAppEnabled: booleanValue(category.inAppEnabled, true),
      emailEnabled: booleanValue(category.emailEnabled, true),
      browserPushEnabled: booleanValue(category.browserPushEnabled, false),
      digestEnabled: booleanValue(category.digestEnabled, true),
      approvalDigestEnabled: booleanValue(category.approvalDigestEnabled, true),
      onboardingReminderEnabled: booleanValue(
        category.onboardingReminderEnabled,
        true,
      ),
      timesheetReminderEnabled: booleanValue(
        category.timesheetReminderEnabled,
        true,
      ),
      leaveDecisionEmailEnabled: booleanValue(
        category.leaveDecisionEmailEnabled,
        true,
      ),
      defaultReminderLeadDays: numberValue(
        category.defaultReminderLeadDays,
        2,
        0,
        30,
      ),
      quietHoursEnabled: booleanValue(category.quietHoursEnabled, false),
      quietHoursWindow: stringValue(category.quietHoursWindow, '22:00-07:00'),
    };
  }

  async getBrandingSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<BrandingSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.branding ?? {};

    return {
      appTitle: stringValue(category.appTitle, 'DijiPeople'),
      brandName: stringValue(category.brandName, 'DijiPeople'),
      shortBrandName: stringValue(category.shortBrandName, ''),
      legalCompanyName: stringValue(category.legalCompanyName, ''),
      logoUrl: stringValue(category.logoUrl, ''),
      squareLogoUrl: stringValue(category.squareLogoUrl, ''),
      faviconUrl: stringValue(category.faviconUrl, ''),
      loginBannerImageUrl: stringValue(category.loginBannerImageUrl, ''),
      emailHeaderLogoUrl: stringValue(category.emailHeaderLogoUrl, ''),
      portalTagline: stringValue(category.portalTagline, ''),
      primaryColor: stringValue(category.primaryColor, '#0f766e'),
      secondaryColor: stringValue(category.secondaryColor, '#115e59'),
      accentColor: stringValue(category.accentColor, '#14b8a6'),
      backgroundColor: stringValue(category.backgroundColor, '#f8fafc'),
      surfaceColor: stringValue(category.surfaceColor, '#ffffff'),
      textColor: stringValue(category.textColor, '#0f172a'),
      mutedTextColor: stringValue(category.mutedTextColor, '#64748b'),
      borderColor: stringValue(category.borderColor, '#e2e8f0'),
      sidebarBackgroundColor: stringValue(
        category.sidebarBackgroundColor,
        '#0f172a',
      ),
      sidebarTextColor: stringValue(category.sidebarTextColor, '#e5e7eb'),
      sidebarActiveBackgroundColor: stringValue(
        category.sidebarActiveBackgroundColor,
        '#0f766e',
      ),
      sidebarActiveTextColor: stringValue(
        category.sidebarActiveTextColor,
        '#ffffff',
      ),
      successColor: stringValue(category.successColor, '#16a34a'),
      warningColor: stringValue(category.warningColor, '#f59e0b'),
      dangerColor: stringValue(category.dangerColor, '#dc2626'),
      infoColor: stringValue(category.infoColor, '#2563eb'),
      fontFamily: stringValue(category.fontFamily, 'INTER'),
      themeMode: stringValue(category.themeMode, 'LIGHT'),
      density: stringValue(category.density, 'COMFORTABLE'),
      radius: stringValue(category.radius, 'LARGE'),
      shadow: stringValue(category.shadow, 'SOFT'),
      navigationLayout: stringValue(category.navigationLayout, 'SIDEBAR'),
      appBackgroundColor: stringValue(category.appBackgroundColor, '#f5f0e8'),
      appSurfaceColor: stringValue(category.appSurfaceColor, '#fffaf4'),
      pageGradientStartColor: stringValue(
        category.pageGradientStartColor,
        '#fffcf7',
      ),
      pageGradientEndColor: stringValue(
        category.pageGradientEndColor,
        '#f5f0e8',
      ),
      cardGradientStartColor: stringValue(
        category.cardGradientStartColor,
        '#ffffff',
      ),
      cardGradientEndColor: stringValue(
        category.cardGradientEndColor,
        '#d6f4ee',
      ),
      welcomeTitle: stringValue(category.welcomeTitle, ''),
      welcomeSubtitle: stringValue(category.welcomeSubtitle, ''),
      footerText: stringValue(category.footerText, 'Powered by DijiPeople'),
      employeePortalMessage: stringValue(category.employeePortalMessage, ''),
      dashboardGreeting: stringValue(category.dashboardGreeting, ''),
      sidebarStyle: stringValue(category.sidebarStyle, 'DEFAULT'),
      defaultThemeMode: stringValue(category.defaultThemeMode, 'LIGHT'),
      supportEmail: stringValue(category.supportEmail, ''),
      supportPhone: stringValue(category.supportPhone, ''),
      privacyPolicyUrl: stringValue(category.privacyPolicyUrl, ''),
      termsOfUseUrl: stringValue(category.termsOfUseUrl, ''),
      websiteUrl: stringValue(category.websiteUrl, ''),
      showBrandingOnLoginPage: booleanValue(
        category.showBrandingOnLoginPage,
        true,
      ),
      showBrandingInEmployeePortal: booleanValue(
        category.showBrandingInEmployeePortal,
        true,
      ),
    };
  }

  async getSystemSettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<SystemSettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.system ?? {};
    const weekStart = stringValue(category.defaultWeekStartDay, 'MONDAY');

    return {
      dateFormat: stringValue(category.dateFormat, 'MM/dd/yyyy'),
      timeFormat: stringValue(category.timeFormat, '12h'),
      locale: stringValue(category.locale, 'en-US'),
      uiDensity: stringValue(category.uiDensity, 'comfortable'),
      defaultThemeMode: stringValue(category.defaultThemeMode, 'light'),
      defaultDashboardView: stringValue(
        category.defaultDashboardView,
        'overview',
      ),
      defaultLandingModule: stringValue(
        category.defaultLandingModule,
        'overview',
      ),
      defaultWeekStartDay: Object.values(WorkWeekday).includes(
        weekStart as WorkWeekday,
      )
        ? (weekStart as WorkWeekday)
        : WorkWeekday.MONDAY,
      defaultRecordsPerPage: numberValue(
        category.defaultRecordsPerPage,
        25,
        5,
        200,
      ),
      enableStickyFilters: booleanValue(category.enableStickyFilters, true),
      defaultTimezone: stringValue(category.defaultTimezone, 'UTC'),
      defaultCurrency: stringValue(category.defaultCurrency, 'USD'),
      defaultLanguage: stringValue(category.defaultLanguage, 'en'),
      autoLogoutMinutes: numberValue(category.autoLogoutMinutes, 15, 15, 1440),
      showHelpTips: booleanValue(category.showHelpTips, true),
    };
  }

  async getSecuritySettings(
    tenantId: string,
    organizationId?: string,
  ): Promise<SecuritySettingsResolved> {
    const source = await this.getSettingsMap(tenantId, organizationId);
    const category = source.security ?? {};
    return {
      allowRememberMe: booleanValue(category.allowRememberMe, true),
      sessionTimeoutMinutes: numberValue(
        category.sessionTimeoutMinutes,
        480,
        15,
        1440,
      ),
      refreshTokenExpiryDays: numberValue(
        category.refreshTokenExpiryDays,
        30,
        1,
        365,
      ),
      absoluteSessionLifetimeDays: numberValue(
        category.absoluteSessionLifetimeDays,
        30,
        1,
        365,
      ),
      idleTimeoutMinutes: numberValue(
        category.idleTimeoutMinutes,
        480,
        15,
        1440,
      ),
    };
  }

  async getPublicBrandingByTenantSlug(
    tenantSlug?: string | null,
  ): Promise<PublicBrandingResolved> {
    const fallbackBranding = DEFAULT_TENANT_SETTINGS.branding;

    const fallback: PublicBrandingResolved = {
      tenantId: null,
      tenantSlug: tenantSlug?.trim() || null,
      tenantName: 'DijiPeople',
      appTitle: stringValue(fallbackBranding.appTitle, 'DijiPeople'),
      brandName: stringValue(fallbackBranding.brandName, 'DijiPeople'),
      shortBrandName: stringValue(
        fallbackBranding.shortBrandName,
        'DijiPeople',
      ),
      logoUrl: stringValue(fallbackBranding.logoUrl, ''),
      faviconUrl: stringValue(fallbackBranding.faviconUrl, ''),
      loginBannerImageUrl: stringValue(
        fallbackBranding.loginBannerImageUrl,
        '',
      ),
      squareLogoUrl: stringValue(fallbackBranding.squareLogoUrl, ''),
      primaryColor: stringValue(fallbackBranding.primaryColor, '#0f766e'),
      secondaryColor: stringValue(fallbackBranding.secondaryColor, '#0f172a'),
      accentColor: stringValue(fallbackBranding.accentColor, '#14b8a6'),
      backgroundColor: stringValue(fallbackBranding.backgroundColor, '#f8fafc'),
      surfaceColor: stringValue(fallbackBranding.surfaceColor, '#ffffff'),
      textColor: stringValue(fallbackBranding.textColor, '#0f172a'),
      mutedTextColor: stringValue(fallbackBranding.mutedTextColor, '#64748b'),
      borderColor: stringValue(fallbackBranding.borderColor, '#e2e8f0'),
      sidebarBackgroundColor: stringValue(
        fallbackBranding.sidebarBackgroundColor,
        '#0f172a',
      ),
      sidebarTextColor: stringValue(
        fallbackBranding.sidebarTextColor,
        '#e5e7eb',
      ),
      sidebarActiveBackgroundColor: stringValue(
        fallbackBranding.sidebarActiveBackgroundColor,
        '#0f766e',
      ),
      sidebarActiveTextColor: stringValue(
        fallbackBranding.sidebarActiveTextColor,
        '#ffffff',
      ),
      successColor: stringValue(fallbackBranding.successColor, '#16a34a'),
      warningColor: stringValue(fallbackBranding.warningColor, '#f59e0b'),
      dangerColor: stringValue(fallbackBranding.dangerColor, '#dc2626'),
      infoColor: stringValue(fallbackBranding.infoColor, '#2563eb'),
      fontFamily: stringValue(fallbackBranding.fontFamily, 'INTER'),
      themeMode: stringValue(fallbackBranding.themeMode, 'LIGHT'),
      density: stringValue(fallbackBranding.density, 'COMFORTABLE'),
      radius: stringValue(fallbackBranding.radius, 'LARGE'),
      shadow: stringValue(fallbackBranding.shadow, 'SOFT'),
      navigationLayout: stringValue(
        fallbackBranding.navigationLayout,
        'SIDEBAR',
      ),
      welcomeTitle: stringValue(
        fallbackBranding.welcomeTitle,
        'People operations, without the mess.',
      ),
      welcomeSubtitle: stringValue(
        fallbackBranding.welcomeSubtitle,
        'A clean HR workspace for admins, HR teams, managers, and employees.',
      ),
      footerText: stringValue(
        fallbackBranding.footerText,
        'Powered by DijiPeople',
      ),
      supportEmail: stringValue(fallbackBranding.supportEmail, ''),
      supportPhone: stringValue(fallbackBranding.supportPhone, ''),
      privacyPolicyUrl: stringValue(fallbackBranding.privacyPolicyUrl, ''),
      termsOfUseUrl: stringValue(fallbackBranding.termsOfUseUrl, ''),
      portalTagline: stringValue(fallbackBranding.portalTagline, ''),
      dashboardGreeting: stringValue(fallbackBranding.dashboardGreeting, ''),
      employeePortalMessage: stringValue(
        fallbackBranding.employeePortalMessage,
        '',
      ),
      showBrandingOnLoginPage: booleanValue(
        fallbackBranding.showBrandingOnLoginPage,
        true,
      ),
    };

    if (!tenantSlug?.trim()) {
      return fallback;
    }

    const tenant = await this.tenantSettingsRepository
      .findTenantBySlug(tenantSlug.trim())
      .catch((error: unknown) => {
        if (isDatabaseUnavailable(error)) {
          this.logDatabaseUnavailableWarning('public-branding', error);
          return null;
        }

        throw error;
      });
    if (!tenant) {
      return fallback;
    }

    const source = await this.getSettingsMap(tenant.id).catch(
      (error: unknown) => {
        if (isDatabaseUnavailable(error)) {
          this.logDatabaseUnavailableWarning('public-branding-settings', error);
          return null;
        }

        throw error;
      },
    );
    if (!source) {
      return fallback;
    }
    const branding = source.branding ?? {};

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      appTitle: stringValue(branding.appTitle, 'DijiPeople'),
      brandName: stringValue(branding.brandName, tenant.name || 'DijiPeople'),
      shortBrandName: stringValue(
        branding.shortBrandName,
        stringValue(branding.brandName, tenant.name || 'DijiPeople'),
      ),
      logoUrl: stringValue(branding.logoUrl, ''),
      faviconUrl: stringValue(branding.faviconUrl, ''),
      loginBannerImageUrl: stringValue(branding.loginBannerImageUrl, ''),
      squareLogoUrl: stringValue(branding.squareLogoUrl, ''),
      primaryColor: stringValue(branding.primaryColor, '#0f766e'),
      secondaryColor: stringValue(branding.secondaryColor, '#0f172a'),
      accentColor: stringValue(branding.accentColor, '#14b8a6'),
      backgroundColor: stringValue(branding.backgroundColor, '#f8fafc'),
      surfaceColor: stringValue(branding.surfaceColor, '#ffffff'),
      textColor: stringValue(branding.textColor, '#0f172a'),
      mutedTextColor: stringValue(branding.mutedTextColor, '#64748b'),
      borderColor: stringValue(branding.borderColor, '#e2e8f0'),
      sidebarBackgroundColor: stringValue(
        branding.sidebarBackgroundColor,
        '#0f172a',
      ),
      sidebarTextColor: stringValue(branding.sidebarTextColor, '#e5e7eb'),
      sidebarActiveBackgroundColor: stringValue(
        branding.sidebarActiveBackgroundColor,
        '#0f766e',
      ),
      sidebarActiveTextColor: stringValue(
        branding.sidebarActiveTextColor,
        '#ffffff',
      ),
      successColor: stringValue(branding.successColor, '#16a34a'),
      warningColor: stringValue(branding.warningColor, '#f59e0b'),
      dangerColor: stringValue(branding.dangerColor, '#dc2626'),
      infoColor: stringValue(branding.infoColor, '#2563eb'),
      fontFamily: stringValue(branding.fontFamily, 'INTER'),
      themeMode: stringValue(branding.themeMode, 'LIGHT'),
      density: stringValue(branding.density, 'COMFORTABLE'),
      radius: stringValue(branding.radius, 'LARGE'),
      shadow: stringValue(branding.shadow, 'SOFT'),
      navigationLayout: stringValue(branding.navigationLayout, 'SIDEBAR'),
      welcomeTitle: stringValue(
        branding.welcomeTitle,
        'People operations, without the mess.',
      ),
      welcomeSubtitle: stringValue(
        branding.welcomeSubtitle,
        'A clean HR workspace for admins, HR teams, managers, and employees.',
      ),
      footerText: stringValue(branding.footerText, 'Powered by DijiPeople'),
      supportEmail: stringValue(branding.supportEmail, ''),
      supportPhone: stringValue(branding.supportPhone, ''),
      privacyPolicyUrl: stringValue(branding.privacyPolicyUrl, ''),
      termsOfUseUrl: stringValue(branding.termsOfUseUrl, ''),
      portalTagline: stringValue(branding.portalTagline, ''),
      dashboardGreeting: stringValue(branding.dashboardGreeting, ''),
      employeePortalMessage: stringValue(branding.employeePortalMessage, ''),
      showBrandingOnLoginPage: booleanValue(
        branding.showBrandingOnLoginPage,
        true,
      ),
    };
  }

  getAllowedKeysByCategory() {
    const allowed = new Map<TenantSettingCategory, Set<string>>();
    const categories = Object.keys(
      DEFAULT_TENANT_SETTINGS,
    ) as TenantSettingCategory[];

    categories.forEach((category) => {
      allowed.set(
        category,
        new Set(Object.keys(DEFAULT_TENANT_SETTINGS[category] ?? {})),
      );
    });

    return allowed;
  }

  /**
   * Drops the tenant entry and every organization-scoped entry derived from it.
   * Organization views are merged on top of tenant values, so a tenant change
   * that only cleared `tenantId` would leave each organization serving stale
   * settings until its own TTL expired.
   */
  invalidateTenantCache(tenantId: string) {
    this.cache.delete(tenantId);

    const scopePrefix = `${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(scopePrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Resolves settings for a tenant, optionally layering an organization's
   * overrides on top.
   *
   * Precedence is defaults < tenant < organization, applied per (category, key)
   * so an organization only has to store the handful of values it changes and
   * inherits everything else. Entries are cached per scope, because the tenant
   * view and each organization view are different results.
   */
  private async getSettingsMap(
    tenantId: string,
    organizationId?: string,
  ): Promise<SettingsMap> {
    const scopeKey = organizationId
      ? `${tenantId}:${organizationId}`
      : tenantId;
    const now = Date.now();
    const cached = this.cache.get(scopeKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const [persistedSettings, organizationSettings] = await Promise.all([
      this.tenantSettingsRepository.findSettingsByTenant(tenantId),
      organizationId
        ? this.tenantSettingsRepository.findSettingsByOrganization(
            tenantId,
            organizationId,
          )
        : Promise.resolve([]),
    ]);

    const settings = structuredClone(DEFAULT_TENANT_SETTINGS) as SettingsMap;

    for (const item of [...persistedSettings, ...organizationSettings]) {
      if (!settings[item.category]) {
        settings[item.category] = {};
      }
      settings[item.category][item.key] = item.value;
    }

    this.cache.set(scopeKey, {
      value: settings,
      expiresAt: now + 30_000,
    });

    return settings;
  }

  private async getBusinessUnitCategorySettings(
    tenantId: string,
    businessUnitId: string | null | undefined,
    category: 'timesheets' | 'payroll',
  ): Promise<Record<string, unknown>> {
    if (!businessUnitId) {
      return {};
    }

    const businessUnit = await this.prisma.businessUnit.findFirst({
      where: {
        tenantId,
        id: businessUnitId,
      },
      select: {
        settingsJson: true,
      },
    });

    const settingsJson = businessUnit?.settingsJson;
    if (
      !settingsJson ||
      typeof settingsJson !== 'object' ||
      Array.isArray(settingsJson)
    ) {
      return {};
    }

    const settings = settingsJson as Record<string, unknown>;
    const categorySettings = settings[category];
    if (
      categorySettings &&
      typeof categorySettings === 'object' &&
      !Array.isArray(categorySettings)
    ) {
      return categorySettings as Record<string, unknown>;
    }

    return settings;
  }

  private logDatabaseUnavailableWarning(context: string, error: unknown) {
    if (this.databaseUnavailableWarningLogged) {
      return;
    }

    this.databaseUnavailableWarningLogged = true;
    this.logger.warn(
      JSON.stringify({
        context,
        message:
          'Database is not reachable. Returning default tenant branding fallback.',
        error: formatPrismaError(error),
      }),
    );
  }
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function stringValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isDatabaseUnavailable(error: unknown) {
  return getPrismaErrorCode(error) === 'ECONNREFUSED';
}

function getPrismaErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function formatPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      code: error.code,
      message: error.message,
      meta: error.meta,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return String(error);
}

function enumStringValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return allowedValues.includes(normalized as T[number])
    ? (normalized as T[number])
    : fallback;
}

function csvValues(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}
