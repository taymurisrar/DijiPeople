import type { BillingCycle, PublicPlan } from "./plans";

/**
 * Resolving what a buyer chose on /plans into the subscribe form's initial state.
 *
 * Extracted from the form component so it can be tested. The defect this
 * prevents is unglamorous and expensive: a visitor picks Growth, Annual, 50
 * employees, clicks through, and lands on Starter/Monthly/1 — then either
 * re-picks or, worse, buys the wrong thing.
 *
 * Resolution order is deliberate:
 *   1. `planPriceId` — an exact price, the most specific thing a link can name.
 *   2. `plan` key + `billingInterval` — what the plans page emits.
 *   3. The first plan, as a last resort.
 *
 * Nothing here decides a price. It only decides which published option the form
 * opens on; the backend still resolves what the customer is charged.
 */

export type SubscribeSelectionParams = {
  planPriceId?: string;
  /** Plan *key* (e.g. "growth"), not id — keys are stable and readable in a URL. */
  plan?: string;
  /** "MONTH" | "YEAR" from the plans page, or a legacy "MONTHLY" | "ANNUAL". */
  billingInterval?: string;
  teamSize?: string;
};

export type SubscribeSelection = {
  planId: string;
  billingCycle: BillingCycle;
  currency: string;
  minimumSeats: number;
  /** Seats to prefill, already clamped to the selected price's bounds. */
  seatQuantity: number;
};

/**
 * Accepts both the interval vocabulary used by the commercial config
 * (`MONTH`/`YEAR`) and the billing-cycle vocabulary the plan prices use
 * (`MONTHLY`/`ANNUAL`), because the URL is written by one and read by the other.
 */
export function normalizeBillingCycle(value?: string | null): BillingCycle | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "YEAR" || normalized === "ANNUAL" || normalized === "YEARLY")
    return "ANNUAL";
  if (normalized === "MONTH" || normalized === "MONTHLY") return "MONTHLY";
  return null;
}

export function parseTeamSize(value?: string | null): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function clampSeats(
  requested: number | null,
  minimumSeats: number,
  maximumSeats: number | null,
) {
  const base = requested ?? minimumSeats;
  const lowerBounded = Math.max(base, minimumSeats);
  return maximumSeats !== null
    ? Math.min(lowerBounded, maximumSeats)
    : lowerBounded;
}

export function resolveSubscribeSelection(
  plans: PublicPlan[],
  params: SubscribeSelectionParams = {},
): SubscribeSelection {
  const requestedSeats = parseTeamSize(params.teamSize);
  const requestedCycle = normalizeBillingCycle(params.billingInterval);

  // 1. An exact price id wins — it names one option unambiguously.
  if (params.planPriceId) {
    for (const plan of plans) {
      const price = plan.prices.find((item) => item.id === params.planPriceId);
      if (price) {
        const minimumSeats = price.minimumSeats ?? 1;
        return {
          planId: plan.id,
          billingCycle: price.billingCycle,
          currency: price.currency,
          minimumSeats,
          seatQuantity: clampSeats(
            requestedSeats,
            minimumSeats,
            price.maximumSeats ?? null,
          ),
        };
      }
    }
  }

  // 2. Plan key plus billing interval — what /plans hands over.
  if (params.plan) {
    const plan = plans.find(
      (candidate) =>
        candidate.key.toLowerCase() === params.plan?.trim().toLowerCase(),
    );

    if (plan) {
      // Prefer a price matching the requested cycle; fall back to any price on
      // the chosen plan rather than abandoning the plan the buyer picked.
      const price =
        (requestedCycle
          ? plan.prices.find((item) => item.billingCycle === requestedCycle)
          : null) ??
        plan.prices[0] ??
        null;

      const minimumSeats = price?.minimumSeats ?? 1;
      return {
        planId: plan.id,
        billingCycle: price?.billingCycle ?? requestedCycle ?? "MONTHLY",
        currency: price?.currency ?? "",
        minimumSeats,
        seatQuantity: clampSeats(
          requestedSeats,
          minimumSeats,
          price?.maximumSeats ?? null,
        ),
      };
    }
  }

  // 3. Nothing usable was named.
  const firstPlan = plans[0];
  const firstPrice = requestedCycle
    ? (firstPlan?.prices.find((item) => item.billingCycle === requestedCycle) ??
      firstPlan?.prices[0])
    : firstPlan?.prices[0];
  const minimumSeats = firstPrice?.minimumSeats ?? 1;

  return {
    planId: firstPlan?.id ?? "",
    billingCycle: firstPrice?.billingCycle ?? requestedCycle ?? "MONTHLY",
    currency: firstPrice?.currency ?? "",
    minimumSeats,
    seatQuantity: clampSeats(
      requestedSeats,
      minimumSeats,
      firstPrice?.maximumSeats ?? null,
    ),
  };
}
