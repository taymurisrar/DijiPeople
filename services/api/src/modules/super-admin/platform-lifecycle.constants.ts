import {
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  LeadStatus,
} from '@prisma/client';

export type LifecycleEntity = 'lead' | 'customer' | 'customerOnboarding';

export type LifecycleTone =
  | 'default'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export type LifecycleCriterionType =
  | 'fieldRequired'
  | 'fieldRecommended'
  | 'documentRequired'
  | 'paymentRequired'
  | 'approvalRequired'
  | 'systemCheck'
  | 'manualConfirmation';

export type LifecycleCriterionSeverity = 'required' | 'recommended';

export type LifecycleCriterion = {
  key: string;
  label: string;
  description?: string;
  type: LifecycleCriterionType;
  severity: LifecycleCriterionSeverity;
  fieldKey?: string;
  documentType?: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

export type LifecycleOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  description?: string;
};

export type LifecycleStageDefinition<TValue extends string = string> = {
  value: TValue;
  label: string;
  description?: string;
  tone: LifecycleTone;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  isTerminal: boolean;
  requiresReason?: boolean;
  allowedNextStatuses: readonly TValue[];
  criteria: readonly LifecycleCriterion[];
};

export type LifecycleSubStatusDefinition<TStatus extends string = string> = {
  status: TStatus;
  value: string;
  label: string;
  description?: string;
  tone?: LifecycleTone;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

function requiredField(
  key: string,
  label: string,
  fieldKey: string,
  sortOrder: number,
  description?: string,
): LifecycleCriterion {
  return {
    key,
    label,
    description,
    type: 'fieldRequired',
    severity: 'required',
    fieldKey,
    sortOrder,
    isActive: true,
    isSystem: true,
  };
}

function recommendedField(
  key: string,
  label: string,
  fieldKey: string,
  sortOrder: number,
  description?: string,
): LifecycleCriterion {
  return {
    key,
    label,
    description,
    type: 'fieldRecommended',
    severity: 'recommended',
    fieldKey,
    sortOrder,
    isActive: true,
    isSystem: true,
  };
}

function requiredDocument(
  key: string,
  label: string,
  documentType: string,
  sortOrder: number,
  description?: string,
): LifecycleCriterion {
  return {
    key,
    label,
    description,
    type: 'documentRequired',
    severity: 'required',
    documentType,
    sortOrder,
    isActive: true,
    isSystem: true,
  };
}

function manualConfirmation(
  key: string,
  label: string,
  sortOrder: number,
  description?: string,
): LifecycleCriterion {
  return {
    key,
    label,
    description,
    type: 'manualConfirmation',
    severity: 'required',
    sortOrder,
    isActive: true,
    isSystem: true,
  };
}

function systemCheck(
  key: string,
  label: string,
  sortOrder: number,
  description?: string,
): LifecycleCriterion {
  return {
    key,
    label,
    description,
    type: 'systemCheck',
    severity: 'required',
    sortOrder,
    isActive: true,
    isSystem: true,
  };
}

export const LEAD_STATUS_OPTIONS = [
  {
    value: LeadStatus.NEW,
    label: 'New',
    description: 'Lead has been captured but not yet worked.',
    tone: 'info',
    sortOrder: 10,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      LeadStatus.CONTACTED,
      LeadStatus.QUALIFIED,
      LeadStatus.UNQUALIFIED,
      LeadStatus.ARCHIVED,
    ],
    criteria: [
      requiredField('lead.companyName', 'Company name', 'companyName', 10),
      recommendedField(
        'lead.contactFirstName',
        'First name',
        'contactFirstName',
        20,
      ),
      recommendedField(
        'lead.contactLastName',
        'Last name',
        'contactLastName',
        30,
      ),
      recommendedField('lead.email', 'Email address', 'workEmail', 40),
      recommendedField('lead.phone', 'Phone number', 'phoneNumber', 50),
      recommendedField('lead.source', 'Lead source', 'source', 50),
    ],
  },
  {
    value: LeadStatus.CONTACTED,
    label: 'Contacted',
    description: 'Initial outreach has been completed.',
    tone: 'info',
    sortOrder: 20,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      LeadStatus.QUALIFIED,
      LeadStatus.UNQUALIFIED,
      LeadStatus.CLOSED_LOST,
      LeadStatus.ARCHIVED,
    ],
    criteria: [
      requiredField(
        'lead.contactFirstName',
        'First name',
        'contactFirstName',
        10,
      ),
      requiredField('lead.email', 'Email address', 'workEmail', 20),
      recommendedField(
        'lead.lastContactedAt',
        'Last contacted date',
        'lastContactedAt',
        30,
      ),
      recommendedField(
        'lead.nextFollowUpAt',
        'Next follow-up date',
        'nextFollowUpAt',
        40,
      ),
      recommendedField('lead.notes', 'Interaction notes', 'notes', 50),
    ],
  },
  {
    value: LeadStatus.QUALIFIED,
    label: 'Qualified',
    description: 'Lead matches the commercial and product-fit criteria.',
    tone: 'success',
    sortOrder: 30,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      LeadStatus.CONVERTED,
      LeadStatus.CLOSED_LOST,
      LeadStatus.UNQUALIFIED,
      LeadStatus.ARCHIVED,
    ],
    criteria: [
      requiredField('lead.industry', 'Industry', 'industry', 10),
      requiredField('lead.companySize', 'Company size', 'companySize', 20),
      recommendedField(
        'lead.expectedUsers',
        'Expected users',
        'expectedUsers',
        30,
      ),
      recommendedField(
        'lead.estimatedValue',
        'Estimated value',
        'estimatedValue',
        40,
      ),
      recommendedField(
        'lead.requirementsSummary',
        'Requirements summary',
        'requirementsSummary',
        50,
      ),
      manualConfirmation(
        'lead.productFitConfirmed',
        'Product fit confirmed',
        60,
        'Sales user confirms that DijiPeople can solve the customer need.',
      ),
    ],
  },
  {
    value: LeadStatus.UNQUALIFIED,
    label: 'Unqualified',
    description: 'Lead does not currently fit the target profile.',
    tone: 'muted',
    sortOrder: 40,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField(
        'lead.disqualificationReason',
        'Disqualification reason',
        'subStatus',
        10,
      ),
      recommendedField('lead.notes', 'Reason notes', 'notes', 20),
    ],
  },
  {
    value: LeadStatus.CONVERTED,
    label: 'Converted',
    description: 'Lead has been converted into a customer account.',
    tone: 'success',
    sortOrder: 50,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField('lead.companyName', 'Company name', 'companyName', 10),
      requiredField(
        'lead.contactFirstName',
        'Primary first name',
        'contactFirstName',
        20,
      ),
      requiredField(
        'lead.contactLastName',
        'Primary last name',
        'contactLastName',
        30,
      ),
      requiredField('lead.email', 'Primary email', 'workEmail', 40),
      requiredField('lead.industry', 'Industry', 'industry', 50),
      requiredField('lead.companySize', 'Company size', 'companySize', 60),
      manualConfirmation(
        'lead.readyForConversion',
        'Ready for customer conversion',
        70,
      ),
    ],
  },
  {
    value: LeadStatus.CLOSED_LOST,
    label: 'Closed lost',
    description: 'Opportunity was lost or discontinued.',
    tone: 'danger',
    sortOrder: 60,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField('lead.lostReason', 'Lost reason', 'subStatus', 10),
      recommendedField('lead.competitor', 'Competitor', 'competitor', 20),
      recommendedField('lead.notes', 'Loss notes', 'notes', 30),
    ],
  },
  {
    value: LeadStatus.ARCHIVED,
    label: 'Archived',
    description: 'Lead is no longer active but retained for history.',
    tone: 'muted',
    sortOrder: 70,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      recommendedField('lead.archiveReason', 'Archive reason', 'notes', 10),
    ],
  },
] as const satisfies readonly LifecycleStageDefinition<LeadStatus>[];

