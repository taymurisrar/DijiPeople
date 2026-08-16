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
