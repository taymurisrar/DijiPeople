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

const europeanCountries = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

export function detectRegionCurrency(countryCode?: string | null) {
  const country = countryCode?.trim().toUpperCase();
  if (country === "QA") return "QAR";
  if (country === "US") return "USD";
  if (country === "AE") return "AED";
  if (country === "SA") return "SAR";
  if (country === "GB") return "GBP";
  if (country === "PK") return "PKR";
  if (country && europeanCountries.has(country)) return "EUR";
  return "USD";
}

export function getAvailableCurrenciesFromPlans(plans: PublicPlan[]) {
  return Array.from(
    new Set(
      plans.flatMap((plan) =>
        plan.prices.map((price) => price.currency.toUpperCase()),
      ),
    ),
  ).sort();
}

export function resolveDefaultCurrency(
  plans: PublicPlan[],
  country?: string | null,
) {
  const available = getAvailableCurrenciesFromPlans(plans);
  const detected = detectRegionCurrency(country);
  if (available.includes(detected)) return detected;
  if (available.includes("USD")) return "USD";
  return available[0] ?? "USD";
}

export function findPlanPrice(
  plan: PublicPlan,
  currency: string,
  billingCycle: BillingCycle,
) {
  return (
    plan.prices.find(
      (price) =>
        price.currency.toUpperCase() === currency.toUpperCase() &&
        price.billingCycle === billingCycle,
    ) ??
    plan.prices.find(
      (price) =>
        price.currency.toUpperCase() === "USD" &&
        price.billingCycle === billingCycle,
    ) ??
    null
  );
}

export function isCheckoutReady(price: PublicPlanPrice | null) {
  return Boolean(price?.checkoutReady ?? price?.isCheckoutReady);
}

export function formatPlanPrice(price: PublicPlanPrice | null) {
  if (!price) return "Contact sales";
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
      maximumFractionDigits: price.unitAmount % 1 === 0 ? 0 : 2,
    }).format(price.unitAmount) +
    (price.billingModel === "PER_SEAT" ? " per user/month" : "")
  );
}

export function humanizeFeature(key: string) {
  return key
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getDisplayFeatures(plan: PublicPlan) {
  return plan.features.filter((feature) => feature.isEnabled !== false);
}
