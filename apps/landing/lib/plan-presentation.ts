import type {
  CommercialConfigView,
  CommercialOfferView,
  CommercialPlanView,
} from "./commercial-config";

/**
 * Pure display logic for the plans page.
 *
 * Everything here derives from the published commercial configuration. No price,
 * currency, discount percentage, recommended-plan choice or plan-inclusion fact
 * is authored in this file — those are backend truth, and duplicating any of
 * them here is what BUG-0027 and BUG-0028 were.
 */

export type BillingIntervalKey = "MONTH" | "YEAR";

/** What a plan card should do, derived from configuration rather than plan name. */
export type PlanCtaState =
  | { kind: "SELF_SERVICE"; label: string; href: string }
  | { kind: "SALES_ASSISTED"; label: string; href: string }
  | { kind: "CUSTOM_ONLY"; label: string; href: string }
  | { kind: "UNAVAILABLE"; label: string; message: string };

export function findOffer(
  plan: CommercialPlanView,
  interval: BillingIntervalKey,
): CommercialOfferView | null {
  return (
    plan.offers.find((offer) => offer.billingInterval === interval) ?? null
  );
}

/**
 * Whether a plan is highlighted, from configuration only.
 *
 * The metadata flags are read server-side into `plan.metadata`. There is
 * deliberately no positional fallback: a previous version highlighted whichever
 * plan happened to be second, which silently changed the "recommended" plan
 * whenever sort order changed.
 */
export function isRecommended(plan: CommercialPlanView) {
  const metadata = plan.metadata ?? {};
  return Boolean(
    metadata.isRecommended ?? metadata.recommended ?? false,
  );
}

export function isPopular(plan: CommercialPlanView) {
  const metadata = plan.metadata ?? {};
  return Boolean(metadata.isPopular ?? metadata.popular ?? false);
}

export function highlightLabel(plan: CommercialPlanView) {
  if (isRecommended(plan)) return "Recommended";
  if (isPopular(plan)) return "Popular";
  return null;
}

/**
 * The CTA for a plan at a given interval.
 *
 * Driven entirely by the resolved offer and the plan's sales model. Enterprise
 * is not special-cased anywhere: a standard published Enterprise plan whose
 * offer is self-service eligible gets a subscribe button like any other.
 */
export function resolvePlanCta(
  plan: CommercialPlanView,
  interval: BillingIntervalKey,
  teamSize: number,
): PlanCtaState {
  const offer = findOffer(plan, interval);

  if (offer?.available && offer.selfServiceEligible) {
    return {
      kind: "SELF_SERVICE",
      label: `Start with ${plan.name}`,
      href: buildSubscribeHref(plan, interval, teamSize),
    };
  }

  if (plan.salesModel === "CUSTOM_ONLY") {
    return {
      kind: "CUSTOM_ONLY",
      label: "Talk to sales",
      href: `/contact?plan=${encodeURIComponent(plan.key)}`,
    };
  }

  if (plan.salesModel === "SALES_ASSISTED") {
    return {
      kind: "SALES_ASSISTED",
      label: "Talk to sales",
      href: `/contact?plan=${encodeURIComponent(plan.key)}`,
    };
  }

  // Published plan, self-service intent, but no usable offer. Never a subscribe
  // button — a CTA that leads to a checkout which cannot resolve a price is
  // worse than an honest unavailable state.
  return {
    kind: "UNAVAILABLE",
    label: "Contact us",
    message:
      offer && !offer.available
        ? offer.message
        : "Pricing for this plan is not available in your region yet.",
  };
}

/**
 * Subscribe link carrying the buyer's selection.
 *
 * Without this a visitor who picked Growth/Annual/50 landed on Starter/Monthly
 * and had to choose again. The subscribe page treats these as a starting
 * selection; the backend still resolves the authoritative price.
 */
export function buildSubscribeHref(
  plan: CommercialPlanView,
  interval: BillingIntervalKey,
  teamSize: number,
) {
  const params = new URLSearchParams({
    plan: plan.key,
    billingInterval: interval,
  });
  if (Number.isFinite(teamSize) && teamSize > 0) {
    params.set("teamSize", String(Math.trunc(teamSize)));
  }
  return `/subscribe?${params.toString()}`;
}

/**
 * Annual saving against paying monthly for a year.
 *
 * Returns null unless both offers resolve and the annual option is genuinely
 * cheaper. Nothing is assumed about a standard discount rate — a previous
 * version rendered a fixed percentage regardless of the configured prices.
 *
 * The monthly and annual offers of one plan share a billing model, so the
 * comparison holds at any team size and does not need one — whether both are
 * flat or both are per employee.
 */
export function calculateAnnualSaving(plan: CommercialPlanView) {
  const monthly = findOffer(plan, "MONTH");
  const annual = findOffer(plan, "YEAR");

  if (!monthly?.available || !annual?.available) return null;
  if (monthly.currency !== annual.currency) return null;

  const monthlyOverAYear = monthly.unitAmount * 12;
  if (monthlyOverAYear <= 0) return null;

  const saving = monthlyOverAYear - annual.unitAmount;
  if (saving <= 0) return null;

  return {
    currency: annual.currency,
    amount: round2(saving),
    percent: Math.round((saving / monthlyOverAYear) * 100),
  };
}

