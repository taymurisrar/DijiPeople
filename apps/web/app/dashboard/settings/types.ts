export type DepartmentRecord = {
  id: string;
  tenantId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DesignationRecord = {
  id: string;
  tenantId: string;
  name: string;
  level?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocationRecord = {
  id: string;
  tenantId: string;
  name: string;
  code?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city: string;
  state: string;
  country: string;
  zipCode?: string | null;
  timezone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeaveTypeRecord = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  category: string;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeaveAccrualType =
  | "FIXED_ANNUAL"
  | "MONTHLY_ACCRUAL"
  | "NONE";

export type LeavePolicyRecord = {
  id: string;
  tenantId: string;
  name: string;
  accrualType: LeaveAccrualType;
  annualEntitlement: string;
  carryForwardAllowed: boolean;
  carryForwardLimit?: string | null;
  negativeBalanceAllowed: boolean;
  genderRestriction?: string | null;
  probationRestriction?: boolean | null;
  requiresDocumentAfterDays?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HolidayCalendarRecord = {
  id: string;
  tenantId: string;
  name: string;
  date: string;
  description?: string | null;
  isOptional: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalMatrixRecord = {
  id: string;
  tenantId: string;
  name: string;
  sequence: number;
  approverType: string;
  isActive: boolean;
  leaveType?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  leavePolicy?: {
    id: string;
    name: string;
  } | null;
};

export type TenantSettingsCategory =
  | "organization"
  | "employees"
  | "access"
  | "leave"
  | "attendance"
  | "timesheets"
  | "payroll"
  | "recruitment"
  | "documents"
  | "branding"
  | "notifications"
  | "system";

export type TenantSettingValue =
  | string
  | number
  | boolean
  | string[]
  | null;
  
export type TenantSettingsResponse = Partial<
  Record<TenantSettingsCategory, Record<string, TenantSettingValue>>
>;

export type TenantSettingsApiResponse = {
  settings: TenantSettingsResponse;
  categories: TenantSettingsCategory[];
};

export type TenantResolvedSettingsResponse = {
  organization: {
    companyDisplayName: string;
    legalBusinessName: string;
    industry: string;
    businessEmail: string;
    businessPhone: string;
    timezone: string;
    currency: string;
    dateFormat: string;
    weekStartsOn: string;
  };
  employee: {
    employeeIdPrefix: string;
    employeeIdSequenceLength: number;
    autoGenerateEmployeeId: boolean;
    defaultEmploymentType: string;
    defaultWorkMode: string;
    defaultEmployeeStatus: string;
    requireDepartment: boolean;
    requireDesignation: boolean;
    requireReportingManager: boolean;
    requireWorkLocation: boolean;
  };
  attendance: {
    defaultGraceMinutes: number;
    allowedModes: string[];
  };
  timesheets: {
    weekendDays: string[];
    defaultWorkHours: number;
    requireMONTHLYSubmission: boolean;
  };
  payroll: {
    payFrequency: string;
    defaultCurrency: string;
  };
  recruitment: {
    candidateStages: string[];
    autoCreateEmployeeFromCandidate: boolean;
    onboardingChecklistTemplate?: string;
    keepEmployeeAsDraftUntilOnboardingComplete?: boolean;
    preventEmployeeActivationUntilMandatoryFieldsCompleted?: boolean;
  };
  documents: {
    maxUploadSizeMb: number;
    allowedExtensions: string[];
  };
  notifications: {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    timesheetReminderEnabled: boolean;
    quietHoursEnabled: boolean;
  };
  branding: {
    appTitle?: string;
    brandName: string;
    shortBrandName: string;
    legalCompanyName?: string;
    logoUrl: string;
    squareLogoUrl?: string;
    faviconUrl?: string;
    loginBannerImageUrl?: string;
    emailHeaderLogoUrl?: string;
    portalTagline: string;
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    appBackgroundColor?: string;
    appSurfaceColor?: string;
    backgroundColor?: string;
    surfaceColor?: string;
    textColor?: string;
    fontFamily?: string;
    pageGradientStartColor?: string;
    pageGradientEndColor?: string;
    cardGradientStartColor?: string;
    cardGradientEndColor?: string;
    supportEmail: string;
    supportPhone?: string;
    websiteUrl?: string;
    welcomeTitle?: string;
    welcomeSubtitle?: string;
    footerText?: string;
    employeePortalMessage?: string;
    dashboardGreeting?: string;
    sidebarStyle?: string;
    defaultThemeMode?: string;
  };
  system: {
    dateFormat: string;
    timeFormat: string;
    locale: string;
    uiDensity: string;
    defaultThemeMode: string;
    defaultLandingModule: string;
    defaultWeekStartDay: string;
    defaultRecordsPerPage: number;
    defaultTimezone: string;
    defaultCurrency: string;
    autoLogoutMinutes: number;
  };
};

export type TenantSettingsCategoryResponse = {
  category: TenantSettingsCategory;
  settings: Record<string, TenantSettingValue>;
};

export type TenantFeatureRecord = {
  key: string;
  label: string;
  description: string;
  isIncludedInPlan: boolean;
  isEnabled: boolean;
  tenantOverrideEnabled: boolean | null;
};

export type TenantFeaturesResponse = {
  subscription: {
    id: string;
    status: "Trialing" | "Active" | "Past_Due" | "Cancelled";
    startDate: string;
    endDate: string | null;
    plan: {
      id: string;
      key: string;
      name: string;
    };
  } | null;
  items: TenantFeatureRecord[];
  enabledKeys: string[];
};

export type AuditLogRecord = {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
  actorUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type AuditLogsResponse = {
  items: AuditLogRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    actions: string[];
    entityTypes: string[];
    actors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }>;
  };
};

export type AccessPermissionRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
};

export type AccessRoleRecord = {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  rolePermissions: Array<{
    permissionId?: string;
    permission: AccessPermissionRecord;
  }>;
  userRoles?: Array<{
    userId: string;
  }>;
};

export type AccessUserOwnership = {
  isTenantOwner: boolean;
  designation: "TENANT_OWNER" | "SYSTEM_ADMIN" | "TENANT_USER";
};

export type AccessUserRecord = {
  userId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  isServiceAccount: boolean;
  lastLoginAt?: string | null;
  businessUnitId?: string | null;
  businessUnit?: {
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  } | null;
  roles: Array<{
    id: string;
    key: string;
    name: string;
  }>;
  directPermissions: AccessPermissionRecord[];
  effectivePermissionKeys: string[];
  ownership: AccessUserOwnership;
};

// app/dashboard/settings/types.ts
export type TenantSettingsValue =
  | string
  | number
  | boolean
  | null
  | string[];

export type OrganizationRecord = {
  id: string;
  tenantId: string;
  name: string;
  parentOrganizationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessUnitRecord = {
  id: string;
  tenantId: string;
  name: string;
  organizationId: string;
  parentBusinessUnitId: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
  };
};
