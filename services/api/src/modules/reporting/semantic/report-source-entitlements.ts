import {
  TENANT_FEATURE_KEYS,
  type TenantFeatureKey,
} from '../../../common/constants/tenant-features';

/**
 * Which capability each reporting data source belongs to.
 *
 * BUG-3007. The reporting catalog (`AnalyticsService.catalog`) used to filter
 * sources by permission alone, so a Starter tenant — entitled to `employees`,
 * `organization`, `leave`, `attendance`, `documents`, `notifications` and
 * `branding` but not `recruitment` or `desktop-agent` — was offered a full
 * Recruitment analytics workbench and a Desktop activity surface, plus the six
 * standard reports built on them, for two modules it never bought. The sidebar
 * correctly hid Recruitment; Reports did not.
 *
 * This is the same shape as `SETTINGS_ITEM_ENTITLEMENTS` /
 * `isSettingsItemEntitled` in `apps/web/app/(authenticated)/settings/_lib/
 * settings-entitlements.ts`, which fixed the identical defect on the settings
 * information architecture (BUG-2958): an explicit attribution from every item
 * to one capability key, held apart from the item registry so a spec can
 * compare the two structures and fail the build when a new source ships
 * unattributed — `report-source-entitlements.spec.ts` does that here by
 * checking this map's keys against `listDataSources()`.
 *
 * Unlike the settings map there is no `CORE` marker in use today: every
 * reporting data source corresponds to a real, sellable capability, including
 * the two — `workforce` and `workforce_history` — that read as foundational.
 * `employees` is itself a plan feature key (`plans.catalog.ts` lists it
 * explicitly on every catalog plan, Starter included), not an unconditional
 * default, so attributing workforce reporting to it is the same choice
 * `settings-entitlements.ts` made for `designations` and
 * `employment-types`. The type still allows a future `CORE` source; nothing
 * requires one to exist.
 */
export const REPORT_SOURCE_CORE = 'CORE' as const;

export type ReportSourceEntitlement =
  | TenantFeatureKey
  | typeof REPORT_SOURCE_CORE;

export const REPORT_SOURCE_ENTITLEMENTS: Record<
  string,
  ReportSourceEntitlement
> = {
  workforce: TENANT_FEATURE_KEYS.EMPLOYEES,
  workforce_history: TENANT_FEATURE_KEYS.EMPLOYEES,
  attendance: TENANT_FEATURE_KEYS.ATTENDANCE,
  leave_requests: TENANT_FEATURE_KEYS.LEAVE,
  leave_consumption: TENANT_FEATURE_KEYS.LEAVE,
  leave_balances: TENANT_FEATURE_KEYS.LEAVE,
  recruitment_openings: TENANT_FEATURE_KEYS.RECRUITMENT,
  recruitment_candidates: TENANT_FEATURE_KEYS.RECRUITMENT,
  recruitment_applications: TENANT_FEATURE_KEYS.RECRUITMENT,
  recruitment_stage_transitions: TENANT_FEATURE_KEYS.RECRUITMENT,
  desktop_activity: TENANT_FEATURE_KEYS.DESKTOP_AGENT,
  desktop_devices: TENANT_FEATURE_KEYS.DESKTOP_AGENT,
};

/**
 * Whether a reporting data source is included in the tenant's resolved plan.
 *
 * `enabledFeatureKeys` is `FeatureAccessService.getResolvedTenantFeatures`'s
 * `enabledKeys` — plan features intersected with the tenant's own overrides,
 * the same resolution the settings tree and the Apps & Modules page use.
 *
 * An unmapped source key denies, exactly as `isSettingsItemEntitled` denies an
 * unmapped settings item: the spec makes that unreachable in a built registry,
 * but at runtime a source nobody attributed is an unanswered commercial
 * question, and the safe answer to an unanswered question about what a
 * customer bought is "no".
 */
export function isReportSourceEntitled(
  sourceKey: string,
  enabledFeatureKeys: readonly string[],
): boolean {
  const entitlement = REPORT_SOURCE_ENTITLEMENTS[sourceKey];

  if (entitlement === undefined) return false;
  if (entitlement === REPORT_SOURCE_CORE) return true;

  return enabledFeatureKeys.includes(entitlement);
}
