import { PrismaClient, SubscriptionOrderStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { describeWithDatabase } from './helpers/db-fixtures';
import { BillingService } from '../src/modules/billing/services/billing.service';
import { SubscriptionOrderService } from '../src/modules/billing/services/subscription-order.service';
import { CustomerIdentityService } from '../src/modules/billing/services/customer-identity.service';
import { TaxBasisService } from '../src/modules/billing/services/tax-basis.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { OwnerEmailVerificationService } from '../src/modules/billing/services/owner-email-verification.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import { PartnerReferralResolverService } from '../src/modules/partner-experience/partner-referral-resolver.service';

/**
 * Nothing that looks like a live workspace exists before payment — BUG-0077.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The defect was not a wrong value; it was
 * four extra rows. Proving they are gone means counting rows in a real database
 * after running the real code path, because a Prisma double returns whatever the
 * test told it to and would happily "prove" either answer.
 *
 * It is also the assertion whose absence let the defect survive: the suite had
 * 1,382 passing tests and not one of them noticed that submitting a form created
 * a tenant.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * The narrowest Stripe the checkout path can run against.
 *
 * Only the three calls it actually makes are implemented. A fuller fake would
 * invite the test to depend on behaviour Stripe has not promised, and the point
 * here is what DijiPeople writes to its own database, not what Stripe does.
 */
function createStripeDouble() {
  const created: { customers: number; sessions: number } = {
    customers: 0,
    sessions: 0,
  };
  return {
    created,
    service: {
      getRuntimeMode: () => 'test',
      verifyRecurringPrice: () =>
        Promise.resolve({
          valid: true,
          livemode: false,
          active: true,
          productId: 'prod_double',
          usageType: 'licensed',
          recurringInterval: 'month',
          verifiedAt: new Date(),
          reasons: [] as string[],
        }),
      client: {
        customers: {
          create: (args: Record<string, unknown>) => {
            created.customers += 1;
            return Promise.resolve({
              id: `cus_double_${created.customers}`,
              ...args,
            });
          },
        },
        checkout: {
          sessions: {
            create: () => {
              created.sessions += 1;
              return Promise.resolve({
                id: `cs_double_${created.sessions}`,
                url: 'https://checkout.stripe.test/session',
              });
            },
          },
        },
      },
    },
  };
}

describeWithDatabase()('Payment-authorised provisioning (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const stripe = createStripeDouble();

  const orders = new SubscriptionOrderService(
    prisma as unknown as PrismaService,
    new CustomerIdentityService(),
    new TaxBasisService(),
    new OutboxService(prisma as unknown as PrismaService),
    // The real resolver over the same real Prisma client. Referral resolution
    // moved out of LeadsService so checkout could share it (BUG-0281); with no
    // referral code on these submissions it resolves to DIRECT and writes three
    // nulls, which is what these assertions already expect.
    new PartnerReferralResolverService(prisma as unknown as PrismaService),
  );

  /*
   * The checkout path refuses to build success and cancel URLs without a
   * configured landing origin, which is correct — a checkout that redirects
   * nowhere is worse than one that does not start.
   */
  const config = {
    get: (key: string) =>
      key === 'LANDING_APP_URL' ? 'https://landing.test' : undefined,
  } as unknown as ConfigService;

  /*
   * Mail is counted, never sent. The assertion that matters is *whether* a code
   * was issued, and a real transport would make the suite depend on SMTP.
   */
  const sentEmails: Array<{
    recipient: string;
    eventCode: string;
    text?: string;
  }> = [];
  const communications = {
    sendEmail: (input: {
      recipient: string;
      eventCode: string;
      text?: string;
    }) => {
      sentEmails.push(input);
      return Promise.resolve({ sent: true, status: 'LOGGED' });
    },
  };

  /**
   * The code as the buyer would read it, taken out of the mail body.
   *
   * Reading it from the email rather than from the database is the point: the
   * hash in the row cannot be reversed, so a test that could "verify" without
   * the mail would be proving something the customer's path never does.
   */
  function lastIssuedCode() {
    const email = [...sentEmails]
      .reverse()
      .find((sent) => sent.eventCode === 'ONBOARDING_EMAIL_VERIFICATION');
    const match = /\b(\d{6})\b/.exec(email?.text ?? '');
    if (!match) throw new Error('No verification code was emailed.');
    return match[1];
  }

  const verification = new OwnerEmailVerificationService(
    prisma as unknown as PrismaService,
    communications as never,
  );

  const billing = new BillingService(
    prisma as unknown as PrismaService,
    stripe.service as never,
    config,
    orders,
    verification,
  );

  const runId = `pap-${Date.now()}`;
  let planPriceId: string;
  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();

    /*
     * A checkout-ready price of this test's own, rather than whichever seeded
     * row happens to sort first. The path refuses a price with no
     * `stripePriceId` long before it reaches the rows this test is about, and
     * mutating a shared seed row to make it ready would leak into every other
     * spec that reads it.
     */
    const plan = await prisma.plan.findFirstOrThrow({ select: { id: true } });
    const planPrice = await prisma.planPrice.create({
      data: {
        planId: plan.id,
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        currency: 'QAR',
        unitAmount: 100,
        minimumSeats: 1,
        includedSeats: 0,
        isActive: true,
        stripePriceId: `price_double_${runId}`,
        stripeProductId: `prod_double_${runId}`,
      },
      select: { id: true },
    });
    planPriceId = planPrice.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { customerAccountId: { in: createdCustomerIds } },
    });
    await prisma.subscriptionOrder.deleteMany({
      where: { id: { in: createdOrderIds } },
    });
    await prisma.customerAccount.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
    if (planPriceId) {
      await prisma.planPrice.delete({ where: { id: planPriceId } });
    }
    await prisma.$disconnect();
  });

  /** One submission. The first for a buyer stops at the verification gate. */
  async function submit(overrides: Record<string, unknown> = {}) {
    const result = (await billing.createPublicSubscriptionCheckout({
      planPriceId,
      seatQuantity: 5,
      companyName: `Maseer ${runId}`,
      contactName: 'Saud Al Thani',
      email: `saud@maseer-${runId}.com`,
      country: 'QA',
      ...overrides,
    } as never)) as Record<string, unknown>;

    const orderId =
      (result.onboardingId as string) ??
      (
        await prisma.subscriptionOrder.findFirst({
          where: {
            stripeCheckoutSessionId: result.checkoutSessionId as string,
          },
          select: { id: true },
        })
      )?.id;

    if (orderId) {
      const order = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: { id: true, customerAccountId: true },
      });
      if (!createdOrderIds.includes(order.id)) createdOrderIds.push(order.id);
      if (!createdCustomerIds.includes(order.customerAccountId)) {
        createdCustomerIds.push(order.customerAccountId);
      }
      return { result, order };
    }
    return { result, order: null };
  }

  /**
   * The whole buyer journey: submit, read the code out of the mail, verify,
   * submit again. The second submission is the one that reaches Stripe.
   */
  async function subscribe(overrides: Record<string, unknown> = {}) {
    const first = await submit(overrides);
    if (!first.result.verificationRequired) return first;

    const outcome = await verification.verifyCode(
      first.order!.id,
      lastIssuedCode(),
    );
    expect(outcome).toEqual({ ok: true });

    return submit(overrides);
  }

  it('creates no tenant, no subscription and no lead before payment', async () => {
    const tenantsBefore = await prisma.tenant.count();
    const leadsBefore = await prisma.lead.count();
    const subscriptionsBefore = await prisma.subscription.count();

    const { result, order } = await subscribe();

    expect(result.submitted).toBe(true);
    expect(result.url).toBeTruthy();
    expect(order).not.toBeNull();

    // The four rows BUG-0077 created. Counted globally rather than by owner,
    // because the defect created them under a *second* customer account — a
    // scoped count would have missed exactly the rows that mattered.
    expect(await prisma.tenant.count()).toBe(tenantsBefore);
    expect(await prisma.lead.count()).toBe(leadsBefore);
    expect(await prisma.subscription.count()).toBe(subscriptionsBefore);
  });

  it('creates exactly one customer account for one buyer', async () => {
    const email = `single@maseer-${runId}.com`;
    await subscribe({
      companyName: `Single Customer ${runId}`,
      email,
    });

    const customers = await prisma.customerAccount.findMany({
      where: { contactEmail: email },
      select: { id: true, industry: true, companySize: true },
    });

    // Two accounts per buyer was the second half of BUG-0077: the order pointed
    // at one and the tenant, subscription and Stripe customer at the other.
    expect(customers).toHaveLength(1);

    // And neither column is fabricated. The public form does not ask for these,
    // and 'Unknown' in a reportable column is indistinguishable from an answer.
    expect(customers[0].industry).toBeNull();
    expect(customers[0].companySize).toBeNull();
  });

  it('reports the order as awaiting payment, with no tenant attached', async () => {
    const { order } = await subscribe({
      companyName: `Awaiting ${runId}`,
      email: `awaiting@maseer-${runId}.com`,
    });

    const row = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: order!.id },
      select: {
        status: true,
        tenantId: true,
        subscriptionId: true,
        stripeCheckoutSessionId: true,
        stripeCustomerId: true,
      },
    });

    expect(row.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(row.stripeCheckoutSessionId).toBeTruthy();
    expect(row.stripeCustomerId).toBeTruthy();
    // Filled in by provisioning, after payment — never at checkout.
    expect(row.tenantId).toBeNull();
    expect(row.subscriptionId).toBeNull();
  });

  it('sends Stripe the order, not a tenant', async () => {
    const { order } = await subscribe({
      companyName: `Metadata ${runId}`,
      email: `metadata@maseer-${runId}.com`,
    });

    const row = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: order!.id },
      select: { customerAccountId: true, stripeCustomerId: true },
    });

    // The Stripe customer is keyed to the order's own CustomerAccount. When it
    // was keyed to the second one, "who is this customer" had two answers
    // depending on whether you started from billing or from the workspace.
    const customer = await prisma.customerAccount.findUniqueOrThrow({
      where: { id: row.customerAccountId },
      select: { stripeCustomerId: true },
    });
    expect(customer.stripeCustomerId).toBe(row.stripeCustomerId);
  });

  /*
   * The owner-email gate — WP-02.
   *
   * The invariant these protect is `paidAt` implies `ownerEmailVerifiedAt`. A
   * card proves somebody can pay; it proves nothing about whether they typed
   * their own address, and the owner email is the one credential that cannot be
   * corrected from inside a workspace nobody can sign in to.
   */
  describe('owner email verification gate', () => {
    it('refuses to open checkout until the owner email is verified', async () => {
      const sessionsBefore = stripe.created.sessions;

      const { result, order } = await submit({
        companyName: `Ungated ${runId}`,
        email: `ungated@maseer-${runId}.com`,
      });

      expect(result.verificationRequired).toBe(true);
      expect(result.url).toBeNull();
      expect(result.checkoutSessionId).toBeNull();

      // The load-bearing assertion: no Stripe session exists, so there is
      // nothing for the buyer to pay against. A gate that returns a warning
      // while still handing back a checkout URL is not a gate.
      expect(stripe.created.sessions).toBe(sessionsBefore);

      const row = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: order!.id },
        select: { ownerEmailVerifiedAt: true, emailVerificationSentAt: true },
      });
      expect(row.ownerEmailVerifiedAt).toBeNull();
      expect(row.emailVerificationSentAt).not.toBeNull();
    });

    it('emails a code to the owner address and nowhere else', async () => {
      const email = `codeto@maseer-${runId}.com`;
      await submit({ companyName: `Code Recipient ${runId}`, email });

      const issued = sentEmails.filter(
        (sent) => sent.eventCode === 'ONBOARDING_EMAIL_VERIFICATION',
      );
      expect(issued.at(-1)?.recipient).toBe(email);
      expect(lastIssuedCode()).toMatch(/^\d{6}$/);
    });

    it('opens checkout once the code is accepted', async () => {
      const { result, order } = await subscribe({
        companyName: `Gated Through ${runId}`,
        email: `through@maseer-${runId}.com`,
      });

      expect(result.verificationRequired).toBeUndefined();
      expect(result.url).toBeTruthy();

      const row = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: order!.id },
        select: {
          ownerEmailVerifiedAt: true,
          emailVerificationCodeHash: true,
          stripeCheckoutSessionId: true,
        },
      });
      expect(row.ownerEmailVerifiedAt).not.toBeNull();
      expect(row.stripeCheckoutSessionId).toBeTruthy();
      // Consumed. A code that still works after it has been used is a
      // credential left lying around.
      expect(row.emailVerificationCodeHash).toBeNull();
    });

    it('rejects a wrong code and spends an attempt', async () => {
      const { order } = await submit({
        companyName: `Wrong Code ${runId}`,
        email: `wrong@maseer-${runId}.com`,
      });

      const real = lastIssuedCode();
      const wrong = real === '000000' ? '111111' : '000000';

      const outcome = await verification.verifyCode(order!.id, wrong);
      expect(outcome).toMatchObject({
        ok: false,
        code: 'VERIFICATION_CODE_INCORRECT',
      });

      const row = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: order!.id },
        select: {
          emailVerificationAttempts: true,
          ownerEmailVerifiedAt: true,
        },
      });
      expect(row.emailVerificationAttempts).toBe(1);
      expect(row.ownerEmailVerifiedAt).toBeNull();
    });

    it('burns the code after five wrong guesses', async () => {
      const { order } = await submit({
        companyName: `Brute Force ${runId}`,
        email: `brute@maseer-${runId}.com`,
      });
      const real = lastIssuedCode();
      const wrong = real === '000000' ? '111111' : '000000';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await verification.verifyCode(order!.id, wrong);
      }

      // Six digits is a million values; five guesses per code is what keeps
      // that a wall rather than a speed bump. The *correct* code is refused
      // now too — the budget belongs to the code, not to the guess.
      const outcome = await verification.verifyCode(order!.id, real);
      expect(outcome).toMatchObject({
        ok: false,
        code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
      });
    });

    it('throttles resends so the endpoint cannot mail-bomb an address', async () => {
      const { order } = await submit({
        companyName: `Resend ${runId}`,
        email: `resend@maseer-${runId}.com`,
      });

      const again = await verification.issueCode(order!.id);
      expect(again).toEqual({ issued: false, reason: 'TOO_SOON' });
    });

    it('treats verifying an already-verified order as success', async () => {
      const { order } = await subscribe({
        companyName: `Idempotent ${runId}`,
        email: `idempotent@maseer-${runId}.com`,
      });

      // A double-clicked Verify button must not undo the verification or
      // report a failure the customer cannot act on.
      const outcome = await verification.verifyCode(order!.id, '000000');
      expect(outcome).toEqual({ ok: true });
    });

    it('refuses a code for a session that never existed', async () => {
      const outcome = await verification.verifyCode(
        '00000000-0000-4000-8000-000000000000',
        '123456',
      );
      expect(outcome).toMatchObject({
        ok: false,
        code: 'ONBOARDING_SESSION_NOT_FOUND',
      });
    });
  });
});
