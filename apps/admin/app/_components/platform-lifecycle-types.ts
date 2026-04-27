export type SelectOption = {
  value: string;
  label: string;
};

export type LifecycleOptions = {
  lead: {
    statuses: string[];
    subStatuses: Record<string, string[]>;
    sources: SelectOption[];
  };
  customer: {
    statuses: string[];
    subStatuses: Record<string, string[]>;
  };
  customerOnboarding: {
    statuses: string[];
    subStatuses: Record<string, string[]>;
  };
  industries: SelectOption[];
  companySizes: SelectOption[];
};

export type OperatorOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
  status: string;
};

export type PlanOption = {
  id: string;
  key: string;
  name: string;
  monthlyBasePrice?: number;
  annualBasePrice?: number;
  currency?: string;
};

export type LeadRecord = {
  id: string;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  fullName: string;
  companyName: string;
  workEmail: string;
  phoneNumber?: string | null;
  companyWebsite?: string | null;
  industry: string;
  companySize: string;
  country?: string | null;
  stateProvince?: string | null;
  city?: string | null;
  source: string;
  interestedPlan?: string | null;
  estimatedEmployeeCount?: number | null;
  requirementsSummary?: string | null;
  notes?: string | null;
  assignedToUserId?: string | null;
  assignedToUser?: { id: string; fullName: string; email: string } | null;
  status: string;
  subStatus?: string | null;
  isQualified: boolean;
  createdAt: string;
  convertedCustomer?: { id: string; companyName: string; status: string } | null;
};

export type PaginatedResponse<T> = {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CustomerRecord = {
  id: string;
  companyName: string;
  primaryContactFirstName?: string | null;
  primaryContactLastName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country: string;
  status: string;
  subStatus?: string | null;
  leadId?: string | null;
  selectedPlan?: { id: string; key: string; name: string } | null;
  accountManagerUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  primaryOwnerUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    subscription?: {
      id: string;
      plan: { id: string; key: string; name: string };
      billingCycle: string;
      finalPrice: number;
      currency: string;
      status: string;
    } | null;
  } | null;
  tenants?: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    subscription?: {
      id: string;
      plan: { id: string; key: string; name: string };
      billingCycle: string;
      finalPrice: number;
      currency: string;
      status: string;
      renewalDate?: string | null;
    } | null;
  }>;
  subscriptions?: Array<{
    id: string;
    status: string;
    billingCycle: string;
    finalPrice: number;
    currency: string;
    renewalDate?: string | null;
    tenantId: string;
    plan: { id: string; key: string; name: string };
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    issueDate: string;
    dueDate: string;
    tenantId: string;
  }>;
  payments?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    paidAt?: string | null;
    tenantId: string;
    invoiceId?: string | null;
  }>;
  lifecycle?: {
    currentStatus: string;
    subStatus?: string | null;
    activeOnboardingStatus?: string | null;
    tenantCount: number;
    activeTenantCount: number;
    subscriptionStatusSummary: Record<string, number>;
    paymentStatusSummary: Record<string, number>;
    nextRenewalDate?: string | null;
  };
  onboardingPrerequisites?: {
    checks: Array<{ key: string; label: string; passed: boolean }>;
    missingItems: string[];
    allPassed: boolean;
  };
  onboardings?: Array<{
    id: string;
    status: string;
    subStatus?: string | null;
    tenantCreated: boolean;
  }>;
};

export type PlatformSettingsRecord = {
  platformDefaults: Record<string, unknown>;
  publicPlanVisibility: Record<string, unknown>;
  billingDefaults: Record<string, unknown>;
  invoiceDefaults: Record<string, unknown>;
  emailProvider: Record<string, unknown>;
  branding: Record<string, unknown>;
  featureCatalog: Record<string, unknown>;
  leadDefinitions: Record<string, unknown>;
};

export type CustomerOnboardingRecord = {
  id: string;
  customerId: string;
  status: string;
  subStatus?: string | null;
  selectedPlanId?: string | null;
  billingCycle?: string | null;
  primaryOwnerFirstName: string;
  primaryOwnerLastName: string;
  primaryOwnerWorkEmail: string;
  createServiceAccount?: boolean;
  serviceAccountEmail?: string | null;
  serviceAccountDisplayName?: string | null;
  serviceAccountAssignSystemAdmin?: boolean;
  contractSigned: boolean;
  paymentConfirmed: boolean;
  configurationReady: boolean;
  trainingPlanned: boolean;
  tenantCreated: boolean;
  notes?: string | null;
  customer: {
    id: string;
    companyName: string;
    status: string;
    subStatus?: string | null;
  };
  onboardingOwnerUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  selectedPlan?: { id: string; key: string; name: string } | null;
  tenant?: { id: string; name: string; slug: string; status: string } | null;
  readiness: {
    completionPercent: number;
    blockers: string[];
    isReadyForTenantCreation: boolean;
    checks: Array<{ label: string; passed: boolean }>;
  };
};
