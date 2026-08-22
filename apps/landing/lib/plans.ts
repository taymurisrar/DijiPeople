export type BillingCycle = "MONTHLY" | "ANNUAL";

export type PublicPlanPrice = {
  id: string;
  billingCycle: BillingCycle;
  currency: string;
  unitAmount: number;
  billingModel?: "PER_SEAT" | "FLAT";
  billingInterval?: "MONTH" | "YEAR";
  pricePerSeat?: number | null;
  minimumSeats?: number;
  maximumSeats?: number | null;
  includedSeats?: number;
  isActive?: boolean;
  hasStripePrice: boolean;
  checkoutReady?: boolean;
  isCheckoutReady: boolean;
};

export type PublicPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
  currency: string;
  monthlyBasePrice: number;
  annualBasePrice: number;
  prices: PublicPlanPrice[];
  availableBillingCyclesByCurrency?: Array<{
    currency: string;
    billingCycles: BillingCycle[];
  }>;
  features: Array<{ id?: string; key: string; isEnabled?: boolean }>;
  metadata: Record<string, unknown> | null;
  isPopular?: boolean;
  isRecommended?: boolean;
};

export type PublicPlansResponse = {
  plans: PublicPlan[];
  availableCurrencies: string[];
  error?: string;
};

// BUG-0028 — `detectRegionCurrency` and its hardcoded `europeanCountries` set
// used to live here, mapping country codes to currencies from a literal table
// compiled into this bundle. That made opening a market a frontend deploy, left
// the mapping unauditable, and put a commercial decision in the one place
// Platform Admin cannot reach. It was also quietly wrong: the "Europe" set
// omitted several eurozone members.
//
// Currency now comes from published market configuration, resolved server-side
// by the API from the visitor's country — see `getCommercialConfig()` in
// ./commercial-config.ts and the API's CommercialConfigService.
//
// Do not reintroduce a country-to-currency branch in this app. If a market's
// currency is wrong it is wrong in configuration, and that is where to fix it.

export function getAvailableCurrenciesFromPlans(plans: PublicPlan[]) {
  return Array.from(
    new Set(
      plans.flatMap((plan) =>
        plan.prices.map((price) => price.currency.toUpperCase()),
      ),
    ),
  ).sort();
}

/**
 * Pick a currency to render from what the backend returned.
 *
 * `marketCurrency` is the authoritative answer from published market
 * configuration. The plan scan is only a fallback for the case where the
 * commercial-config call failed and older plan data is all that is available —
 * it never overrides the market.
 */
export function resolveDisplayCurrency(
  plans: PublicPlan[],
  marketCurrency?: string | null,
) {
  const fromMarket = marketCurrency?.trim().toUpperCase();
  if (fromMarket) return fromMarket;

  const available = getAvailableCurrenciesFromPlans(plans);
  return available[0] ?? null;
}

export function findPlanPrice(
  plan: PublicPlan,
  currency: string,
  billingCycle: BillingCycle,
) {
  // No USD fallback. Quoting a plan in a currency the visitor's market does not
  // use is worse than showing no price: it is a wrong number presented as a
  // right one. The market's currency is resolved server-side; if there is no
  // price in it, the plan has no public price and must say so.
  return (
    plan.prices.find(
      (price) =>
        price.currency.toUpperCase() === currency.toUpperCase() &&
        price.billingCycle === billingCycle,
    ) ?? null
  );
}

export function isCheckoutReady(price: PublicPlanPrice | null) {
  return Boolean(price?.checkoutReady ?? price?.isCheckoutReady);
}

/**
 * Why this selection cannot be bought, in the visitor's words — or null.
 *
 * One function for both reasons, because the subscribe wizard has to make the
 * same call in three places: whether to show a notice, whether the step inputs
 * are inert, and whether Continue advances. When those were three inline
 * conditions they drifted, and the wizard would collect an organization
 * profile, an owner identity and signed agreements across five steps before
 * revealing a dead submit button — [[BUG-0082]], which is [[BUG-0066]] in a
 * shape that wastes more of somebody's afternoon.
 *
 * Returning the sentence rather than a boolean is deliberate: a caller cannot
 * disable an input without also having the reason to hand.
 */
/**
 * The support code shown to a visitor, and what it means internally.
 *
 * A visitor does not need to be told that a Stripe price is unverified, and
 * telling them would be worse than useless: it exposes our billing plumbing and
 * still leaves them unable to act. But "this is not available" with nothing to
 * quote makes a support conversation start from zero.
 *
 * So the page shows a short code. It is deliberately coarse — two values, not
 * the ten reasons `deriveCheckoutReadiness` distinguishes — because a code fine
 * enough to identify the exact misconfiguration would leak it. The precise
 * cause stays where it belongs: on the plan's price in Platform Admin, where an
 * operator reads the full list.
 *
 * `DP-CHK-01` — a price exists for this region and is not sellable online.
 * `DP-CHK-02` — no published price exists for this region at all.
 */
export const CHECKOUT_BLOCK_CODES = {
  NOT_SELLABLE: "DP-CHK-01",
  NO_REGIONAL_PRICE: "DP-CHK-02",
} as const;

export type CheckoutBlock = {
  /** Quotable by the visitor, meaningful to us. */
  code: string;
  /** One sentence, free of billing internals. */
  message: string;
};

/**
 * Why this selection cannot be bought, or null.
 *
 * One function for every consumer, because the subscribe wizard has to make the
 * same call in three places: whether to show a notice, whether the step inputs
 * exist at all, and whether Continue advances. When those were three inline
 * conditions they drifted, and the wizard collected an organization profile, an
 * owner identity and signed agreements across five steps before revealing a
 * dead submit button — [[BUG-0082]], which is [[BUG-0066]] in a shape that
 * wastes more of somebody's afternoon.
 *
 * Returning the sentence rather than a boolean is deliberate: a caller cannot
 * hide a form without also having the reason to hand.
 */
export function checkoutBlock(
  price: PublicPlanPrice | null,
): CheckoutBlock | null {
  if (isCheckoutReady(price)) return null;

  return price
    ? {
        code: CHECKOUT_BLOCK_CODES.NOT_SELLABLE,
        message:
          "This plan is not available to buy online at the moment. Our team can set it up for you.",
      }
    : {
        code: CHECKOUT_BLOCK_CODES.NO_REGIONAL_PRICE,
        message:
          "This plan is not published for your region yet. Our team can arrange it for you.",
      };
}

/** The message alone. Kept for callers that only render prose. */
export function checkoutBlockedReason(price: PublicPlanPrice | null) {
  return checkoutBlock(price)?.message ?? null;
}

export function formatPlanPrice(price: PublicPlanPrice | null) {
  if (!price) return "Contact sales";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: price.unitAmount % 1 === 0 ? 0 : 2,
  }).format(price.unitAmount);
}

/**
 * What one unit of a per-seat price actually is.
 *
 * The billable unit is an **active employee**, not a login or a "user" — a
 * tenant admin who is not an employee does not consume a seat, and a terminated
 * employee stops consuming one. Saying "per user" in customer-facing pricing
 * describes a different, larger population than the one that is billed.
 */
export function formatBillingUnit(price: PublicPlanPrice | null) {
  if (!price || price.billingModel !== "PER_SEAT") return null;
  return price.billingCycle === "ANNUAL"
    ? "per active employee / year"
    : "per active employee / month";
}

export function humanizeFeature(key: string) {
  return key
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getDisplayFeatures(plan: PublicPlan) {
  return plan.features.filter((feature) => feature.isEnabled !== false);
}
