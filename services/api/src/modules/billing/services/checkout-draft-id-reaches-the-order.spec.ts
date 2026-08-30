import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
  Prisma,
  SubscriptionOrderStatus,
} from '@prisma/client';
import { BillingService } from './billing.service';

/**
 * REG — BUG-2530, the half of BUG-1516 that never reached the service.
 *
 * ## What broke, and why nothing caught it
 *
 * The subscribe wizard opens a **draft order** on the workspace step so the
 * "is `maseer` taken" check has a rate-limited session to bind to. The buyer has
 * not been asked for their e-mail at that point, so the draft's customer is
 * written with `pending@onboarding.invalid`. `resolveCustomer` matches on the
 * contact e-mail and `buildSubmissionHash` is built from it, so neither
 * mechanism can find that record again from the real submission — and a second
 * `CustomerAccount` is created for one signup.
 *
 * BUG-1516 fixed that by having the wizard send the draft's own id and having
 * `resolveCustomer` continue that customer. Both ends were built. The middle was
 * not: `PublicSubscribeDto` declared `onboardingId`, the wizard sent it, the
 * controller spread `...dto` into `createPublicSubscriptionCheckout` — and that
 * method's inline input type omitted the field and never forwarded it to
 * `openOrder`. Every self-service signup kept producing two customers.
 *
 * **TypeScript could not see it.** Excess-property checking does not apply to a
 * spread, so `{ ...dto, ipAddress }` against a narrower parameter type is legal
 * and silent. The existing guard could not see it either: it calls
 * `resolveCustomer` directly and passes `onboardingId` itself, so it proves the
 * far end works while saying nothing about whether anything supplies the value.
 *
 * ## Why this test sits where it does
 *
 * It exercises the seam that failed — `createPublicSubscriptionCheckout` →
 * `openOrder` — rather than either end of it. A guard on the destination passes
 * whether or not the caller ever calls; a guard on the caller's payload passes
 * whether or not the destination reads it. The defect lived precisely in the gap
 * between two things that were each individually tested and correct.
 *
 * The service is driven with hand-built doubles rather than a Nest testing
 * module because only one of its six dependencies matters here, and the
 * assertion is about an argument, not about wiring.
 */

const PLAN_PRICE_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ORDER_ID = '22222222-2222-4222-8222-222222222222';
const VERIFIED_AT = new Date('2026-08-30T03:52:00.000Z');

/**
 * A plan price that passes every checkout-readiness rule.
 *
 * Deliberately fully populated: `deriveCheckoutReadiness` refuses on any one of
 * eleven grounds, and a price that fails one of them would make this test pass
 * for the wrong reason — the method returns before `openOrder` is ever reached.
 */
function sellablePlanPrice() {
  return {
    id: PLAN_PRICE_ID,
    planId: 'plan-1',
    currency: 'QAR',
    unitAmount: new Prisma.Decimal(50),
    billingModel: BillingModel.PER_SEAT,
    billingCycle: BillingCycle.MONTHLY,
    billingInterval: BillingInterval.MONTH,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    minimumSeats: 1,
    maximumSeats: null,
    includedSeats: 0,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    isActive: true,
    stripePriceId: 'price_live_1',
    stripeProductId: 'prod_live_1',
    plan: {
      id: 'plan-1',
      isActive: true,
      publicationStatus: CommercialPublicationStatus.PUBLISHED,
      salesModel: CommercialSalesModel.SELF_SERVICE,
    },
  };
}

function buildService() {
  // Typed on the argument rather than left as `jest.Mock<any, any>`, so reading
  // `mock.calls[0][0]` below is a checked access — the assertions in this file
  // are entirely about that argument, and an `any` there would make a typo in a
  // property name read as a passing test.
  const openOrder = jest
    .fn<Promise<unknown>, [Record<string, unknown>]>()
    .mockResolvedValue({
      orderId: 'order-created',
      orderNumber: 'ORD-2026-ABCDEF12',
      customerAccountId: 'customer-1',
      status: SubscriptionOrderStatus.PENDING_PAYMENT,
      reused: false,
      stripeCheckoutSessionId: null,
      totalAmount: new Prisma.Decimal(50),
      currency: 'QAR',
    });

  const prisma = {
    planPrice: {
      findUnique: jest.fn().mockResolvedValue(sellablePlanPrice()),
      update: jest.fn().mockResolvedValue({}),
    },
    subscriptionOrder: {
      // Unverified, so the method stops at the e-mail gate and returns. That is
      // after `openOrder` and before anything touches Stripe checkout, which is
      // the shortest path through the code under test.
      findUnique: jest.fn().mockResolvedValue({ ownerEmailVerifiedAt: null }),
    },
  };

  const stripeBillingService = {
    getRuntimeMode: jest.fn().mockReturnValue('live'),
    verifyRecurringPrice: jest.fn().mockResolvedValue({
      valid: true,
      livemode: true,
      active: true,
      productId: 'prod_live_1',
      usageType: 'licensed',
      recurringInterval: 'month',
      verifiedAt: VERIFIED_AT,
      reasons: [],
    }),
  };

  const ownerEmailVerification = {
    issueCode: jest.fn().mockResolvedValue({ issued: true }),
  };

  const service = new BillingService(
    prisma as never,
    stripeBillingService as never,
    { get: jest.fn() } as never,
    { openOrder } as never,
    ownerEmailVerification as never,
    { acknowledgeMany: jest.fn() } as never,
  );

  return { service, openOrder, prisma, ownerEmailVerification };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    planPriceId: PLAN_PRICE_ID,
    seatQuantity: 10,
    companyName: 'Nisa Co',
    contactName: 'Taimur Israr',
    email: 'buyer@example.com',
    country: 'Qatar',
    ...overrides,
  };
}