export const CUSTOMER_STATUS_OPTIONS = [
  {
    value: CustomerAccountStatus.LEAD,
    label: 'Lead',
    description: 'Customer record originated from an early-stage lead.',
    tone: 'info',
    sortOrder: 10,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerAccountStatus.PROSPECT,
      CustomerAccountStatus.ONBOARDING,
      CustomerAccountStatus.ARCHIVED,
    ],
    criteria: [
      requiredField('customer.name', 'Customer name', 'name', 10),
      recommendedField('customer.source', 'Customer source', 'source', 20),
    ],
  },
  {
    value: CustomerAccountStatus.PROSPECT,
    label: 'Prospect',
    description: 'Commercial discussion is active but not yet closed.',
    tone: 'info',
    sortOrder: 20,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerAccountStatus.ONBOARDING,
      CustomerAccountStatus.ACTIVE,
      CustomerAccountStatus.CHURNED,
      CustomerAccountStatus.ARCHIVED,
    ],
    criteria: [
      requiredField('customer.name', 'Customer name', 'name', 10),
      requiredField(
        'customer.primaryContactName',
        'Primary contact',
        'primaryContactName',
        20,
      ),
      requiredField(
        'customer.primaryContactEmail',
        'Primary email',
        'primaryContactEmail',
        30,
      ),
      recommendedField('customer.industry', 'Industry', 'industry', 40),
      recommendedField(
        'customer.companySize',
        'Company size',
        'companySize',
        50,
      ),
    ],
  },
  {
    value: CustomerAccountStatus.ONBOARDING,
    label: 'Onboarding',
    description: 'Customer is being configured and prepared for go-live.',
    tone: 'warning',
    sortOrder: 30,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerAccountStatus.ACTIVE,
      CustomerAccountStatus.SUSPENDED,
      CustomerAccountStatus.CHURNED,
      CustomerAccountStatus.ARCHIVED,
    ],
    criteria: [
      requiredField(
        'customer.billingCurrency',
        'Billing currency',
        'billingCurrency',
        10,
      ),
      requiredField(
        'customer.billingEmail',
        'Billing email',
        'billingEmail',
        20,
      ),
      recommendedField(
        'customer.contractStartDate',
        'Contract start date',
        'contractStartDate',
        30,
      ),
      recommendedField('customer.planId', 'Subscription plan', 'planId', 40),
    ],
  },
  {
    value: CustomerAccountStatus.ACTIVE,
    label: 'Active',
    description: 'Customer is live and operational.',
    tone: 'success',
    sortOrder: 40,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerAccountStatus.SUSPENDED,
      CustomerAccountStatus.CHURNED,
      CustomerAccountStatus.ARCHIVED,
    ],
    criteria: [
      requiredField('customer.tenantId', 'Tenant linked', 'tenantId', 10),
      requiredField(
        'customer.subscriptionId',
        'Subscription linked',
        'subscriptionId',
        20,
      ),
      systemCheck(
        'customer.activeSubscription',
        'Active subscription exists',
        30,
      ),
    ],
  },
  {
    value: CustomerAccountStatus.SUSPENDED,
    label: 'Suspended',
    description: 'Customer access or service is temporarily restricted.',
    tone: 'warning',
    sortOrder: 50,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    requiresReason: true,
    allowedNextStatuses: [
      CustomerAccountStatus.ACTIVE,
      CustomerAccountStatus.CHURNED,
      CustomerAccountStatus.ARCHIVED,
    ],
    criteria: [
      requiredField(
        'customer.suspensionReason',
        'Suspension reason',
        'subStatus',
        10,
      ),
      recommendedField(
        'customer.suspensionNotes',
        'Suspension notes',
        'notes',
        20,
      ),
    ],
  },
  {
    value: CustomerAccountStatus.CHURNED,
    label: 'Churned',
    description: 'Customer relationship has ended.',
    tone: 'danger',
    sortOrder: 60,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField('customer.churnReason', 'Churn reason', 'subStatus', 10),
      recommendedField('customer.churnedAt', 'Churn date', 'churnedAt', 20),
      recommendedField('customer.notes', 'Churn notes', 'notes', 30),
    ],
  },
  {
    value: CustomerAccountStatus.ARCHIVED,
    label: 'Archived',
    description: 'Customer is retained for history but no longer active.',
    tone: 'muted',
    sortOrder: 70,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      recommendedField('customer.archiveReason', 'Archive reason', 'notes', 10),
    ],
  },
] as const satisfies readonly LifecycleStageDefinition<CustomerAccountStatus>[];

