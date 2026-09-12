/*
 * Pure display logic pulled out of `billing-settings-client.tsx` so it can be
 * unit tested without jsdom (not installed in this app — see `apps/web`'s
 * `AGENTS.md`).
 */

export type ComparablePrice = {
  billingCycle: "MONTHLY" | "ANNUAL";
  currency: string;
  unitAmount: number;
  isCheckoutReady: boolean;
};

export type ComparablePlan = {
  prices: ComparablePrice[];
};

/**
 * BUG-3333 (UI half) — the currency dropdown used to be the union of every
 * currency any plan had a price in, sorted alphabetically, with no regard for
 * whether the tenant could buy anything in it. That is why the screen
 * defaulted to PKR, in which nothing was purchasable, on the demo tenant.
 *
 * True market scoping — narrowing the *offered* list to the tenant's selling
 * market and having the server refuse a checkout outside it — needs the
 * tenant's market on `GET /billing/plans`, which this endpoint does not
 * return today (see BUG-3333's evidence: `availableCurrencies` there is the
 * same unscoped union this file used to compute independently). That is
 * API-side work tracked on BUG-3333 and is not done here. What this function
 * does, within the frontend alone:
 *
 *  - prefers the tenant's own subscription currency, since a tenant already
 *    being billed in a currency is the closest signal this screen has to
 *    "their market" without server support;
 *  - otherwise prefers a currency in which at least one plan is actually
 *    purchasable for the given billing cycle, rather than the first one
 *    alphabetically;
 *  - never returns a currency with zero purchasable plans while a
 *    purchasable one exists in the list.
 *
 * TODO(BUG-3333): once `GET /billing/plans` returns the tenant's market,
 * scope `currencies` to it before calling this function at all — this
 * fallback chain becomes unnecessary at that point.
 */
export function resolveDefaultCurrency(input: {
  currencies: string[];
  subscriptionCurrency?: string | null;
  plans: ComparablePlan[];
  billingCycle: ComparablePrice["billingCycle"];
}): string | null {
  const { currencies, subscriptionCurrency, plans, billingCycle } = input;
  if (currencies.length === 0) return null;

  const purchasable = new Set(
    currencies.filter((currency) =>
      hasPurchasablePrice(plans, currency, billingCycle),
    ),
  );

  if (subscriptionCurrency && currencies.includes(subscriptionCurrency)) {
    return subscriptionCurrency;
  }

  const firstPurchasable = currencies.find((currency) =>
    purchasable.has(currency),
  );

  return firstPurchasable ?? currencies[0];
}

export function hasPurchasablePrice(
  plans: ComparablePlan[],
  currency: string,
  billingCycle: ComparablePrice["billingCycle"],
): boolean {
  return plans.some((plan) =>
    plan.prices.some(
      (price) =>
        price.currency === currency &&
        price.billingCycle === billingCycle &&
        price.isCheckoutReady,
    ),
  );
}

/**
 * The percentage an annual price saves over paying the monthly price twelve
 * times, for whichever plan offers both cycles in the given currency first.
 * Returns `null` rather than a guess when no plan has both — BUG-3333 asked
 * this be *labelled*, not invented.
 */
export function computeAnnualSavingsPercent(
  plans: ComparablePlan[],
  currency: string,
): number | null {
  for (const plan of plans) {
    const monthly = plan.prices.find(
      (price) => price.currency === currency && price.billingCycle === "MONTHLY",
    );
    const annual = plan.prices.find(
      (price) => price.currency === currency && price.billingCycle === "ANNUAL",
    );

    if (!monthly || !annual || monthly.unitAmount <= 0) continue;

    const yearlyAtMonthlyRate = monthly.unitAmount * 12;
    if (yearlyAtMonthlyRate <= 0) continue;

    const savings =
      ((yearlyAtMonthlyRate - annual.unitAmount) / yearlyAtMonthlyRate) * 100;

    if (savings <= 0) continue;

    return Math.round(savings);
  }

  return null;
}

export type ComparableFeature = {
  key: string;
  categoryOrder?: number | null;
  sortOrder?: number | null;
  label?: string | null;
  isEnabled?: boolean;
};

export type FeatureCarryingPlan = {
  features: ComparableFeature[];
};

function compareFeatureOrder(left: ComparableFeature, right: ComparableFeature) {
  return (
    (left.categoryOrder ?? 999) - (right.categoryOrder ?? 999) ||
    (left.sortOrder ?? 999) - (right.sortOrder ?? 999) ||
    (left.label ?? left.key).localeCompare(right.label ?? right.key)
  );
}

/**
 * BUG-3332 — the card listed the first eight features in catalog order, which
 * put every plan's differentiators (Payroll sorts last in the catalog) below
 * the cut. Growth and Enterprise rendered the same eight bullets although one
 * plan has 14 features and the other 16.
 *
 * Ranks a plan's enabled features so the ones `previousPlan` (the next
 * cheaper plan, assuming ascending tier order — the same assumption
 * `FeatureComparison`'s "available in a higher plan" logic relies on) does
 * not have come first. A card that must truncate now cuts common baseline
 * features rather than the differentiators a comparison exists to show.
 */
export function rankPlanFeatures(
  plan: FeatureCarryingPlan,
  previousPlan: FeatureCarryingPlan | undefined,
): ComparableFeature[] {
  const enabled = plan.features
    .filter((feature) => feature.isEnabled !== false)
    .sort(compareFeatureOrder);

  if (!previousPlan) return enabled;

  const previousKeys = new Set(
    previousPlan.features
      .filter((feature) => feature.isEnabled !== false)
      .map((feature) => feature.key),
  );

  const differentiators = enabled.filter(
    (feature) => !previousKeys.has(feature.key),
  );
  const shared = enabled.filter((feature) => previousKeys.has(feature.key));

  return [...differentiators, ...shared];
}
