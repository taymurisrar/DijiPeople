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
  DESKTOP_AGENT: 'desktop-agent',
  ATTENDANCE_INTEGRATIONS: 'attendance-integrations',
  COMPLIANCE: 'compliance',
  DATA_MANAGEMENT: 'data-management',
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
  'data-management': TENANT_FEATURE_KEYS.DATA_MANAGEMENT,
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
 * Controllers gated one by one inside a module that is NOT gated as a whole
 * (DP-QA-010). The tenant-admin surface of a paid feature is refused for a plan
 * that does not sell it; the machine-facing surface beside it is not, because a
 * deployed gateway or desktop agent cannot be upgraded past a refusal and
 * dropping its sync would break attendance a tenant did buy.
 *
 * Keyed by exported class name. `entitlement-wiring.invariants.spec.ts` reads
 * the real Nest metadata and fails on any disagreement with this register.
 */
export const ENTITLEMENT_GATED_CONTROLLERS: Readonly<
  Record<string, TenantFeatureKey>
> = {
  AgentController: TENANT_FEATURE_KEYS.DESKTOP_AGENT,
  AuditController: TENANT_FEATURE_KEYS.COMPLIANCE,
  AttendanceConnectorsController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
  AttendanceDeviceController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
  AttendanceIntegrationController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
  AttendanceOperationsController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
  GatewayAdminController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
  WorkSiteReadinessController: TENANT_FEATURE_KEYS.ATTENDANCE_INTEGRATIONS,
};

/** Controllers that must stay open whatever the plan, and why. */
export const ENTITLEMENT_OPEN_CONTROLLERS: Readonly<Record<string, string>> = {
  GatewayRuntimeController:
    'Called by an on-premise gateway already dialling a customer network; refusing it is an integration break, not a commercial one.',
  GatewayServiceController:
    'Gateway pairing and service calls authenticate with a gateway credential, not a tenant user, so there is no tenant to evaluate.',
  PlatformAuditController:
    'Platform-operator audit history; a platform subject is not a tenant using a plan.',
};

/** Every feature key some route guard answers for, however it is attached. */
export const ENTITLEMENT_GATED_FEATURE_KEYS: readonly TenantFeatureKey[] =
  Array.from(
    new Set<TenantFeatureKey>([
      ...Object.values(ENTITLEMENT_GATED_MODULES),
      ...Object.values(ENTITLEMENT_GATED_CONTROLLERS),
    ]),
  );

/**
 * Feature keys that no gated module answers for, and why.
 *
 * The catalog is the list of capabilities a plan can withhold, so every key in
 * it is a commercial boundary somebody had to decide about. This is where the
 * decision "not this one" is written down, and `tenant-features.spec.ts`
 * asserts the two registers together cover the catalog exactly.
 *
 * A capability added to the catalog later therefore fails a test until someone
 * chooses. It cannot ship silently ungated — which is precisely how the whole
 * entitlement layer came to gate nothing (BUG-1952).
 */
export const ENTITLEMENT_UNGATED_FEATURE_KEYS: Readonly<
  Partial<Record<TenantFeatureKey, string>>
> = {
  [TENANT_FEATURE_KEYS.EMPLOYEES]:
    'Enabled on every shipped plan, and the substrate every other module reads through.',
  [TENANT_FEATURE_KEYS.ORGANIZATION]:
    'Enabled on every shipped plan, and read by everything.',
  [TENANT_FEATURE_KEYS.DOCUMENTS]:
    'Cross-cutting: it holds references owned by other modules rather than being bought on its own.',
  [TENANT_FEATURE_KEYS.NOTIFICATIONS]:
    'Delivery infrastructure, invoked by modules rather than bought by a tenant.',
  [TENANT_FEATURE_KEYS.BRANDING]:
    'A settings surface rather than a route module; enforced where settings resolve.',
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
    'Gated controller by controller (ENTITLEMENT_GATED_CONTROLLERS), not as a module: the gateway runtime and service controllers carry no tenant user, and refusing a deployed on-premise gateway is an integration break rather than a commercial one.',
  agent:
    'Gated as a controller (ENTITLEMENT_GATED_CONTROLLERS); its three public auth routes carry no tenant and pass the guard.',
  benefits:
    'No feature key sells it. Whether it belongs to the payroll entitlement is a product decision this record did not make; gating it would make one silently.',
  claims: 'No feature key sells it — same reasoning as benefits.',
  loans: 'No feature key sells it — same reasoning as benefits.',
  'business-trips': 'No feature key sells it — same reasoning as benefits.',
};