export const CUSTOMER_ONBOARDING_STATUS_OPTIONS = [
  {
    value: CustomerOnboardingStatus.NOT_STARTED,
    label: 'Not started',
    description: 'Onboarding has not started yet.',
    tone: 'muted',
    sortOrder: 10,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerOnboardingStatus.IN_PROGRESS,
      CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      requiredField(
        'onboarding.customerId',
        'Customer linked',
        'customerId',
        10,
      ),
      recommendedField('onboarding.ownerId', 'Onboarding owner', 'ownerId', 20),
    ],
  },
  {
    value: CustomerOnboardingStatus.IN_PROGRESS,
    label: 'In progress',
    description: 'Implementation activities are currently in progress.',
    tone: 'info',
    sortOrder: 20,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT,
      CustomerOnboardingStatus.PENDING_PAYMENT,
      CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
      CustomerOnboardingStatus.BLOCKED,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      requiredField('onboarding.ownerId', 'Onboarding owner', 'ownerId', 10),
      recommendedField(
        'onboarding.kickoffDate',
        'Kickoff date',
        'kickoffDate',
        20,
      ),
      recommendedField(
        'onboarding.targetGoLiveDate',
        'Target go-live date',
        'targetGoLiveDate',
        30,
      ),
      recommendedField(
        'onboarding.requirements',
        'Configuration requirements',
        'requirements',
        40,
      ),
    ],
  },
  {
    value: CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT,
    label: 'Awaiting customer input',
    description: 'Progress is waiting on customer-side information or action.',
    tone: 'warning',
    sortOrder: 30,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerOnboardingStatus.IN_PROGRESS,
      CustomerOnboardingStatus.BLOCKED,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      manualConfirmation(
        'onboarding.pendingCustomerInputIdentified',
        'Pending customer input identified',
        10,
      ),
      recommendedField(
        'onboarding.pendingItems',
        'Pending items',
        'pendingItems',
        20,
      ),
    ],
  },
  {
    value: CustomerOnboardingStatus.PENDING_PAYMENT,
    label: 'Pending payment',
    description: 'Onboarding is waiting for payment confirmation.',
    tone: 'warning',
    sortOrder: 40,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerOnboardingStatus.IN_PROGRESS,
      CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
      CustomerOnboardingStatus.BLOCKED,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      requiredField('onboarding.invoiceId', 'Invoice linked', 'invoiceId', 10),
      systemCheck('onboarding.paymentStatus', 'Payment status checked', 20),
    ],
  },
  {
    value: CustomerOnboardingStatus.READY_FOR_TENANT_CREATION,
    label: 'Ready for tenant creation',
    description: 'Commercial and onboarding requirements are complete.',
    tone: 'success',
    sortOrder: 50,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    allowedNextStatuses: [
      CustomerOnboardingStatus.COMPLETED,
      CustomerOnboardingStatus.BLOCKED,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      requiredField('onboarding.tenantName', 'Tenant name', 'tenantName', 10),
      requiredField('onboarding.tenantSlug', 'Tenant slug', 'tenantSlug', 20),
      requiredField(
        'onboarding.adminEmail',
        'Tenant admin email',
        'adminEmail',
        30,
      ),
      requiredField(
        'onboarding.defaultCountry',
        'Default country',
        'defaultCountry',
        40,
      ),
      requiredField(
        'onboarding.defaultCurrency',
        'Default currency',
        'defaultCurrency',
        50,
      ),
      requiredField(
        'onboarding.defaultTimezone',
        'Default timezone',
        'defaultTimezone',
        60,
      ),
      requiredDocument(
        'onboarding.signedContract',
        'Signed contract',
        'contract',
        65,
        'Signed agreement is available before tenant creation.',
      ),
      manualConfirmation(
        'onboarding.finalReviewComplete',
        'Final review complete',
        70,
      ),
    ],
  },
  {
    value: CustomerOnboardingStatus.COMPLETED,
    label: 'Completed',
    description: 'Tenant has been created and onboarding is complete.',
    tone: 'success',
    sortOrder: 60,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField('onboarding.tenantId', 'Tenant created', 'tenantId', 10),
      requiredField(
        'onboarding.completedAt',
        'Completion date',
        'completedAt',
        20,
      ),
      manualConfirmation(
        'onboarding.handoverComplete',
        'Handover complete',
        30,
      ),
    ],
  },
  {
    value: CustomerOnboardingStatus.BLOCKED,
    label: 'Blocked',
    description: 'Onboarding cannot continue until a blocker is resolved.',
    tone: 'danger',
    sortOrder: 70,
    isActive: true,
    isSystem: true,
    isTerminal: false,
    requiresReason: true,
    allowedNextStatuses: [
      CustomerOnboardingStatus.IN_PROGRESS,
      CustomerOnboardingStatus.CANCELED,
    ],
    criteria: [
      requiredField('onboarding.blockReason', 'Block reason', 'subStatus', 10),
      recommendedField('onboarding.blockNotes', 'Block notes', 'notes', 20),
    ],
  },
  {
    value: CustomerOnboardingStatus.CANCELED,
    label: 'Canceled',
    description: 'Onboarding was canceled before completion.',
    tone: 'danger',
    sortOrder: 80,
    isActive: true,
    isSystem: true,
    isTerminal: true,
    requiresReason: true,
    allowedNextStatuses: [],
    criteria: [
      requiredField(
        'onboarding.cancelReason',
        'Cancel reason',
        'subStatus',
        10,
      ),
      recommendedField('onboarding.cancelNotes', 'Cancel notes', 'notes', 20),
    ],
  },
] as const satisfies readonly LifecycleStageDefinition<CustomerOnboardingStatus>[];

