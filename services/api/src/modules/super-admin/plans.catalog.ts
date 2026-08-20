import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';

/*
 * Plan definitions seeded on a fresh platform.
 *
 * **`monthlyBasePrice` / `annualBasePrice` are deprecated and display-only.**
 * BUG-0027 removed them from the money path: `super-admin/billing.service.ts`
 * used to fall back to them when no `PlanPrice` resolved, writing an invented
 * number straight into `Subscription.basePrice`. It now fails closed instead,
 * and `plan-change.service.ts:290` says in as many words that nothing may read
 * these columns to decide what a customer pays.
 *
 * They carry the International flat monthly figure so an operator glancing at
 * the Admin plan list sees a recognisable number rather than a placeholder. The
 * authoritative schedule — three markets, two cycles, two billing models — is
 * `pricing.catalog.ts`, and it is the only thing anybody is charged from.
 *
 * They used to read 199 / 399 / 899, invented for testing before any real
 * schedule existed.
 */
export const DEFAULT_PLAN_DEFINITIONS = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Core people operations for growing teams.',
    sortOrder: 10,
    monthlyBasePrice: 69,
    annualBasePrice: 690,
    currency: 'USD',
    enabledFeatureKeys: [
      'employees',
      'organization',
      'leave',
      'attendance',
      'documents',
      'notifications',
      'branding',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    description:
      'Adds delivery and talent workflows for scaling organizations.',
    sortOrder: 20,
    monthlyBasePrice: 165,
    annualBasePrice: 1650,
    currency: 'USD',
    enabledFeatureKeys: [
      'employees',
      'organization',
      'leave',
      'attendance',
      'timesheets',
      'projects',
      'recruitment',
      'onboarding',
      'documents',
      'notifications',
      'branding',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description:
      'Full platform access with payroll and advanced operations modules.',
    sortOrder: 30,
    monthlyBasePrice: 385,
    annualBasePrice: 3850,
    currency: 'USD',
    enabledFeatureKeys: TENANT_FEATURE_DEFINITIONS.map(
      (feature) => feature.key,
    ),
  },
  {
    key: 'enterprise-plus',
    name: 'Enterprise+',
    description:
      'Above 250 employees. Commercial terms are agreed per customer.',
    sortOrder: 40,
    /*
     * Zero, and zero here means "there is no list price" rather than "free".
     *
     * `bootstrapCommercialDefaults` skips any price slot whose amount is <= 0,
     * so this plan gets no `PlanPrice` row at all — which is what makes the
     * offer resolver answer `CUSTOM_CONTRACT_ONLY` instead of quoting a figure.
     * That is the honest response to "what does Enterprise+ cost": ask us.
     */
    monthlyBasePrice: 0,
    annualBasePrice: 0,
    currency: 'USD',
    enabledFeatureKeys: TENANT_FEATURE_DEFINITIONS.map(
      (feature) => feature.key,
    ),
  },
] as const;

export const DEFAULT_PLAN_KEY = 'starter';
