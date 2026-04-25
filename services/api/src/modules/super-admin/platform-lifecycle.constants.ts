import {
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  LeadStatus,
} from '@prisma/client';

export const LEAD_SUB_STATUS_OPTIONS: Record<LeadStatus, string[]> = {
  [LeadStatus.NEW]: ['Awaiting response', 'Demo requested', 'Needs triage'],
  [LeadStatus.CONTACTED]: [
    'Awaiting response',
    'Discovery done',
    'Demo scheduled',
    'Pricing discussion',
  ],
  [LeadStatus.QUALIFIED]: [
    'Commercial review',
    'Ready for customer conversion',
    'Follow-up later',
  ],
  [LeadStatus.UNQUALIFIED]: ['Not a fit', 'Duplicate', 'No budget'],
  [LeadStatus.CONVERTED]: ['Converted to customer'],
  [LeadStatus.CLOSED_LOST]: ['No budget', 'Lost to competitor', 'Follow-up later'],
  [LeadStatus.ARCHIVED]: ['Archived'],
};

export const CUSTOMER_SUB_STATUS_OPTIONS: Record<CustomerAccountStatus, string[]> = {
  [CustomerAccountStatus.LEAD]: ['Imported'],
  [CustomerAccountStatus.PROSPECT]: [
    'Commercial review',
    'Contract pending',
    'Awaiting approval',
  ],
  [CustomerAccountStatus.ONBOARDING]: [
    'Awaiting onboarding docs',
    'Ready for onboarding',
    'Onboarding in progress',
  ],
  [CustomerAccountStatus.ACTIVE]: ['Live', 'Healthy', 'Payment pending'],
  [CustomerAccountStatus.SUSPENDED]: ['Billing hold', 'Ops hold'],
  [CustomerAccountStatus.CHURNED]: ['Closed', 'Renewal lost'],
  [CustomerAccountStatus.ARCHIVED]: ['Archived'],
};

export const CUSTOMER_Onboarding_SUB_STATUS_OPTIONS: Record<
  CustomerOnboardingStatus,
  string[]
> = {
  [CustomerOnboardingStatus.NOT_STARTED]: ['Awaiting kickoff'],
  [CustomerOnboardingStatus.IN_PROGRESS]: [
    'Configuration in progress',
    'Training pending',
    'Waiting on feature confirmation',
  ],
  [CustomerOnboardingStatus.AWAITING_CUSTOMER_INPUT]: [
    'Contract not signed',
    'Waiting on billing info',
    'Waiting on admin user details',
    'Data migration pending',
  ],
  [CustomerOnboardingStatus.PENDING_PAYMENT]: ['Invoice sent', 'Payment review'],
  [CustomerOnboardingStatus.READY_FOR_TENANT_CREATION]: [
    'Tenant setup pending',
    'Go-live ready',
  ],
  [CustomerOnboardingStatus.COMPLETED]: ['Tenant created', 'Live'],
  [CustomerOnboardingStatus.BLOCKED]: ['Blocked by customer', 'Blocked internally'],
  [CustomerOnboardingStatus.CANCELED]: ['Canceled'],
};

export const INDUSTRY_OPTIONS = [
  'Healthcare',
  'IT / Software',
  'Recruitment',
  'Staffing',
  'Professional Services',
  'Other',
] as const;

export const COMPANY_SIZE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+',
] as const;

export function isValidSubStatus(
  entity: 'lead' | 'customer' | 'customerOnboarding',
  status: string,
  subStatus?: string | null,
) {
  if (!subStatus) {
    return true;
  }

  const options =
    entity === 'lead'
      ? LEAD_SUB_STATUS_OPTIONS[status as LeadStatus]
      : entity === 'customer'
        ? CUSTOMER_SUB_STATUS_OPTIONS[status as CustomerAccountStatus]
        : CUSTOMER_Onboarding_SUB_STATUS_OPTIONS[
            status as CustomerOnboardingStatus
          ];

  return Array.isArray(options) && options.includes(subStatus);
}

export function getLifecycleOptions() {
  return {
    lead: {
      statuses: Object.values(LeadStatus),
      subStatuses: LEAD_SUB_STATUS_OPTIONS,
    },
    customer: {
      statuses: Object.values(CustomerAccountStatus),
      subStatuses: CUSTOMER_SUB_STATUS_OPTIONS,
    },
    customerOnboarding: {
      statuses: Object.values(CustomerOnboardingStatus),
      subStatuses: CUSTOMER_Onboarding_SUB_STATUS_OPTIONS,
    },
    industries: [...INDUSTRY_OPTIONS],
    companySizes: [...COMPANY_SIZE_OPTIONS],
  };
}