describe('BUG-2530 — the wizard draft id survives the public subscribe boundary', () => {
  it('forwards onboardingId to openOrder so the draft customer is continued', async () => {
    const { service, openOrder } = buildService();

    await service.createPublicSubscriptionCheckout(
      submission({ onboardingId: DRAFT_ORDER_ID }),
    );

    expect(openOrder).toHaveBeenCalledTimes(1);
    expect(openOrder.mock.calls[0][0]).toMatchObject({
      onboardingId: DRAFT_ORDER_ID,
    });
  });

  it('is the field the wizard actually sends, not one this test invented', () => {
    /*
     * The paired assertion, and the reason this file is not circular. The test
     * above would pass just as happily against a field named `draftId` that no
     * caller sends. What makes it a guard is that `PublicSubscribeDto` — the
     * contract the landing wizard posts against — declares this exact name, so
     * renaming either side without the other fails here rather than silently
     * reopening the defect.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PublicSubscribeDto } = require('../dto/public-subscribe.dto') as {
      PublicSubscribeDto: new () => Record<string, unknown>;
    };
    const dto = new PublicSubscribeDto();
    dto.onboardingId = DRAFT_ORDER_ID;

    expect(Object.keys(dto)).toContain('onboardingId');
  });

  it('passes null rather than undefined when the wizard opened no draft', async () => {
    /*
     * The sales-assisted and no-draft paths must keep working. `resolveCustomer`
     * treats a null id as "resolve by the identity rules", which is the
     * behaviour every caller had before the draft existed.
     */
    const { service, openOrder } = buildService();

    await service.createPublicSubscriptionCheckout(submission());

    expect(openOrder.mock.calls[0][0]).toMatchObject({ onboardingId: null });
  });

  it('opens the order before the verification gate, not after it', async () => {
    /*
     * Guards the shape the fix depends on. If the e-mail gate ever moved above
     * `openOrder`, the draft would never be continued on the first submission
     * and the duplicate would return by a different route — with the assertion
     * above still green, because `openOrder` would simply not be called at all
     * on that pass. Asserting it *was* called is what closes that.
     */
    const { service, openOrder, ownerEmailVerification } = buildService();

    const result = await service.createPublicSubscriptionCheckout(
      submission({ onboardingId: DRAFT_ORDER_ID }),
    );

    expect(openOrder).toHaveBeenCalled();
    expect(ownerEmailVerification.issueCode).toHaveBeenCalledWith(
      'order-created',
    );
    expect(result).toMatchObject({ verificationRequired: true });
  });
});

/**
 * The class of defect, rather than this instance of it.
 *
 * `onboardingId` was dropped because `createPublicSubscriptionCheckout`
 * re-declares the request shape as an inline object type and one field was left
 * out of it. Nothing structural stops that happening again to the next field
 * somebody adds to the DTO: the spread the controller uses is precisely the
 * construct TypeScript declines to excess-property-check, so the compiler will
 * be just as silent next time.
 *
 * This reads source, which is weaker than running code, and it is scoped to earn
 * that: it compares two field-name sets and asserts nothing about behaviour. It
 * is paired with the behavioural tests above rather than standing in for them.
 *
 * Both parses are self-checked against a floor, because the failure mode of a
 * regex over source is matching nothing and reporting agreement — an empty set
 * is a subset of everything. See the CRLF-vacuity family of defects.
 */
describe('BUG-2530 — every PublicSubscribeDto field is one the service accepts', () => {
  const MODULE_ROOT = join(__dirname, '..');

  /** Declared properties of a class or inline object type, by indent depth. */
  function propertyNames(source: string, indent: number) {
    const at = new RegExp(`^ {${indent}}([a-zA-Z][a-zA-Z0-9]*)[?!]?:`, 'gm');
    return new Set([...source.matchAll(at)].map((match) => match[1]));
  }

  it('declares no field the service signature would silently discard', () => {
    const dtoSource = readFileSync(
      join(MODULE_ROOT, 'dto', 'public-subscribe.dto.ts'),
      'utf8',
    );
    const serviceSource = readFileSync(
      join(MODULE_ROOT, 'services', 'billing.service.ts'),
      'utf8',
    );

    const signature = serviceSource
      .split('async createPublicSubscriptionCheckout(input: {')[1]
      ?.split('}) {')[0];

    expect(signature).toBeDefined();

    const dtoFields = propertyNames(dtoSource, 2);
    const accepted = propertyNames(signature, 4);

    // The floors. Nothing here is a meaningful assertion about the contract —
    // they exist so that a parse which stopped matching fails loudly instead of
    // quietly agreeing that {} ⊆ {}.
    expect(dtoFields.size).toBeGreaterThan(20);
    expect(accepted.size).toBeGreaterThan(20);
    expect(dtoFields.has('onboardingId')).toBe(true);

    const dropped = [...dtoFields].filter((field) => !accepted.has(field));

    expect(dropped).toEqual([]);
  });
});
