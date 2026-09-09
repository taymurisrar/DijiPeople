import { FEATURE_KEYS, type FeatureKey } from "@/lib/security-keys";

/*
 * Which capability each settings page belongs to.
 *
 * The Configuration workspace used to be resolved from permissions and roles
 * alone, so a tenant on a plan without Payroll was still offered the whole
 * Payroll & Finance tree — eighteen pages configuring a module it had not
 * bought (BUG-1952). This map is the missing third input.
 *
 * ## CORE is a declaration, not a default
 *
 * `CORE` means "no plan gates this page; it renders on every subscription". It
 * is written out for every such item rather than inferred from absence, because
 * the failure mode worth preventing is a *new* settings page that nobody
 * attributed. If absence meant core, that page would silently be free forever.
 * `settings-entitlements.spec.ts` fails the build when a runtime settings item
 * is missing here, so adding a settings page forces the question to be
 * answered. It compares against `settingsRuntimeItems` — the built item set —
 * rather than against `itemPlacement`, which is only a placement lookup: it
 * carries keys for pages that no longer exist and misses pages that fall
 * through to `defaultPlacement`. Auditing the lookup instead of the items is
 * how `subscription`, `sidebar` and `data-management` were missed on the first
 * pass of this map.
 *
 * ## Why the map lives beside the IA rather than inside it
 *
 * Two structures, compared by a spec, catch a drift that one structure cannot:
 * if the attribution were a field on the placement tuple, a wrong value would
 * still be a well-formed tuple. Here, an item present in one and absent from
 * the other is a build failure.
 *
 * ## The audit this encodes
 *
 * Attribution was decided item by item, not category by category, and two rows
 * are why.
 *
 * `timesheets` sits beside an entitled `attendance` in People > Attendance &
 * Time, so its group and its category both survive a Starter plan and only the
 * one row may go. `payroll-regions` is the only member of Regional Operations >
 * Payroll Geography, so its group collapses inside a category that belongs to
 * every plan. A category-level map would have left both in place, which is
 * exactly what the reported screenshot showed.
 *
 * The reverse mistake is `subscription`, below: attributing a whole category
 * would have hidden a Starter tenant's own billing page behind Payroll.
 */
export const SETTINGS_CORE = "CORE" as const;

export type SettingsEntitlement = FeatureKey | typeof SETTINGS_CORE;