export const LEAD_SUB_STATUS_OPTIONS = {
  [LeadStatus.NEW]: [
    'Awaiting response',
    'Demo requested',
    'Needs triage',
    'New website inquiry',
    'New manual entry',
  ],
  [LeadStatus.CONTACTED]: [
    'Awaiting response',
    'Discovery scheduled',
    'Discovery done',
    'Demo scheduled',
    'Pricing discussion',
    'Follow-up required',
  ],
  [LeadStatus.QUALIFIED]: [
    'Commercial review',
    'Proposal required',
    'Proposal sent',
    'Ready for customer conversion',
    'Follow-up later',
  ],
  [LeadStatus.UNQUALIFIED]: [
    'Not a fit',
    'Duplicate',
    'No budget',
    'Invalid contact',
    'Outside target market',
  ],
  [LeadStatus.CONVERTED]: ['Converted to customer'],
  [LeadStatus.CLOSED_LOST]: [
    'No budget',
    'Lost to competitor',
    'No decision',
    'Timeline not aligned',
    'Follow-up later',
  ],
  [LeadStatus.ARCHIVED]: ['Archived'],
} as const satisfies Record<LeadStatus, readonly string[]>;

export const CUSTOMER_SUB_STATUS_OPTIONS = {
  [CustomerAccountStatus.LEAD]: ['Imported', 'Converted from lead'],
  [CustomerAccountStatus.PROSPECT]: [
    'Commercial review',
    'Contract pending',
    'Awaiting approval',
    'Negotiation in progress',
    'Procurement review',
  ],
  [CustomerAccountStatus.ONBOARDING]: [
    'Awaiting onboarding docs',
    'Ready for onboarding',
    'Onboarding in progress',
    'Implementation review',
    'Training pending',
  ],
  [CustomerAccountStatus.ACTIVE]: [
    'Live',
    'Healthy',
    'Payment pending',
    'Expansion opportunity',
    'Renewal upcoming',
  ],
  [CustomerAccountStatus.SUSPENDED]: [
    'Billing hold',
    'Ops hold',
    'Compliance hold',
    'Customer requested pause',
  ],
  [CustomerAccountStatus.CHURNED]: [
    'Closed',
    'Renewal lost',
    'Customer migrated',
    'Non-payment closure',
  ],
  [CustomerAccountStatus.ARCHIVED]: ['Archived'],
} as const satisfies Record<CustomerAccountStatus, readonly string[]>;

