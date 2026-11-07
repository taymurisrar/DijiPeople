import type { FeatureKey } from "@/lib/security-keys";

/**
 * Whether a module's route should render for the tenant's plan.
 *
 * `enabledKeys` is `null` when the plan could not be read. That case renders the
 * page: the API refuses an unbought module on its own (EntitlementGuard), so
 * failing open here costs nothing in security and avoids blanking a paid module
 * on a transient error. The layout's sidebar makes the same call.
 */
export function isModuleOnPlan(
  enabledKeys: readonly string[] | null | undefined,
  featureKey: FeatureKey,
): boolean {
  if (!enabledKeys) return true;
  return enabledKeys.includes(featureKey);
}
