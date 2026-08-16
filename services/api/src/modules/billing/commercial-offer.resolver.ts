import {
  BillingInterval,
  CommercialPublicationStatus,
  CommercialSalesModel,
  MarketLaunchStatus,
} from '@prisma/client';

/**
 * Pure resolution rules for "what may this customer buy, and at what price".
 *
 * This file is deliberately free of Prisma and Nest so the commercial rules can
 * be tested directly. The service that loads rows lives alongside it.
 *
 * It exists because the same question was previously answered in four places
 * with four different answers: Platform Admin read legacy `Plan` columns, the
 * public site read `PlanPrice`, checkout re-derived readiness, and the landing
 * bundle decided currency from a hardcoded country table. See BUG-0027 and
 * BUG-0028.
 *
 * The rule that shapes everything here: **resolution fails closed.** An
 * unpublished plan, an unscoped price, a market that is not open, or an amount
 * nobody has set produces an explicit unavailable result with a reason — never
 * a fallback to some other number that happens to be nearby.
 */

/** Why an offer could not be resolved. Safe to log; not all are safe to show. */
export type CommercialUnavailableReason =
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_PUBLISHED'
  | 'PLAN_INACTIVE'
  | 'MARKET_NOT_FOUND'
  | 'MARKET_NOT_PUBLISHED'
  | 'MARKET_DISABLED'
  | 'MARKET_NOT_LAUNCHED'
  | 'SELF_SERVICE_DISABLED'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'NO_PUBLISHED_PRICE'
  | 'PRICE_NOT_EFFECTIVE'
  | 'PRICE_NOT_MARKET_SCOPED'
  | 'SEATS_BELOW_MINIMUM'
  | 'SEATS_ABOVE_MAXIMUM'
  | 'SALES_ASSISTED_ONLY'
  | 'CUSTOM_CONTRACT_ONLY';

/**
 * Reasons that may be shown to an anonymous visitor. Everything else is
 * operator-facing: telling the public which internal precondition failed leaks
 * the shape of the commercial configuration.
 */
const PUBLIC_SAFE_REASONS = new Set<CommercialUnavailableReason>([
  'SELF_SERVICE_DISABLED',
  'SALES_ASSISTED_ONLY',
  'CUSTOM_CONTRACT_ONLY',
  'SEATS_BELOW_MINIMUM',
  'SEATS_ABOVE_MAXIMUM',
]);

export function isPublicSafeReason(reason: CommercialUnavailableReason) {
  return PUBLIC_SAFE_REASONS.has(reason);
}

export type ResolvablePlan = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  publicationStatus: CommercialPublicationStatus;
  salesModel: CommercialSalesModel;
};

export type ResolvableMarket = {
  id: string;
  code: string;
  publicationStatus: CommercialPublicationStatus;
  launchStatus: MarketLaunchStatus;
  isEnabled: boolean;
  selfServiceEnabled: boolean;
  defaultCurrency: string;
  supportedCurrencies: string[];
};

export type ResolvablePrice = {
  id: string;
  planId: string;
  marketId: string | null;
  currency: string;
  billingInterval: BillingInterval;
  billingModel: 'PER_SEAT' | 'FLAT';
  unitAmount: number;
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
  publicationStatus: CommercialPublicationStatus;
  salesModel: CommercialSalesModel;
  isActive: boolean;
};

