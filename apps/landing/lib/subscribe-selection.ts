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

/**
 * The prices this visitor may be quoted, which is never "all of them".
 *
 * `/public/plans` returns every active price on every plan, in every currency
 * any market publishes — it is not market-scoped. The visitor's market is, and
 * its currency is resolved server-side from published configuration.
 *
 * Filtering here is what stopped this function disagreeing with the rest of the
 * site. `plan.prices` arrives ordered by currency ascending, so every unfiltered
 * `prices[0]` below was really "whichever currency sorts first" — QAR ahead of
 * USD. A visitor in a USD market opening `/subscribe` was quoted QAR while the
 * home and plans pages, which read the market currency, quoted USD. Same plan,
 * same visitor, two currencies, and the one on the checkout page was the one
 * decided by alphabetical order.
 *
 * An unknown market currency means the commercial-config call failed. Every
 * price stays eligible in that case, because quoting from stale plan data is a
 * better failure than a checkout with no prices at all.
 */
function pricesInMarketCurrency(
  plan: PublicPlan,
  marketCurrency: string | null,
) {
  if (!marketCurrency) return plan.prices;
  return plan.prices.filter(
    (price) => price.currency.toUpperCase() === marketCurrency,
  );
}

export function resolveSubscribeSelection(
  plans: PublicPlan[],
  params: SubscribeSelectionParams = {},
  /**
   * The market's currency, from published configuration. Authoritative over
   * anything the plan data or the URL implies — a link naming a price in
   * another market's currency selects the same plan and cycle in this market's
   * currency instead, rather than quoting a price this visitor cannot be sold.
   */
  marketCurrency?: string | null,
): SubscribeSelection {
  const requestedSeats = parseTeamSize(params.teamSize);
  const requestedCycle = normalizeBillingCycle(params.billingInterval);
  const currency = marketCurrency?.trim().toUpperCase() || null;

  // 1. An exact price id wins — it names one option unambiguously — but only
  //    within the visitor's own market.
  if (params.planPriceId) {
    for (const plan of plans) {
      const price = pricesInMarketCurrency(plan, currency).find(
        (item) => item.id === params.planPriceId,
      );
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

  /*
   * 2. A price id this market cannot sell still names the plan the buyer
   *    chose. Keep the plan, re-resolve the price in the market's currency.
   *
   * Without this, a link built in one market and opened in another silently
   * fell through to "the first plan" — the buyer picked Growth and landed on
   * Starter, which is the defect `plan` + `billingInterval` were added to
   * prevent, reappearing through the more specific parameter.
   */
  const planNamedByPriceId = params.planPriceId
    ? (plans.find((plan) =>
        plan.prices.some((price) => price.id === params.planPriceId),
      ) ?? null)
    : null;

  // 3. Plan key plus billing interval — what /plans hands over.
  const planNamedByKey = params.plan
    ? (plans.find(
        (candidate) =>
          candidate.key.toLowerCase() === params.plan?.trim().toLowerCase(),
      ) ?? null)
    : null;

  // 4. Nothing usable was named — open on the first plan.
  const chosenPlan = planNamedByPriceId ?? planNamedByKey ?? plans[0];
  const eligible = chosenPlan
    ? pricesInMarketCurrency(chosenPlan, currency)
    : [];

  /*
   * Prefer the requested cycle, then whatever this market does publish for the
   * plan. `eligible[0]` is safe where `plan.prices[0]` was not: the list is
   * already narrowed to one currency, so "first" can no longer mean "first
   * alphabetically by currency".
   */
  const price =
    (requestedCycle
      ? eligible.find((item) => item.billingCycle === requestedCycle)
      : null) ??
    eligible[0] ??
    null;

  const minimumSeats = price?.minimumSeats ?? 1;

  return {
    planId: chosenPlan?.id ?? "",
    billingCycle: price?.billingCycle ?? requestedCycle ?? "MONTHLY",
    /*
     * The market's currency even when it has no price on this plan. The form
     * renders a blocked state from `checkoutBlock(null)` in that case, and it
     * has to say which region it is talking about — "not published for your
     * region" beside an empty currency reads as a bug rather than an answer.
     */
    currency: price?.currency ?? currency ?? "",
    minimumSeats,
    seatQuantity: clampSeats(
      requestedSeats,
      minimumSeats,
      price?.maximumSeats ?? null,
    ),
  };
}