export const SETTINGS_ITEM_ENTITLEMENTS: Record<string, SettingsEntitlement> = {
  // ---------------------------------------------------------------- General Setup
  tenant: SETTINGS_CORE,
  organizations: FEATURE_KEYS.ORGANIZATION,
  "business-units": FEATURE_KEYS.ORGANIZATION,
  departments: FEATURE_KEYS.ORGANIZATION,
  "organization-teams": FEATURE_KEYS.ORGANIZATION,
  /*
   * Import & Export. Core: it moves the tenant's own data, and the modules it
   * can reach are already gated individually.
   */
  "data-management": SETTINGS_CORE,
  recruitment: FEATURE_KEYS.RECRUITMENT,
  /*
   * Sold separately from Attendance as of ADR-0031-B. This gates the settings
   * page only — installers, enrolment keys and agent policy. The agent's own
   * sync endpoints stay on `attendance`, so no deployed agent stops working
   * when a tenant's plan lacks this key.
   */
  "desktop-agent": FEATURE_KEYS.DESKTOP_AGENT,

  // ---------------------------------------------------------- People Configuration
  designations: FEATURE_KEYS.EMPLOYEES,
  "employment-types": FEATURE_KEYS.EMPLOYEES,
  "employee-settings": FEATURE_KEYS.EMPLOYEES,
  "employee-levels": FEATURE_KEYS.EMPLOYEES,
  /*
   * Work Management is core on every plan.
   *
   * Shifts and work schedules look like attendance, and holiday calendars look
   * like leave, but all five are shared master data: a holiday calendar drives
   * leave accrual on a plan with no attendance, and a work site is an employee
   * field before it is a geofence. Attributing them narrowly would hide
   * configuration a Starter tenant genuinely uses.
   */
  locations: SETTINGS_CORE,
  "work-calendars": SETTINGS_CORE,
  "holiday-calendars": SETTINGS_CORE,
  shifts: SETTINGS_CORE,
  "work-schedules": SETTINGS_CORE,
  attendance: FEATURE_KEYS.ATTENDANCE,
  timesheets: FEATURE_KEYS.TIMESHEETS,
  "document-categories": FEATURE_KEYS.DOCUMENTS,
  documents: FEATURE_KEYS.DOCUMENTS,
  /*
   * Moved out of Payroll & Finance by ADR-0031-D. It reads generic document
   * templating from the settings runtime and has no payroll dependency; leaving
   * it attributed to `payroll` would have taken document templating away from
   * every plan that bought Documents but not Payroll.
   */
  "document-templates": FEATURE_KEYS.DOCUMENTS,
  "leave-types": FEATURE_KEYS.LEAVE,
  "leave-policies": FEATURE_KEYS.LEAVE,

  // --------------------------------------------------------- Regional Operations
  "payroll-regions": FEATURE_KEYS.PAYROLL,
  countries: SETTINGS_CORE,
  states: SETTINGS_CORE,
  cities: SETTINGS_CORE,
  timezones: SETTINGS_CORE,
  currencies: SETTINGS_CORE,
  /*
   * Core despite reading as payroll. A fiscal year scopes leave accrual periods
   * and reporting ranges as well as pay periods, and a tenant with no payroll
   * still needs one. ADR-0031-C.
   */
  "fiscal-years": SETTINGS_CORE,

  // ------------------------------------------------------------ Security & Access
  users: SETTINGS_CORE,
  roles: SETTINGS_CORE,
  permissions: SETTINGS_CORE,
  "access-teams": SETTINGS_CORE,
  "field-security": SETTINGS_CORE,
  "password-login-policies": SETTINGS_CORE,
  "login-history": SETTINGS_CORE,

  // ------------------------------------------------------- Approvals & Workflows
  /*
   * Core because Starter buys Leave, and leave requests route through these
   * pages. Approvals is not one of the thirteen capabilities and gating it
   * would break the cheapest plan's headline feature.
   */
  "approval-matrices": SETTINGS_CORE,
  "delegation-rules": SETTINGS_CORE,
  "escalation-rules": SETTINGS_CORE,
  "workflow-templates": SETTINGS_CORE,
  "policy-engine": SETTINGS_CORE,

  // ------------------------------------------------------------ Payroll & Finance
  /*
   * CORE, despite living in the payroll category — and this row is the reason
   * an attribution audit had to be done item by item.
   *
   * `subscription` has no `itemPlacement` entry, so it falls through to
   * `defaultPlacement` and lands in Payroll & Finance > Payroll Configuration.
   * It is the tenant's own subscription: what plan they are on, what it costs,
   * what an upgrade would add. Attributing the category rather than the item
   * would have hidden a Starter tenant's billing page behind the very
   * capability they would go there to buy.
   *
   * The misplacement itself is a pre-existing IA fault and is not corrected
   * here — moving it changes a live URL, which is its own change. Filed as a
   * finding on this task.
   */
  subscription: SETTINGS_CORE,
  "payroll-periods": FEATURE_KEYS.PAYROLL,
  "pay-components": FEATURE_KEYS.PAYROLL,
  "claim-types": FEATURE_KEYS.PAYROLL,
  "travel-allowance-policies": FEATURE_KEYS.PAYROLL,
  "time-payroll-policies": FEATURE_KEYS.PAYROLL,
  "overtime-policies": FEATURE_KEYS.PAYROLL,
  "tax-rules": FEATURE_KEYS.PAYROLL,
  "employee-tax-profiles": FEATURE_KEYS.PAYROLL,
  "gl-accounts": FEATURE_KEYS.PAYROLL,
  "posting-rules": FEATURE_KEYS.PAYROLL,
  "payroll-settings": FEATURE_KEYS.PAYROLL,
  "salary-package-rules": FEATURE_KEYS.PAYROLL,
  "benefit-policies": FEATURE_KEYS.PAYROLL,
  "loan-policies": FEATURE_KEYS.PAYROLL,
  "payroll-banks": FEATURE_KEYS.PAYROLL,
  "employer-bank-accounts": FEATURE_KEYS.PAYROLL,

  // ------------------------------------------------ Notifications & Communication
  notifications: FEATURE_KEYS.NOTIFICATIONS,
  "notification-email-templates": FEATURE_KEYS.NOTIFICATIONS,
  "notification-email-providers": FEATURE_KEYS.NOTIFICATIONS,
  "notification-email-logs": FEATURE_KEYS.NOTIFICATIONS,

  // ----------------------------------------------------- Appearance & Experience
  branding: FEATURE_KEYS.BRANDING,
  "system-preferences": SETTINGS_CORE,

  // ---------------------------------------------------------- Audit & Compliance
  "audit-logs": SETTINGS_CORE,
  "data-access-history": SETTINGS_CORE,
  "retention-rules": SETTINGS_CORE,
  "compliance-exports": SETTINGS_CORE,

  // ------------------------------------------------------------- Customization
  /*
   * Free on every plan, by decision rather than by omission (ADR-0031-E).
   *
   * These nine are the most Enterprise-shaped pages in Settings and there is a
   * commercial case for selling them. Carving them out later means a fourteenth
   * capability key AND a backfill for every tenant that has already built
   * customizations, because a plan without the key would otherwise hide work
   * they have already done. That is a deliberate future change, not something
   * to arrive at by leaving them unattributed.
   */
  tables: SETTINGS_CORE,
  fields: SETTINGS_CORE,
  forms: SETTINGS_CORE,
  views: SETTINGS_CORE,
  "action-bars": SETTINGS_CORE,
  widgets: SETTINGS_CORE,
  sidebar: SETTINGS_CORE,
  packages: SETTINGS_CORE,
  "publish-center": SETTINGS_CORE,

  // ------------------------------------------------------------- Integrations
  "attendance-integrations-overview": FEATURE_KEYS.ATTENDANCE,
  "attendance-integrations": FEATURE_KEYS.ATTENDANCE,
  "attendance-devices": FEATURE_KEYS.ATTENDANCE,
  "attendance-employee-mapping": FEATURE_KEYS.ATTENDANCE,
  "attendance-provisioning": FEATURE_KEYS.ATTENDANCE,
  "attendance-sync-history": FEATURE_KEYS.ATTENDANCE,
  "attendance-gateways": FEATURE_KEYS.ATTENDANCE,
  /*
   * Core, not `desktop-agent`. This page lists every downloadable client, and a
   * tenant on a plan without the agent still needs the page to exist so it can
   * see what it would get. The Desktop Agent settings page is the gated one.
   */
  "apps-downloads": SETTINGS_CORE,
};

