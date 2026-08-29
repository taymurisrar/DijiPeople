/**
 * How many tenants are billed on a plan, whatever shape the record is in.
 *
 * The Plans list and the plan record page disagreed about the same number: the
 * list showed 2 for the Starter plan while the record page's Overview tile
 * showed 0 and rendered "No tenant is billed on this plan yet" (BUG-1953).
 *
 * Both read the same payload. `SuperAdminService.mapPlan` returns the count
 * twice — once as `subscriptionCount` and once as `subscriptions`, the second
 * deliberately named for the Prisma relation so the list's column definition
 * resolves against the model graph. Both are **numbers**. The record page did
 * `Array.isArray(values.subscriptions) ? values.subscriptions.length : 0`, so
 * a number always fell through to the zero branch.
 *
 * The `subscriptions` key is genuinely a collection on the other plan read
 * path — `PlatformRuntimeService.findGeneric` includes the rows themselves —
 * so this stays shape-tolerant rather than picking one key and trusting it.
 * That is the same reasoning as `planEntitlementKeys`, and for the same
 * reason: a mapper disagreement here is silent, and the wrong answer is the
 * one an operator acts on when deciding whether a plan can be repriced.
 */
export function planSubscriptionCount(record: unknown): number {
  if (!record || typeof record !== "object") return 0;

  const values = record as Record<string, unknown>;
  // `subscriptionCount` first: it is unambiguously the count on every mapper
  // that emits it, and it cannot be confused with a paged relation payload.
  const explicit = countOf(values.subscriptionCount);
  if (explicit !== null) return explicit;

  return countOf(values.subscriptions) ?? 0;
}

function countOf(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
  }
  if (Array.isArray(value)) return value.length;
  return null;
}
