/**
 * The entitlement keys a plan record grants, whatever shape the record is in.
 *
 * `features` reaches this page in two different shapes from two endpoints on
 * the *same* runtime module, which is how the Entitlements tab came to show
 * every checkbox unticked:
 *
 *   GET  /platform-runtime/plans/:id  → `findGeneric`, raw `PlanFeature` rows:
 *                                       [{ featureKey: 'leave', isEnabled: true }, …]
 *   PATCH /platform-runtime/plans/:id → `SuperAdminService.updatePlan` → `mapPlan`,
 *                                       already-filtered keys: ['leave', …]
 *
 * The page read only the row shape. So a plan loaded fresh showed the right
 * ticks, and the moment anything saved — the entitlements themselves, or any
 * field on the Overview tab — `form.setValues(response.item)` swapped in the
 * string shape, every `item.featureKey` came back `undefined`, and the whole
 * set silently emptied.
 *
 * That is not a display fault. `updatePlan` applies `featureKeys` with
 * `deleteMany: {}` followed by `create`, so the set it is sent is the set the
 * plan ends up with. An operator seeing everything unticked ticks the one they
 * want and saves — and that save removes every other entitlement from a plan
 * live tenants are subscribed to.
 *
 * The API side now returns one shape (see the plans branch of `findGeneric`).
 * This stays shape-tolerant anyway: it is the last thing standing between a
 * mapper disagreement and deleted entitlements, and it costs one branch.
 */
export function planEntitlementKeys(features: unknown): string[] {
  if (!Array.isArray(features)) return [];

  return features
    .map((feature) => {
      if (typeof feature === "string") return feature;
      if (!feature || typeof feature !== "object") return "";

      const row = feature as Record<string, unknown>;
      // A disabled `PlanFeature` row is not an entitlement. The key-array shape
      // is filtered server-side and carries no flag, so absence means enabled.
      if (row.isEnabled === false) return "";
      return typeof row.featureKey === "string" ? row.featureKey : "";
    })
    .filter((key): key is string => key.length > 0);
}