/**
 * Estimated cost for a team size. Informational only — checkout recomputes.
 *
 * FLAT prices do not scale with team size, so the estimate stays the unit
 * amount rather than multiplying, which would overstate the cost several-fold.
 */
export function estimateCost(
  offer: CommercialOfferView | null,
  teamSize: number,
) {
  if (!offer?.available) return null;

  /*
   * The minimum seat commitment is BILLED, so it must be shown.
   *
   * This read `Math.max(teamSize, 1)`, which ignored `minimumSeats` entirely
   * while the server bills `Math.max(quantity, minimumSeats)`. A six-person
   * company on a plan with a ten-seat minimum would have been quoted six seats
   * on this page and charged for ten by Stripe.
   *
   * That is the same defect BUG-0080 was found through — a page and an invoice
   * disagreeing — and it is worth being blunt about why it nearly recurred: the
   * arithmetic lives in two places, here and in `resolveCommercialOffer`, and
   * only one of them was changed when the rule did. `belowMinimum` below is
   * what lets the page say "6 employees, billed at the 10-seat minimum" instead
   * of silently showing a number the customer did not type.
   */
  const billable =
    offer.billingModel === "PER_SEAT"
      ? Math.max(teamSize, offer.minimumSeats, 1)
      : 1;
  const belowMinimum =
    offer.billingModel === "PER_SEAT" && teamSize < offer.minimumSeats;
  const aboveMaximum =
    offer.billingModel === "PER_SEAT" &&
    offer.maximumSeats !== null &&
    teamSize > offer.maximumSeats;

  return {
    currency: offer.currency,
    total: round2(offer.unitAmount * billable),
    billable,
    belowMinimum,
    aboveMaximum,
  };
}

/**
 * Which features each plan includes, as a matrix the comparison table renders.
 *
 * Built from the backend's feature catalogue and each plan's own feature list.
 * The landing app holds no opinion about what a plan contains.
 */
export function buildComparisonMatrix(config: CommercialConfigView) {
  const categories = new Map<
    string,
    { label: string; order: number; features: typeof config.featureCatalog }
  >();

  for (const feature of config.featureCatalog) {
    const existing = categories.get(feature.categoryKey);
    if (existing) {
      existing.features.push(feature);
    } else {
      categories.set(feature.categoryKey, {
        label: feature.categoryLabel,
        order: feature.categoryOrder,
        features: [feature],
      });
    }
  }

  const planFeatureSets = new Map(
    config.plans.map((plan) => [plan.key, new Set(plan.features)]),
  );

  return [...categories.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, category]) => ({
      key,
      label: category.label,
      rows: category.features.map((feature) => ({
        key: feature.key,
        label: feature.label,
        description: feature.description,
        included: config.plans.map((plan) =>
          Boolean(planFeatureSets.get(plan.key)?.has(feature.key)),
        ),
      })),
    }));
}

/**
 * Whether each plan's features are a strict superset of the one before it.
 *
 * "Everything in Starter, plus…" is only honest when that is actually true. If
 * the entitlements ever stop nesting, the page falls back to listing each plan's
 * features outright rather than claiming a hierarchy that does not hold.
 */
export function plansAreCumulative(plans: CommercialPlanView[]) {
  for (let index = 1; index < plans.length; index += 1) {
    const previous = new Set(plans[index - 1].features);
    const current = new Set(plans[index].features);
    for (const key of previous) {
      if (!current.has(key)) return false;
    }
  }
  return true;
}

/** Features a plan adds over its predecessor, for the "plus" list. */
export function incrementalFeatures(
  plans: CommercialPlanView[],
  index: number,
  catalog: CommercialConfigView["featureCatalog"],
) {
  const labels = new Map(catalog.map((feature) => [feature.key, feature.label]));
  const current = plans[index].features;

  if (index === 0) {
    return current.map((key) => labels.get(key) ?? key);
  }

  const previous = new Set(plans[index - 1].features);
  return current
    .filter((key) => !previous.has(key))
    .map((key) => labels.get(key) ?? key);
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * The billing unit, in customer language.
 *
 * A **flat** price is labelled by period alone — "per month" — because that is
 * the whole truth about it: the amount does not move with headcount. This used
 * to return null for flat prices, which rendered a bare figure with no unit and
 * left the visitor to work out for themselves whether it was monthly, annual or
 * per person. Saying nothing is not the same as saying nothing misleading.
 *
 * A **per-seat** price is labelled per active employee — not per login and not
 * per "seat". A tenant admin who is not an employee does not consume one, and a
 * terminated employee stops consuming one, so "per user" would name a larger
 * population than the one actually billed.
 */
export function billingUnitLabel(offer: CommercialOfferView | null) {
  if (!offer?.available) return null;

  const period = offer.billingInterval === "YEAR" ? "year" : "month";

  return offer.billingModel === "PER_SEAT"
    ? `per active employee / ${period}`
    : `per ${period}`;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
