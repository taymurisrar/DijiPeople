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
 * The consequence worth being explicit about is that an override cannot grant
 * what the plan does not sell. `TenantModulesService.update` rejects such a
 * write rather than storing one that would never take effect, but the rule holds
 * here regardless of how a row got into the table.
 */
export function resolveTenantFeatureState(input: {
  isIncludedInPlan: boolean;
  tenantOverride: boolean | null | undefined;
}): boolean {
  if (typeof input.tenantOverride === 'boolean') {
    return input.isIncludedInPlan && input.tenantOverride;
  }

  return input.isIncludedInPlan;
}