export const CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS = {
  [CustomerOnboardingStatus.NOT_STARTED]: [
    'Awaiting kickoff',
    'Kickoff scheduled',
  ],
  [CustomerOnboardingStatus.IN_PROGRESS]: [
    'Configuration in progress',
    'Training pending',
    'Waiting on feature confirmation',
    'Branding setup',
    'Security setup',
    'User setup',
  ],
  [CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT]: [
    'Contract not signed',
    'Waiting on billing info',
    'Waiting on admin user details',
    'Waiting on branding assets',
    'Waiting on data template',
    'Data migration pending',
  ],
  [CustomerOnboardingStatus.PENDING_PAYMENT]: [
    'Invoice sent',
    'Payment review',
    'Payment failed',
    'Payment confirmation pending',
  ],
  [CustomerOnboardingStatus.READY_FOR_TENANT_CREATION]: [
    'Tenant setup pending',
    'Go-live ready',
    'Final review complete',
  ],
  [CustomerOnboardingStatus.COMPLETED]: [
    'Tenant created',
    'Live',
    'Handover completed',
  ],
  [CustomerOnboardingStatus.BLOCKED]: [
    'Blocked by customer',
    'Blocked internally',
    'Blocked by billing',
    'Blocked by compliance',
    'Blocked by technical issue',
  ],
  [CustomerOnboardingStatus.CANCELED]: [
    'Canceled',
    'Canceled by customer',
    'Canceled internally',
  ],
} as const satisfies Record<CustomerOnboardingStatus, readonly string[]>;

