/**
 * Tenant feature keys — the units a plan is sold in.
 *
 * These are the same strings as `TENANT_FEATURE_DEFINITIONS` in
 * `modules/tenant-settings/tenant-settings.catalog.ts`, which stays the
 * authoritative catalog: it owns the labels, descriptions, icons and ordering
 * that the platform-admin module screen renders. This file exists because
 * `common/` must not import from a domain module to type a guard, and because a
 * union type is what makes `@RequireEntitlement('payrol')` a compile error
 * rather than an endpoint that silently never matches.
 *
 * The two are not allowed to drift: `tenant-features.spec.ts` asserts this list
 * is exactly the catalog's key set, in both directions.
 */
export const TENANT_FEATURE_KEYS = {
  EMPLOYEES: 'employees',
  ORGANIZATION: 'organization',
  LEAVE: 'leave',
  ATTENDANCE: 'attendance',
  TIMESHEETS: 'timesheets',
  PROJECTS: 'projects',
  RECRUITMENT: 'recruitment',
  ONBOARDING: 'onboarding',
  DOCUMENTS: 'documents',
  NOTIFICATIONS: 'notifications',
  BRANDING: 'branding',
  PAYROLL: 'payroll',
} as const;

export type TenantFeatureKey =
  (typeof TENANT_FEATURE_KEYS)[keyof typeof TENANT_FEATURE_KEYS];

export const TENANT_FEATURE_KEY_LIST = Object.values(
  TENANT_FEATURE_KEYS,
) as readonly TenantFeatureKey[];

export function isTenantFeatureKey(value: string): value is TenantFeatureKey {
  return (TENANT_FEATURE_KEY_LIST as readonly string[]).includes(value);
}

/**
 * Which API module directories are gated, and under which feature key.
 *
 * This is the contract `entitlement-wiring.invariants.spec.ts` enforces: every
 * controller under a directory named here must carry `EntitlementGuard` and a
 * `@RequireEntitlement` naming that key, and no controller outside it may carry
 * the decorator. BUG-1952 was a primitive that existed and was never called —
 * the invariant is what stops the same thing happening one controller at a time.
 */
export const ENTITLEMENT_GATED_MODULES: Readonly<
  Record<string, TenantFeatureKey>
> = {
  attendance: TENANT_FEATURE_KEYS.ATTENDANCE,
  'attendance-engine': TENANT_FEATURE_KEYS.ATTENDANCE,
  compensation: TENANT_FEATURE_KEYS.PAYROLL,
  leave: TENANT_FEATURE_KEYS.LEAVE,
  onboarding: TENANT_FEATURE_KEYS.ONBOARDING,
  'pay-components': TENANT_FEATURE_KEYS.PAYROLL,
  payroll: TENANT_FEATURE_KEYS.PAYROLL,
  payslips: TENANT_FEATURE_KEYS.PAYROLL,
  projects: TENANT_FEATURE_KEYS.PROJECTS,
  recruitment: TENANT_FEATURE_KEYS.RECRUITMENT,
  'tax-rules': TENANT_FEATURE_KEYS.PAYROLL,
  'time-payroll': TENANT_FEATURE_KEYS.PAYROLL,
  timesheets: TENANT_FEATURE_KEYS.TIMESHEETS,
};

/**
 * Modules deliberately left ungated, and why.
 *
 * Recorded rather than omitted, because "this module has no entitlement check"
 * reads identically whether it was decided or forgotten — and BUG-1952 is what
 * forgetting looks like at scale. Only modules a reader would reasonably expect
 * to find gated are listed; the sixty-odd modules with no feature key at all
 * (`auth`, `users`, `approvals`, `reports`, every `platform-*`) are not.
 */
export const ENTITLEMENT_UNGATED_MODULES: Readonly<Record<string, string>> = {
  employees:
    'Enabled on every plan, and the substrate every other module reads through. Gating it buys no revenue enforcement and turns any resolver fault into a total outage.',
  organization: 'Same as employees: enabled on every plan, read by everything.',
  documents:
    'Cross-cutting. It holds references owned by other modules rather than being a capability a tenant buys on its own.',
  notifications:
    'Delivery infrastructure, invoked by modules rather than bought by a tenant.',
  branding:
    'A settings surface rather than a route module; enforced where settings resolve, not by a route gate.',
  'attendance-integrations':
    'The .NET gateway contract. Two of its controllers carry no AuthenticatedUser at all, and refusing a deployed on-premise gateway is an integration break rather than a commercial one. The attendance key is enabled on every plan, so nothing is lost.',
  agent: 'The desktop agent client surface, for the same reason.',
  benefits:
    'No feature key sells it. Whether it belongs to the payroll entitlement is a product decision this record did not make; gating it would make one silently.',
  claims: 'No feature key sells it — same reasoning as benefits.',
  loans: 'No feature key sells it — same reasoning as benefits.',
  'business-trips': 'No feature key sells it — same reasoning as benefits.',
};
