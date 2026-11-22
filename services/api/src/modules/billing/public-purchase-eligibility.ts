import { NotFoundException } from '@nestjs/common';
import {
  CommercialPublicationStatus,
  CommercialSalesModel,
} from '@prisma/client';

import {
  isPriceCurrentlySellable,
  narrowestSalesModel,
} from './commercial-offer.resolver';

/**
 * The ONE rule for whether an ANONYMOUS caller may buy a price (BUG-4652).
 *
 * `planPriceId` arrives from the client on every public write path, and an id a
 * caller supplies is not evidence of anything they are entitled to. The public
 * listing already hides reserved and out-of-window plans
 * (`publiclyOfferablePlanWhere`); this is the matching ACCESS CONTROL, applied
 * wherever a public caller can turn a price id into an order, an invoice, a
 * payment session or a quote. A read filter with no matching write check is only
 * a listing preference.
 *
 * It is deliberately a pure function over a loaded price (with its plan), so the
 * same decision is made by the payment-option lookup, onboarding, subscription
 * submission and `openOrder`, which reaches the database from inside the service
 * and so cannot rely on a controller having run first.
 *
 * Never applied to an AUTHENTICATED tenant acting on its own subscription: such a
 * tenant may legitimately sit on a reserved or grandfathered plan (see
 * `assertTenantMayBuyPlan` in billing.service for that path, which exempts the
 * tenant's current plan).
 */
export interface PublicPurchasePrice {
  isActive: boolean;
  publicationStatus: CommercialPublicationStatus;
  marketId: string | null;
  salesModel: CommercialSalesModel;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  plan: {
    isActive: boolean;
    publicationStatus: CommercialPublicationStatus;
    salesModel: CommercialSalesModel;
    eligibleCustomerAccountId: string | null;
    effectiveFrom: Date | null;
    effectiveUntil: Date | null;
  };
}

export function isPubliclyPurchasable(
  price: PublicPurchasePrice,
  now: Date = new Date(),
): boolean {
  const { plan } = price;
  return (
    // Active and published plan and price, and the price is scoped to a market.
    isPriceCurrentlySellable(plan, price) &&
    // Self-service only: the price's model narrows the plan's, never widens it.
    narrowestSalesModel(plan.salesModel, price.salesModel) ===
      CommercialSalesModel.SELF_SERVICE &&
    // A plan reserved for a customer is never anonymously purchasable. A verified
    // purchase flow for that customer would be a separate, authenticated path.
    plan.eligibleCustomerAccountId === null &&
    // Both validity windows. Mirrors `publiclyOfferablePlanWhere` for the plan.
    withinWindow(plan.effectiveFrom, plan.effectiveUntil, now) &&
    withinWindow(price.effectiveFrom, price.effectiveTo, now)
  );
}

/** Start inclusive, end exclusive; either end may be open. */
export function withinWindow(
  from: Date | null,
  until: Date | null,
  now: Date = new Date(),
): boolean {
  return (!from || from <= now) && (!until || until > now);
}

/**
 * The refusal is `NotFoundException` with the SAME message as an unknown id, on
 * purpose: a distinct error would confirm that a price exists and is merely
 * off-limits, which tells an enumerator which ids are worth having. It also names
 * no plan, customer, price or reason.
 */
export function assertPubliclyPurchasable(
  price: PublicPurchasePrice,
  now: Date = new Date(),
): void {
  if (!isPubliclyPurchasable(price, now)) {
    throw new NotFoundException('Plan price not found.');
  }
}
