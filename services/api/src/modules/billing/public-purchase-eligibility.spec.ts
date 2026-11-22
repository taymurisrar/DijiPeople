import {
  CommercialPublicationStatus as Publication,
  CommercialSalesModel as Sales,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

import {
  assertPubliclyPurchasable,
  isPubliclyPurchasable,
  withinWindow,
  type PublicPurchasePrice,
} from './public-purchase-eligibility';

const NOW = new Date('2026-11-22T12:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');

function price(
  overrides: Partial<Omit<PublicPurchasePrice, 'plan'>> = {},
  plan: Partial<PublicPurchasePrice['plan']> = {},
): PublicPurchasePrice {
  return {
    isActive: true,
    publicationStatus: Publication.PUBLISHED,
    marketId: 'market-1',
    salesModel: Sales.SELF_SERVICE,
    effectiveFrom: PAST,
    effectiveTo: null,
    plan: {
      isActive: true,
      publicationStatus: Publication.PUBLISHED,
      salesModel: Sales.SELF_SERVICE,
      eligibleCustomerAccountId: null,
      effectiveFrom: null,
      effectiveUntil: null,
      ...plan,
    },
    ...overrides,
  };
}

describe('isPubliclyPurchasable (BUG-4652)', () => {
  it('accepts a standard self-service price', () => {
    expect(isPubliclyPurchasable(price(), NOW)).toBe(true);
  });

  it('accepts a custom plan that is public (not reserved) and self-service', () => {
    expect(isPubliclyPurchasable(price({}, { effectiveFrom: PAST }), NOW)).toBe(
      true,
    );
  });

  it.each<[string, PublicPurchasePrice]>([
    [
      'plan reserved for a customer',
      price({}, { eligibleCustomerAccountId: 'c1' }),
    ],
    [
      'reserved AND sales-assisted',
      price(
        {},
        { eligibleCustomerAccountId: 'c1', salesModel: Sales.SALES_ASSISTED },
      ),
    ],
    ['plan not yet effective', price({}, { effectiveFrom: FUTURE })],
    ['plan expired', price({}, { effectiveUntil: PAST })],
    ['plan sales-assisted', price({}, { salesModel: Sales.SALES_ASSISTED })],
    ['plan custom-only', price({}, { salesModel: Sales.CUSTOM_ONLY })],
    [
      'price sales-assisted on a self-service plan',
      price({ salesModel: Sales.SALES_ASSISTED }),
    ],
    ['price draft', price({ publicationStatus: Publication.DRAFT })],
    ['price inactive', price({ isActive: false })],
    ['price not scoped to a market', price({ marketId: null })],
    ['price not yet effective', price({ effectiveFrom: FUTURE })],
    ['price expired', price({ effectiveTo: PAST })],
    ['plan draft', price({}, { publicationStatus: Publication.DRAFT })],
    ['plan inactive', price({}, { isActive: false })],
  ])('refuses: %s', (_name, candidate) => {
    expect(isPubliclyPurchasable(candidate, NOW)).toBe(false);
  });

  it('refuses with exactly the error an unknown id gets, naming nothing', () => {
    let caught: unknown;
    try {
      assertPubliclyPurchasable(
        price({}, { eligibleCustomerAccountId: 'customer-secret' }),
        NOW,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).message).toBe('Plan price not found.');
    expect(
      JSON.stringify((caught as NotFoundException).getResponse()),
    ).not.toContain('customer-secret');
  });
});

describe('withinWindow', () => {
  it('is inclusive at the start and exclusive at the end', () => {
    expect(withinWindow(NOW, null, NOW)).toBe(true);
    expect(withinWindow(null, NOW, NOW)).toBe(false);
    expect(withinWindow(null, null, NOW)).toBe(true);
  });
});
