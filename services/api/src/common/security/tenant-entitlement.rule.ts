import { SubscriptionStatus } from '@prisma/client';

/**
 * The one implementation of "is this module on for this tenant".
 *
 * It was previously inline in `FeatureAccessService.getResolvedTenantFeatures`
 * and nowhere else, because nothing enforced entitlement (BUG-1952). Now that a
 * guard resolves it on the request path too, the rule has to live in one place —
 * a second copy that disagreed by one boolean would be a commercial boundary
 * that means different things depending on which code path reached it.
 */

/**
 * Plan entitlement counts only while the subscription is live.
 *
 * A lapsed subscription therefore resolves to "nothing entitled", which is what
 * the platform-admin module screen shows. Note that the *guard* deliberately
 * does not refuse on this basis — see `TenantEntitlementService`. Losing every
 * module over an unpaid invoice is a dunning decision with its own notice
 * period, not an entitlement decision.
 */
export function isSubscriptionLive(
  status: SubscriptionStatus | null | undefined,
): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING
  );
}

/**
 * Effective state for one feature: plan entitlement AND tenant override, with a
 * missing override meaning "follow the plan".
 *
 * The consequence worth being explicit about is that an ordinary (plan-capped)
 * override cannot grant what the plan does not sell. `TenantModulesService.update`
 * rejects such a write rather than storing one that would never take effect,
 * but the rule holds here regardless of how a row got into the table.
 *
 * `overrideIsPlanCapped` is the one exception, and it exists for exactly one
 * caller: the BUG-3350 grandfathering migration. Switching entitlement
 * enforcement from `REPORT_ONLY` to `ENFORCE` must not cut off a tenant
 * already using a module its plan does not sell — that is the whole rollout
 * story `TenantEntitlementService` documents. The grandfather script writes a
 * `TenantFeature` row with `source: CUSTOM` for exactly those cases, and only
 * a `CUSTOM` override is authoritative in both directions (it can grant, not
 * only restrict). The ordinary settings-admin path
 * (`TenantModulesService.update`, `source: MANUAL`) is untouched: it still
 * refuses to write an override the plan cannot back, and every existing
 * caller of this function that does not pass the flag gets the original,
 * plan-capped behaviour unchanged.
 */
export function resolveTenantFeatureState(input: {
  isIncludedInPlan: boolean;
  tenantOverride: boolean | null | undefined;
  overrideIsPlanCapped?: boolean;
}): boolean {
  if (typeof input.tenantOverride !== 'boolean') {
    return input.isIncludedInPlan;
  }

  if (input.overrideIsPlanCapped === false) {
    return input.tenantOverride;
  }

  return input.isIncludedInPlan && input.tenantOverride;
}
