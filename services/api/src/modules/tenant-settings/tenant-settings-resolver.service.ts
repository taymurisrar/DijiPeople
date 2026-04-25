import { Injectable } from '@nestjs/common';
import { AttendanceMode, WorkWeekday } from '@prisma/client';
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
  standardWorkHoursPerDay: number;
};

export type TimesheetSettingsResolved = {
  weekendDays: WorkWeekday[];
  defaultWorkHours: number;
  allowWeekendWork: boolean;
  allowHolidayWork: boolean;
  requireMONTHLYSubmission: boolean;
  autoFillWorkingDays: boolean;
  requireSubmissionNote: boolean;
};

export type PayrollSettingsResolved = {
  payFrequency: string;
  payrollStatus: string;
  defaultPayrollGroup: string;
  defaultPaymentMode: string;
  compensationReviewCycle: string;
  defaultCurrency: string;
};

export type RecruitmentSettingsResolved = {
  candidateStages: string[];
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
  archiveAfterMonths: number;
  requireDocumentCategories: boolean;
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
  fontFamily: string;
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
  defaultTimezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
  autoLogoutMinutes: number;
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
  fontFamily: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  footerText: string;
  supportEmail: string;
  portalTagline: string;
  showBrandingOnLoginPage: boolean;
};

@Injectable()
export class TenantSettingsResolverService {
  private readonly cache = new Map<string, CachedSettings>();

  constructor(private readonly tenantSettingsRepository: TenantSettingsRepository) {}