export type CommercialOffer = {
  available: true;
  planId: string;
  planKey: string;
  marketId: string;
  marketCode: string;
  priceId: string;
  priceVersion: number;
  currency: string;
  billingInterval: BillingInterval;
  billingModel: 'PER_SEAT' | 'FLAT';
  unitAmount: number;
  /** Quantity actually billed — 1 for FLAT, the seat count for PER_SEAT. */
  billableQuantity: number;
  quantity: number;
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
  subtotal: number;
  salesModel: CommercialSalesModel;
  selfServiceEligible: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type CommercialOfferUnavailable = {
  available: false;
  reason: CommercialUnavailableReason;
  message: string;
};

export type CommercialOfferResult =
  | CommercialOffer
  | CommercialOfferUnavailable;

const REASON_MESSAGES: Record<CommercialUnavailableReason, string> = {
  PLAN_NOT_FOUND: 'Plan was not found.',
  PLAN_NOT_PUBLISHED: 'Plan is not published.',
  PLAN_INACTIVE: 'Plan is not active.',
  MARKET_NOT_FOUND: 'No market is configured for this location.',
  MARKET_NOT_PUBLISHED: 'Market configuration is not published.',
  MARKET_DISABLED: 'Market is not enabled.',
  MARKET_NOT_LAUNCHED: 'Market has not launched.',
  SELF_SERVICE_DISABLED:
    'This plan is not available to buy online in your region.',
  CURRENCY_NOT_SUPPORTED: 'Currency is not supported in this market.',
  NO_PUBLISHED_PRICE: 'No published price is available.',
  PRICE_NOT_EFFECTIVE: 'No price is in force for the requested date.',
  PRICE_NOT_MARKET_SCOPED: 'Price is not scoped to a market.',
  SEATS_BELOW_MINIMUM: 'Team size is below the minimum for this plan.',
  SEATS_ABOVE_MAXIMUM:
    'Team size exceeds the self-service maximum for this plan.',
  SALES_ASSISTED_ONLY: 'This plan is arranged with our team.',
  CUSTOM_CONTRACT_ONLY: 'This plan is provided under a custom agreement.',
};

function unavailable(
  reason: CommercialUnavailableReason,
): CommercialOfferUnavailable {
  return { available: false, reason, message: REASON_MESSAGES[reason] };
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Whether a market is open for business at all.
 *
 * `isEnabled` and `launchStatus` are separate checks on purpose: a market can
 * be enabled for sales-assisted work while `PLANNED`, which is the honest state
 * for somewhere the tax registration and legal documents are not yet in place.
 */
export function assertMarketSellable(
  market: ResolvableMarket | null,
): CommercialOfferUnavailable | null {
  if (!market) return unavailable('MARKET_NOT_FOUND');
  if (market.publicationStatus !== CommercialPublicationStatus.PUBLISHED)
    return unavailable('MARKET_NOT_PUBLISHED');
  if (!market.isEnabled) return unavailable('MARKET_DISABLED');
  if (market.launchStatus === MarketLaunchStatus.SUSPENDED)
    return unavailable('MARKET_NOT_LAUNCHED');
  if (market.launchStatus === MarketLaunchStatus.PLANNED)
    return unavailable('MARKET_NOT_LAUNCHED');
  return null;
}

/**
 * Pick the price in force at `effectiveAt` from the candidates for one
 * (plan, market, currency, interval).
 *
 * Selection is by latest `effectiveFrom` that has already started, not by
 * highest `version` — versions are authoring order, effective dates are
 * commercial intent, and a v3 dated next quarter must not displace the v2 that
 * is in force today.
 */
export function selectEffectivePrice(
  candidates: ResolvablePrice[],
  effectiveAt: Date,
): ResolvablePrice | null {
  const inForce = candidates
    .filter(
      (price) =>
        price.publicationStatus === CommercialPublicationStatus.PUBLISHED &&
        price.isActive &&
        price.marketId !== null &&
        price.effectiveFrom.getTime() <= effectiveAt.getTime() &&
        (price.effectiveTo === null ||
          price.effectiveTo.getTime() > effectiveAt.getTime()),
    )
    .sort((a, b) => {
      const byDate = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
      return byDate !== 0 ? byDate : b.version - a.version;
    });

  return inForce[0] ?? null;
}

export type ResolveOfferInput = {
  plan: ResolvablePlan | null;
  market: ResolvableMarket | null;
  prices: ResolvablePrice[];
  currency?: string | null;
  billingInterval: BillingInterval;
  quantity: number;
  effectiveAt: Date;
  /**
   * Self-service checkout applies stricter rules than an operator arranging a
   * deal in Admin — a sales-assisted plan is legitimately sellable by a human
   * and legitimately not purchasable online.
   */
  channel: 'SELF_SERVICE' | 'OPERATOR';
};

/**
 * The single authoritative answer. Admin, the public site and checkout all call
 * this — that is what stops the two-pricing-truths defect from returning.
 */
export function resolveCommercialOffer(
  input: ResolveOfferInput,
): CommercialOfferResult {
  const { plan, market, billingInterval, quantity, effectiveAt, channel } =
    input;

  if (!plan) return unavailable('PLAN_NOT_FOUND');
  if (plan.publicationStatus !== CommercialPublicationStatus.PUBLISHED)
    return unavailable('PLAN_NOT_PUBLISHED');
  if (!plan.isActive) return unavailable('PLAN_INACTIVE');

  const marketProblem = assertMarketSellable(market);
  if (marketProblem) return marketProblem;
  const sellableMarket = market as ResolvableMarket;

  const currency = (input.currency ?? sellableMarket.defaultCurrency)
    .trim()
    .toUpperCase();

  const supported = sellableMarket.supportedCurrencies.map((value) =>
    value.trim().toUpperCase(),
  );
  // The default currency is always supported even if the list omits it —
  // otherwise a market could be published in a state where it can sell nothing.
  if (
    supported.length > 0 &&
    !supported.includes(currency) &&
    currency !== sellableMarket.defaultCurrency.trim().toUpperCase()
  ) {
    return unavailable('CURRENCY_NOT_SUPPORTED');
  }

  const candidates = input.prices.filter(
    (price) =>
      price.planId === plan.id &&
      price.marketId === sellableMarket.id &&
      price.currency.trim().toUpperCase() === currency &&
      price.billingInterval === billingInterval,
  );

  if (candidates.length === 0) {
    // Distinguish "there is a price but nobody scoped it to a market" from
    // "there is no price at all". The first is a configuration mistake an
    // operator can fix; the second is a commercial decision nobody has made.
    const unscoped = input.prices.some(
      (price) => price.planId === plan.id && price.marketId === null,
    );
    return unavailable(
      unscoped ? 'PRICE_NOT_MARKET_SCOPED' : 'NO_PUBLISHED_PRICE',
    );
  }

  const price = selectEffectivePrice(candidates, effectiveAt);
  if (!price) {
    const anyPublished = candidates.some(
      (candidate) =>
        candidate.publicationStatus === CommercialPublicationStatus.PUBLISHED,
    );
    return unavailable(
      anyPublished ? 'PRICE_NOT_EFFECTIVE' : 'NO_PUBLISHED_PRICE',
    );
  }

  // The price's sales model narrows the plan's, never widens it: a plan under a
  // custom contract cannot be made self-service by one permissive price row.
  const effectiveSalesModel = narrowestSalesModel(
    plan.salesModel,
    price.salesModel,
  );

  const selfServiceEligible =
    effectiveSalesModel === CommercialSalesModel.SELF_SERVICE &&
    sellableMarket.selfServiceEnabled;

  if (channel === 'SELF_SERVICE') {
    if (effectiveSalesModel === CommercialSalesModel.CUSTOM_ONLY)
      return unavailable('CUSTOM_CONTRACT_ONLY');
    if (effectiveSalesModel === CommercialSalesModel.SALES_ASSISTED)
      return unavailable('SALES_ASSISTED_ONLY');
    if (!sellableMarket.selfServiceEnabled)
      return unavailable('SELF_SERVICE_DISABLED');
  }

  const isPerSeat = price.billingModel === 'PER_SEAT';
  if (isPerSeat) {
    if (quantity < price.minimumSeats)
      return unavailable('SEATS_BELOW_MINIMUM');
    if (price.maximumSeats !== null && quantity > price.maximumSeats)
      return unavailable('SEATS_ABOVE_MAXIMUM');
  }

  const billableQuantity = isPerSeat ? quantity : 1;

  return {
    available: true,
    planId: plan.id,
    planKey: plan.key,
    marketId: sellableMarket.id,
    marketCode: sellableMarket.code,
    priceId: price.id,
    priceVersion: price.version,
    currency,
    billingInterval,
    billingModel: price.billingModel,
    unitAmount: price.unitAmount,
    billableQuantity,
    quantity,
    minimumSeats: price.minimumSeats,
    maximumSeats: price.maximumSeats,
    includedSeats: price.includedSeats,
    subtotal: roundCurrency(price.unitAmount * billableQuantity),
    salesModel: effectiveSalesModel,
    selfServiceEligible,
    effectiveFrom: price.effectiveFrom,
    effectiveTo: price.effectiveTo,
  };
}

/** CUSTOM_ONLY is narrower than SALES_ASSISTED, which is narrower than SELF_SERVICE. */
export function narrowestSalesModel(
  a: CommercialSalesModel,
  b: CommercialSalesModel,
): CommercialSalesModel {
  const rank: Record<CommercialSalesModel, number> = {
    [CommercialSalesModel.SELF_SERVICE]: 0,
    [CommercialSalesModel.SALES_ASSISTED]: 1,
    [CommercialSalesModel.CUSTOM_ONLY]: 2,
  };
  return rank[a] >= rank[b] ? a : b;
}