export const LEAD_SOURCE_OPTIONS = [
  { value: 'Website', label: 'Website' },
  { value: 'Manual Entry', label: 'Manual Entry' },
  { value: 'Sales Outreach', label: 'Sales Outreach' },
  { value: 'Referral', label: 'Referral' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Upwork', label: 'Upwork' },
  { value: 'Email Inquiry', label: 'Email Inquiry' },
  { value: 'WhatsApp Inquiry', label: 'WhatsApp Inquiry' },
  { value: 'Demo Request', label: 'Demo Request' },
  { value: 'Partner Referral', label: 'Partner Referral' },
  { value: 'Existing Customer', label: 'Existing Customer' },
  { value: 'Event / Exhibition', label: 'Event / Exhibition' },
  { value: 'Support Conversion', label: 'Support Conversion' },
  { value: 'Marketing Campaign', label: 'Marketing Campaign' },
  { value: 'Other', label: 'Other' },
] as const satisfies readonly LifecycleOption[];

export function normalizeLeadSource(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === 'DijiPeople Website') return 'Website';
  return trimmed;
}

export function isValidLeadSource(value?: string | null) {
  const normalized = normalizeLeadSource(value);
  if (!normalized) return true;

  return LEAD_SOURCE_OPTIONS.some((option) => option.value === normalized);
}

export const INDUSTRY_OPTIONS = [
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'IT / Software', label: 'IT / Software' },
  { value: 'Recruitment', label: 'Recruitment' },
  { value: 'Staffing', label: 'Staffing' },
  { value: 'Professional Services', label: 'Professional Services' },
  { value: 'Real Estate', label: 'Real Estate' },
  { value: 'Construction', label: 'Construction' },
  { value: 'Education', label: 'Education' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Hospitality', label: 'Hospitality' },
  { value: 'Manufacturing', label: 'Manufacturing' },
  { value: 'Financial Services', label: 'Financial Services' },
  { value: 'Government', label: 'Government' },
  { value: 'Nonprofit', label: 'Nonprofit' },
  { value: 'Other', label: 'Other' },
] as const satisfies readonly LifecycleOption[];

export const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1,000 employees' },
  { value: '1001-5000', label: '1,001-5,000 employees' },
  { value: '5000+', label: '5,000+ employees' },
] as const satisfies readonly LifecycleOption[];

export function getStageDefinition<TStatus extends string>(
  stages: readonly LifecycleStageDefinition<TStatus>[],
  status: string,
): LifecycleStageDefinition<TStatus> | null {
  return stages.find((stage) => stage.value === status) ?? null;
}

export function getLeadStageDefinition(status: string) {
  return getStageDefinition(LEAD_STATUS_OPTIONS, status);
}

export function getCustomerStageDefinition(status: string) {
  return getStageDefinition(CUSTOMER_STATUS_OPTIONS, status);
}

export function getCustomerOnboardingStageDefinition(status: string) {
  return getStageDefinition(CUSTOMER_ONBOARDING_STATUS_OPTIONS, status);
}

export function getEntityStageDefinition(
  entity: LifecycleEntity,
  status: string,
) {
  if (entity === 'lead') return getLeadStageDefinition(status);
  if (entity === 'customer') return getCustomerStageDefinition(status);
  return getCustomerOnboardingStageDefinition(status);
}

export function isValidTransition(
  entity: LifecycleEntity,
  currentStatus: string,
  nextStatus: string,
): boolean {
  if (currentStatus === nextStatus) return true;

  const currentStage = getEntityStageDefinition(entity, currentStatus);

  if (!currentStage) return false;
  if (currentStage.isTerminal) return false;

  return currentStage.allowedNextStatuses.includes(nextStatus as never);
}