  async getOrganizationSettings(
    tenantId: string,
  ): Promise<OrganizationSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
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
      weekStartsOn: Object.values(WorkWeekday).includes(weekStart as WorkWeekday)
        ? (weekStart as WorkWeekday)
        : WorkWeekday.MONDAY,
    };
  }

  async getEmployeeSettings(tenantId: string): Promise<EmployeeSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.employees ?? {};

    return {
      employeeIdPrefix: stringValue(category.employeeIdPrefix, 'EMP'),
      employeeIdSequenceLength: numberValue(category.employeeIdSequenceLength, 4, 1, 10),
      autoGenerateEmployeeId: booleanValue(category.autoGenerateEmployeeId, true),
      defaultEmploymentType: stringValue(category.defaultEmploymentType, 'FULL_TIME'),
      defaultWorkMode: stringValue(category.defaultWorkMode, 'OFFICE'),
      defaultEmployeeStatus: stringValue(category.defaultEmployeeStatus, 'Active'),
      requirePersonalEmail: booleanValue(category.requirePersonalEmail, false),
      requireEmergencyContact: booleanValue(category.requireEmergencyContact, true),
      requireJoiningDate: booleanValue(category.requireJoiningDate, true),
      requireDepartment: booleanValue(category.requireDepartment, false),
      requireDesignation: booleanValue(category.requireDesignation, false),
      requireReportingManager: booleanValue(category.requireReportingManager, false),
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
      allowSkipLevelApprovals: booleanValue(category.allowSkipLevelApprovals, false),
      allowMatrixReporting: booleanValue(category.allowMatrixReporting, false),
      allowEmployeeWithoutManager: booleanValue(category.allowEmployeeWithoutManager, true),
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
      warnOnPossibleDuplicate: booleanValue(category.warnOnPossibleDuplicate, true),
      onboardingChecklistTemplate: stringValue(
        category.onboardingChecklistTemplate,
        'standard',
      ),
    };
  }

  async getAttendanceSettings(tenantId: string): Promise<AttendanceSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.attendance ?? {};
    const modes = csvValues(category.allowedModes).filter((value): value is AttendanceMode =>
      Object.values(AttendanceMode).includes(value as AttendanceMode),
    );

    return {
      defaultGraceMinutes: numberValue(category.defaultGraceMinutes, 10, 0, 180),
      allowManualAdjustments: booleanValue(category.allowManualAdjustments, true),
      autoCheckOutEnabled: booleanValue(category.autoCheckOutEnabled, false),
      trackMissedCheckOut: booleanValue(category.trackMissedCheckOut, true),
      allowedModes: modes.length > 0 ? modes : [AttendanceMode.OFFICE, AttendanceMode.REMOTE],
      enforceOfficeLocationForOfficeMode: booleanValue(
        category.enforceOfficeLocationForOfficeMode,
        true,
      ),
      requireRemoteLocationCapture: booleanValue(
        category.requireRemoteLocationCapture,
        false,
      ),
      standardWorkHoursPerDay: numberValue(category.standardWorkHoursPerDay, 8, 1, 24),
    };
  }

  async getTimesheetSettings(tenantId: string): Promise<TimesheetSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.timesheets ?? {};
    const weekendDays = csvValues(category.weekendDays).filter((value): value is WorkWeekday =>
      Object.values(WorkWeekday).includes(value as WorkWeekday),
    );

    return {
      weekendDays: weekendDays.length > 0 ? weekendDays : [WorkWeekday.SATURDAY, WorkWeekday.SUNDAY],
      defaultWorkHours: numberValue(category.defaultWorkHours, 8, 1, 24),
      allowWeekendWork: booleanValue(category.allowWeekendWork, true),
      allowHolidayWork: booleanValue(category.allowHolidayWork, true),
      requireMONTHLYSubmission: booleanValue(category.requireMONTHLYSubmission, true),
      autoFillWorkingDays: booleanValue(category.autoFillWorkingDays, false),
      requireSubmissionNote: booleanValue(category.requireSubmissionNote, false),
    };
  }

  async getPayrollSettings(tenantId: string): Promise<PayrollSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.payroll ?? {};

    return {
      payFrequency: stringValue(category.payFrequency, 'MONTHLY'),
      payrollStatus: stringValue(category.payrollStatus, 'Active'),
      defaultPayrollGroup: stringValue(category.defaultPayrollGroup, 'main'),
      defaultPaymentMode: stringValue(category.defaultPaymentMode, 'BANK_TRANSFER'),
      compensationReviewCycle: stringValue(category.compensationReviewCycle, 'ANNUAL'),
      defaultCurrency: stringValue(category.defaultCurrency, 'USD'),
    };
  }

  async getRecruitmentSettings(
    tenantId: string,
  ): Promise<RecruitmentSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.recruitment ?? {};

    return {
      candidateStages: csvValues(category.candidateStages),
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

  async getDocumentSettings(tenantId: string): Promise<DocumentSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.documents ?? {};

    return {
      maxUploadSizeMb: numberValue(category.maxUploadSizeMb, 10, 1, 200),
      allowedExtensions: csvValues(category.allowedExtensions),
      archiveAfterMonths: numberValue(category.archiveAfterMonths, 24, 1, 1200),
      requireDocumentCategories: booleanValue(category.requireDocumentCategories, true),
    };
  }

  async getNotificationSettings(
    tenantId: string,
  ): Promise<NotificationSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.notifications ?? {};

    return {
      inAppEnabled: booleanValue(category.inAppEnabled, true),
      emailEnabled: booleanValue(category.emailEnabled, true),
      browserPushEnabled: booleanValue(category.browserPushEnabled, false),
      digestEnabled: booleanValue(category.digestEnabled, true),
      approvalDigestEnabled: booleanValue(category.approvalDigestEnabled, true),
      onboardingReminderEnabled: booleanValue(category.onboardingReminderEnabled, true),
      timesheetReminderEnabled: booleanValue(category.timesheetReminderEnabled, true),
      leaveDecisionEmailEnabled: booleanValue(category.leaveDecisionEmailEnabled, true),
      defaultReminderLeadDays: numberValue(category.defaultReminderLeadDays, 2, 0, 30),
      quietHoursEnabled: booleanValue(category.quietHoursEnabled, false),
      quietHoursWindow: stringValue(category.quietHoursWindow, '22:00-07:00'),
    };
  }

  async getBrandingSettings(tenantId: string): Promise<BrandingSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
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
      fontFamily: stringValue(category.fontFamily, 'INTER'),
      appBackgroundColor: stringValue(category.appBackgroundColor, '#f5f0e8'),
      appSurfaceColor: stringValue(category.appSurfaceColor, '#fffaf4'),
      pageGradientStartColor: stringValue(category.pageGradientStartColor, '#fffcf7'),
      pageGradientEndColor: stringValue(category.pageGradientEndColor, '#f5f0e8'),
      cardGradientStartColor: stringValue(category.cardGradientStartColor, '#ffffff'),
      cardGradientEndColor: stringValue(category.cardGradientEndColor, '#d6f4ee'),
      welcomeTitle: stringValue(category.welcomeTitle, ''),
      welcomeSubtitle: stringValue(category.welcomeSubtitle, ''),
      footerText: stringValue(category.footerText, 'Powered by DijiPeople'),
      employeePortalMessage: stringValue(category.employeePortalMessage, ''),
      dashboardGreeting: stringValue(category.dashboardGreeting, ''),
      sidebarStyle: stringValue(category.sidebarStyle, 'DEFAULT'),
      defaultThemeMode: stringValue(category.defaultThemeMode, 'LIGHT'),
      supportEmail: stringValue(category.supportEmail, ''),
      supportPhone: stringValue(category.supportPhone, ''),
      websiteUrl: stringValue(category.websiteUrl, ''),
      showBrandingOnLoginPage: booleanValue(category.showBrandingOnLoginPage, true),
      showBrandingInEmployeePortal: booleanValue(
        category.showBrandingInEmployeePortal,
        true,
      ),
    };
  }

  async getSystemSettings(tenantId: string): Promise<SystemSettingsResolved> {
    const source = await this.getSettingsMap(tenantId);
    const category = source.system ?? {};
    const weekStart = stringValue(category.defaultWeekStartDay, 'MONDAY');

    return {
      dateFormat: stringValue(category.dateFormat, 'MM/dd/yyyy'),
      timeFormat: stringValue(category.timeFormat, '12h'),
      locale: stringValue(category.locale, 'en-US'),
      uiDensity: stringValue(category.uiDensity, 'comfortable'),
      defaultThemeMode: stringValue(category.defaultThemeMode, 'light'),
      defaultDashboardView: stringValue(category.defaultDashboardView, 'overview'),
      defaultLandingModule: stringValue(category.defaultLandingModule, 'overview'),
      defaultWeekStartDay: Object.values(WorkWeekday).includes(weekStart as WorkWeekday)
        ? (weekStart as WorkWeekday)
        : WorkWeekday.MONDAY,
      defaultRecordsPerPage: numberValue(category.defaultRecordsPerPage, 25, 5, 200),
      defaultTimezone: stringValue(category.defaultTimezone, 'UTC'),
      defaultCurrency: stringValue(category.defaultCurrency, 'USD'),
      defaultLanguage: stringValue(category.defaultLanguage, 'en'),
      autoLogoutMinutes: numberValue(category.autoLogoutMinutes, 15, 15, 1440),
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
      shortBrandName: stringValue(fallbackBranding.shortBrandName, 'DijiPeople'),
      logoUrl: stringValue(fallbackBranding.logoUrl, ''),
      faviconUrl: stringValue(fallbackBranding.faviconUrl, ''),
      loginBannerImageUrl: stringValue(fallbackBranding.loginBannerImageUrl, ''),
      squareLogoUrl: stringValue(fallbackBranding.squareLogoUrl, ''),
    primaryColor: stringValue(fallbackBranding.primaryColor, '#0f766e'),
    secondaryColor: stringValue(fallbackBranding.secondaryColor, '#0f172a'),
    accentColor: stringValue(fallbackBranding.accentColor, '#14b8a6'),
    fontFamily: stringValue(fallbackBranding.fontFamily, 'INTER'),
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
    portalTagline: stringValue(fallbackBranding.portalTagline, ''),
    showBrandingOnLoginPage: booleanValue(
      fallbackBranding.showBrandingOnLoginPage,
      true,
    ),
  };

  if (!tenantSlug?.trim()) {
    return fallback;
  }

  const tenant = await this.tenantSettingsRepository.findTenantBySlug(tenantSlug.trim());
  if (!tenant) {
    return fallback;
  }

  const source = await this.getSettingsMap(tenant.id);
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
    fontFamily: stringValue(branding.fontFamily, 'INTER'),
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
    portalTagline: stringValue(branding.portalTagline, ''),
    showBrandingOnLoginPage: booleanValue(
      branding.showBrandingOnLoginPage,
      true,
    ),
  };
}

  getAllowedKeysByCategory() {
    const allowed = new Map<TenantSettingCategory, Set<string>>();
    const categories = Object.keys(DEFAULT_TENANT_SETTINGS) as TenantSettingCategory[];

    categories.forEach((category) => {
      allowed.set(category, new Set(Object.keys(DEFAULT_TENANT_SETTINGS[category] ?? {})));
    });

    return allowed;
  }

  invalidateTenantCache(tenantId: string) {
    this.cache.delete(tenantId);
  }

  private async getSettingsMap(tenantId: string): Promise<SettingsMap> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const persistedSettings = await this.tenantSettingsRepository.findSettingsByTenant(tenantId);
    const settings = structuredClone(DEFAULT_TENANT_SETTINGS) as SettingsMap;

    for (const item of persistedSettings) {
      if (!settings[item.category]) {
        settings[item.category] = {};
      }
      settings[item.category][item.key] = item.value;
    }

    this.cache.set(tenantId, {
      value: settings,
      expiresAt: now + 30_000,
    });

    return settings;
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
