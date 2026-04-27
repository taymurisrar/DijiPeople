import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';

export const DEFAULT_PLAN_DEFINITIONS = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Core people operations for growing teams.',
    sortOrder: 10,
    monthlyBasePrice: 199,
    annualBasePrice: 1990,
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
    description: 'Adds delivery and talent workflows for scaling organizations.',
    sortOrder: 20,
    monthlyBasePrice: 399,
    annualBasePrice: 3990,
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
    description: 'Full platform access with payroll and advanced operations modules.',
    sortOrder: 30,
    monthlyBasePrice: 899,
    annualBasePrice: 8990,
    currency: 'USD',
    enabledFeatureKeys: TENANT_FEATURE_DEFINITIONS.map((feature) => feature.key),
  },
] as const;

export const DEFAULT_PLAN_KEY = 'starter';