export function getRequiredCriteria(
  entity: LifecycleEntity,
  status: string,
): LifecycleCriterion[] {
  const stage = getEntityStageDefinition(entity, status);

  if (!stage) return [];

  return stage.criteria
    .filter(
      (criterion) => criterion.isActive && criterion.severity === 'required',
    )
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

export function getRecommendedCriteria(
  entity: LifecycleEntity,
  status: string,
): LifecycleCriterion[] {
  const stage = getEntityStageDefinition(entity, status);

  if (!stage) return [];

  return stage.criteria
    .filter(
      (criterion) => criterion.isActive && criterion.severity === 'recommended',
    )
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

export function isLeadStatus(value: string): value is LeadStatus {
  return Object.values(LeadStatus).includes(value as LeadStatus);
}

export function isCustomerAccountStatus(
  value: string,
): value is CustomerAccountStatus {
  return Object.values(CustomerAccountStatus).includes(
    value as CustomerAccountStatus,
  );
}

export function isCustomerOnboardingStatus(
  value: string,
): value is CustomerOnboardingStatus {
  return Object.values(CustomerOnboardingStatus).includes(
    value as CustomerOnboardingStatus,
  );
}

export function isValidLeadSubStatus(
  status: string,
  subStatus?: string | null,
): boolean {
  if (!subStatus) return true;
  if (!isLeadStatus(status)) return false;

  return (LEAD_SUB_STATUS_OPTIONS[status] as readonly string[]).includes(
    subStatus,
  );
}

export function isValidCustomerSubStatus(
  status: string,
  subStatus?: string | null,
): boolean {
  if (!subStatus) return true;
  if (!isCustomerAccountStatus(status)) return false;

  return (CUSTOMER_SUB_STATUS_OPTIONS[status] as readonly string[]).includes(
    subStatus,
  );
}

export function isValidCustomerOnboardingSubStatus(
  status: string,
  subStatus?: string | null,
): boolean {
  if (!subStatus) return true;
  if (!isCustomerOnboardingStatus(status)) return false;

  return (
    CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[status] as readonly string[]
  ).includes(subStatus);
}

export function isValidSubStatus(
  entity: LifecycleEntity,
  status: string,
  subStatus?: string | null,
): boolean {
  if (!subStatus) return true;

  if (entity === 'lead') {
    return isValidLeadSubStatus(status, subStatus);
  }

  if (entity === 'customer') {
    return isValidCustomerSubStatus(status, subStatus);
  }

  return isValidCustomerOnboardingSubStatus(status, subStatus);
}

export function getSubStatusOptions(
  entity: LifecycleEntity,
  status: string,
): LifecycleOption[] {
  const values: readonly string[] =
    entity === 'lead' && isLeadStatus(status)
      ? LEAD_SUB_STATUS_OPTIONS[status]
      : entity === 'customer' && isCustomerAccountStatus(status)
        ? CUSTOMER_SUB_STATUS_OPTIONS[status]
        : entity === 'customerOnboarding' && isCustomerOnboardingStatus(status)
          ? CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[status]
          : [];

  return values.map((value) => ({
    value,
    label: value,
  }));
}

export function getDefaultSubStatus(
  entity: LifecycleEntity,
  status: string,
): string | null {
  return getSubStatusOptions(entity, status)[0]?.value ?? null;
}

export function getLifecycleOptions() {
  return {
    lead: {
      statuses: [...LEAD_STATUS_OPTIONS].sort(
        (first, second) => first.sortOrder - second.sortOrder,
      ),
      subStatuses: LEAD_SUB_STATUS_OPTIONS,
      sources: LEAD_SOURCE_OPTIONS,
    },
    customer: {
      statuses: [...CUSTOMER_STATUS_OPTIONS].sort(
        (first, second) => first.sortOrder - second.sortOrder,
      ),
      subStatuses: CUSTOMER_SUB_STATUS_OPTIONS,
    },
    customerOnboarding: {
      statuses: [...CUSTOMER_ONBOARDING_STATUS_OPTIONS].sort(
        (first, second) => first.sortOrder - second.sortOrder,
      ),
      subStatuses: CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS,
    },
    industries: INDUSTRY_OPTIONS,
    companySizes: COMPANY_SIZE_OPTIONS,
  };
}