/*
 * Human labels for the capability keys, for the "not included in your plan"
 * state. Mirrors the `label` field of the API's `TENANT_FEATURE_DEFINITIONS`;
 * the API's copy is authoritative and is what the Apps & Modules page renders,
 * this one exists so a blocked settings page can name what is missing without a
 * round trip.
 */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  [FEATURE_KEYS.EMPLOYEES]: "Employees",
  [FEATURE_KEYS.ORGANIZATION]: "Organization",
  [FEATURE_KEYS.LEAVE]: "Leave",
  [FEATURE_KEYS.ATTENDANCE]: "Attendance",
  [FEATURE_KEYS.TIMESHEETS]: "Timesheets",
  [FEATURE_KEYS.PROJECTS]: "Projects",
  [FEATURE_KEYS.PAYROLL]: "Payroll",
  [FEATURE_KEYS.RECRUITMENT]: "Recruitment",
  [FEATURE_KEYS.ONBOARDING]: "Onboarding",
  [FEATURE_KEYS.DOCUMENTS]: "Documents",
  [FEATURE_KEYS.NOTIFICATIONS]: "Notifications",
  [FEATURE_KEYS.BRANDING]: "Branding",
  [FEATURE_KEYS.DESKTOP_AGENT]: "Desktop Agent",
};

/**
 * The capabilities a set of settings items needs, as labels, without repeats.
 *
 * Used to tell a blocked visitor which capability is missing. A group can span
 * more than one, so this returns all of them in the order they appear rather
 * than picking the first and hoping it is representative.
 */
export function missingCapabilityLabels(
  itemKeys: readonly string[],
  enabledFeatureKeys: readonly string[],
): string[] {
  const labels: string[] = [];

  for (const itemKey of itemKeys) {
    const entitlement = SETTINGS_ITEM_ENTITLEMENTS[itemKey];
    if (entitlement === undefined || entitlement === SETTINGS_CORE) continue;
    if (enabledFeatureKeys.includes(entitlement)) continue;

    const label = FEATURE_LABELS[entitlement];
    if (!labels.includes(label)) labels.push(label);
  }

  return labels;
}

/**
 * Whether a settings item is included in the tenant's plan.
 *
 * `enabledFeatureKeys` is the resolved entitlement set from
 * `GET /tenant-settings/features/availability` — plan features intersected with
 * the tenant's own overrides. It is deliberately **not** nullable here: a caller
 * that has not resolved entitlements must not reach this function and quietly
 * receive `true`. `resolveVisibleSettingsRuntime` enforces that at its own
 * boundary by throwing, so a fetch failure surfaces as an error state rather
 * than as an unlocked settings tree.
 */
export function isSettingsItemEntitled(
  itemKey: string,
  enabledFeatureKeys: readonly string[],
): boolean {
  const entitlement = SETTINGS_ITEM_ENTITLEMENTS[itemKey];

  /*
   * An unmapped item denies. The spec makes this unreachable in a built tree,
   * but the two structures can only be compared at test time — at runtime an
   * item nobody attributed is an unanswered commercial question, and the safe
   * answer to an unanswered question about what a customer bought is "no".
   */
  if (entitlement === undefined) return false;
  if (entitlement === SETTINGS_CORE) return true;

  return enabledFeatureKeys.includes(entitlement);
}
