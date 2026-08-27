import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOriginChannel,
  LeadAttributionStatus,
} from '@prisma/client';
import { SubscriptionOrderService } from './subscription-order.service';
import type { CustomerIdentityService } from './customer-identity.service';
import type { OutboxService } from '../../outbox/outbox.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TaxBasisService } from './tax-basis.service';
import type { PartnerReferralResolverService } from '../../partner-experience/partner-referral-resolver.service';

/**
 * What a self-service purchase writes onto the customer record.
 *
 * The sales-assisted path (`PlatformLifecycleService.convertLeadToCustomer`)
 * has always written the commercial columns Platform Admin's Customers module
 * reports on. The checkout path wrote none of them, so a customer who bought
 * through the website arrived with no plan, no billing cycle and no channel —
 * every self-service row in the Customers list blank in exactly the columns an
 * operator groups and filters by.
 *
 * `resolveCustomer` is private. It is reached through a cast rather than made
 * public, because widening a method's visibility to test it changes the shape
 * of the class to suit the test; the alternative — driving the whole of
 * `openOrder` — would need tax, promotions and slug collaborators to assert one
 * `create` payload.
 */
type ResolveCustomer = (
  tx: unknown,
  input: unknown,
  selection: unknown,
) => Promise<string>;

/** No partner involved: the ordinary direct purchase. */
const DIRECT = {
  partnerId: null,
  linkId: null,
  code: null,
  status: LeadAttributionStatus.DIRECT,
};

/** A code that resolved to an active partner and an active link. */
const ATTRIBUTED = {
  partnerId: 'partner-1',
  linkId: 'link-1',
  code: 'GOLD-100',
  status: LeadAttributionStatus.ATTRIBUTED,
};

/** A code that was presented and did not earn. Recorded, but not credited. */
const EXPIRED = {
  partnerId: null,
  linkId: null,
  code: 'GOLD-100',
  status: LeadAttributionStatus.EXPIRED_LINK,
};

const SELECTION = {
  planId: 'plan-growth',
  billingCycle: BillingCycle.ANNUAL,
  originChannel: CustomerOriginChannel.WEBSITE,
  attribution: DIRECT,
};

const INPUT = {
  companyName: '  Maseer Group  ',
  contactName: 'Nora Haddad',
  email: 'nora@maseer.example',
  phone: '+974 4444 0000',
  country: ' Qatar ',
  organization: { industry: 'Construction', city: 'Doha' },
};

function build(overrides: {
  existing?: { id: string; status: CustomerAccountStatus } | null;
  current?: Record<string, unknown>;
}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const tx = {
    customerAccount: {
      create: (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'customer-new' });
      },
      update: (args: { data: Record<string, unknown> }) => {
        updated.push(args.data);
        return Promise.resolve({ id: 'customer-existing' });
      },
      findUniqueOrThrow: () =>
        Promise.resolve(
          overrides.current ?? {
            selectedPlanId: null,
            preferredBillingCycle: null,
            originChannel: null,
            originatingPartnerId: null,
          },
        ),
    },
  };

  const identityCalls: Record<string, unknown>[] = [];
  const identity = {
    findExisting: (_tx: unknown, args: Record<string, unknown>) => {
      identityCalls.push(args);
      return Promise.resolve(overrides.existing ?? null);
    },
  } as unknown as CustomerIdentityService;

  const outbox = { emit: () => Promise.resolve() } as unknown as OutboxService;

  const service = new SubscriptionOrderService(
    {} as PrismaService,
    identity,
    {} as TaxBasisService,
    outbox,
    // `resolveCustomer` receives an already-resolved attribution; resolution
    // itself is asserted in partner-referral-resolver.service.spec.ts.
    {} as PartnerReferralResolverService,
  );

  /*
   * Annotated rather than inferred. `.bind` widens the result to `any`, and
   * every test in this file then destructures and calls it — two
   * no-unsafe-* warnings each, against a --max-warnings ratchet that is a
   * ratchet precisely so a test helper cannot quietly spend it.
   */
  const resolveCustomer: ResolveCustomer = (
    service as unknown as { resolveCustomer: ResolveCustomer }
  ).resolveCustomer.bind(service);

  return { resolveCustomer, tx, created, updated, identityCalls };
}

describe('checkout customer record', () => {
  /*
   * BUG-1516. `findExisting` matches on a lower-cased e-mail, so a create that
   * stored the caller's casing verbatim would be unfindable by the next
   * submission and would duplicate the customer instead of merging into it.
   * That held together only because `PublicSubscribeDto` lower-cases `email`
   * before the service sees it — the service itself made no such guarantee, and
   * any future caller reaching `openOrder` another way would have reintroduced
   * the duplicate silently.
   */
  it('stores the contact e-mail case-folded, whatever casing the caller used', async () => {
    const { resolveCustomer, tx, created } = build({ existing: null });

    await resolveCustomer(
      tx,
      { ...INPUT, email: '  Nora@Maseer.Example  ' },
      SELECTION,
    );

    expect(created[0]).toMatchObject({
      primaryContactEmail: 'nora@maseer.example',
      contactEmail: 'nora@maseer.example',
      billingContactEmail: 'nora@maseer.example',
    });
  });

  it('matches an existing customer on the case-folded e-mail, not the raw one', async () => {
    const { resolveCustomer, tx, identityCalls } = build({ existing: null });

    await resolveCustomer(
      tx,
      { ...INPUT, email: '  Nora@Maseer.Example  ' },
      SELECTION,
    );

    expect(identityCalls).toHaveLength(1);
    expect(identityCalls[0]).toMatchObject({ email: 'nora@maseer.example' });
  });

  it('records the plan, billing cycle and channel a new customer is buying on', async () => {
    const { resolveCustomer, tx, created } = build({ existing: null });

    await resolveCustomer(tx, INPUT, SELECTION);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      selectedPlanId: 'plan-growth',
      preferredBillingCycle: BillingCycle.ANNUAL,
      originChannel: CustomerOriginChannel.WEBSITE,
      status: CustomerAccountStatus.PROSPECT,
    });
  });

  it('still records the identity and organization the wizard collected', async () => {
    const { resolveCustomer, tx, created } = build({ existing: null });

    await resolveCustomer(tx, INPUT, SELECTION);

    // Trimmed, not raw: these columns are reported on and a leading space makes
    // two companies out of one.
    expect(created[0]).toMatchObject({
      companyName: 'Maseer Group',
      country: 'Qatar',
      primaryContactFirstName: 'Nora',
      primaryContactLastName: 'Haddad',
      primaryContactEmail: 'nora@maseer.example',
      billingContactEmail: 'nora@maseer.example',
      industry: 'Construction',
      city: 'Doha',
    });
  });

  it('fills the empty commercial columns of a returning customer', async () => {
    const { resolveCustomer, tx, updated } = build({
      existing: {
        id: 'customer-existing',
        status: CustomerAccountStatus.PROSPECT,
      },
      current: {
        selectedPlanId: null,
        preferredBillingCycle: null,
        originChannel: null,
      },
    });

    await resolveCustomer(tx, INPUT, SELECTION);

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      selectedPlanId: 'plan-growth',
      preferredBillingCycle: BillingCycle.ANNUAL,
      originChannel: CustomerOriginChannel.WEBSITE,
    });
  });

  it('never overwrites what a returning customer already bought', async () => {
    /*
     * The case this rule exists for: somebody who paid for Starter monthly
     * starts assembling a Growth annual order and abandons it. Overwriting
     * would leave the Customers list claiming they are on a plan they never
     * bought — `openOnboarding` is what states the plan authoritatively, and it
     * runs at payment, not at checkout.
     */
    const { resolveCustomer, tx, updated } = build({
      existing: {
        id: 'customer-existing',
        status: CustomerAccountStatus.ACTIVE,
      },
      current: {
        selectedPlanId: 'plan-starter',
        preferredBillingCycle: BillingCycle.MONTHLY,
        originChannel: CustomerOriginChannel.PARTNER_REFERRAL,
      },
    });

    await resolveCustomer(tx, INPUT, SELECTION);

    const data = updated[0] ?? {};
    expect(data).not.toHaveProperty('selectedPlanId');
    expect(data).not.toHaveProperty('preferredBillingCycle');
    expect(data).not.toHaveProperty('originChannel');
  });
  /**
   * REG-207 — BUG-0281.
   *
   * `CustomerAccount` carries three attribution columns and only the lead paths
   * wrote them, so a buyer who followed a partner's referral link and paid
   * without ever becoming a lead was recorded as an unattributed direct
   * purchase — no error, no empty state, just a customer with no partner and a
   * partner with no commission.
   */
  describe('partner attribution', () => {
    it('records partner, link and code snapshot on a referred purchase', async () => {
      const { resolveCustomer, tx, created } = build({ existing: null });

      await resolveCustomer(tx, INPUT, {
        ...SELECTION,
        originChannel: CustomerOriginChannel.PARTNER_REFERRAL,
        attribution: ATTRIBUTED,
      });

      expect(created[0]).toMatchObject({
        originatingPartnerId: 'partner-1',
        originatingReferralLinkId: 'link-1',
        referralCodeSnapshot: 'GOLD-100',
        originChannel: CustomerOriginChannel.PARTNER_REFERRAL,
      });
    });

    it('leaves an unreferred purchase on WEBSITE with no partner, not a blank', async () => {
      const { resolveCustomer, tx, created } = build({ existing: null });

      await resolveCustomer(tx, INPUT, SELECTION);

      expect(created[0]).toMatchObject({
        originatingPartnerId: null,
        originatingReferralLinkId: null,
        referralCodeSnapshot: null,
        originChannel: CustomerOriginChannel.WEBSITE,
      });
    });

    it('keeps the code of a link that did not earn, and credits nobody', async () => {
      // An expired link is recoverable evidence. A blank is not.
      const { resolveCustomer, tx, created } = build({ existing: null });

      await resolveCustomer(tx, INPUT, { ...SELECTION, attribution: EXPIRED });

      expect(created[0]).toMatchObject({
        originatingPartnerId: null,
        originatingReferralLinkId: null,
        referralCodeSnapshot: 'GOLD-100',
        originChannel: CustomerOriginChannel.WEBSITE,
      });
    });

    it('fills attribution on a returning customer who had none', async () => {
      const { resolveCustomer, tx, updated } = build({
        existing: {
          id: 'customer-existing',
          status: CustomerAccountStatus.PROSPECT,
        },
        current: {
          selectedPlanId: null,
          preferredBillingCycle: null,
          originChannel: null,
          originatingPartnerId: null,
        },
      });

      await resolveCustomer(tx, INPUT, {
        ...SELECTION,
        attribution: ATTRIBUTED,
      });

      expect(updated[0]).toMatchObject({
        originatingPartnerId: 'partner-1',
        originatingReferralLinkId: 'link-1',
        referralCodeSnapshot: 'GOLD-100',
      });
    });

    it('never reassigns a customer who already has a partner', async () => {
      /*
       * First touch wins. The partner who introduced this customer is the one
       * who introduced them; a later order arriving under a rival's code must
       * not move the commission.
       */
      const { resolveCustomer, tx, updated } = build({
        existing: {
          id: 'customer-existing',
          status: CustomerAccountStatus.ACTIVE,
        },
        current: {
          selectedPlanId: 'plan-starter',
          preferredBillingCycle: BillingCycle.MONTHLY,
          originChannel: CustomerOriginChannel.PARTNER_REFERRAL,
          originatingPartnerId: 'partner-first',
        },
      });

      await resolveCustomer(tx, INPUT, {
        ...SELECTION,
        attribution: { ...ATTRIBUTED, partnerId: 'partner-second' },
      });

      const data = updated[0] ?? {};
      expect(data).not.toHaveProperty('originatingPartnerId');
      expect(data).not.toHaveProperty('originatingReferralLinkId');
      expect(data).not.toHaveProperty('referralCodeSnapshot');
    });

    it('writes the three columns together or not at all', async () => {
      // A record naming a partner with no link would make the commission
      // unauditable, so the gate is one condition, not three.
      const { resolveCustomer, tx, updated } = build({
        existing: {
          id: 'customer-existing',
          status: CustomerAccountStatus.PROSPECT,
        },
        current: {
          selectedPlanId: null,
          preferredBillingCycle: null,
          originChannel: null,
          originatingPartnerId: null,
        },
      });

      await resolveCustomer(tx, INPUT, { ...SELECTION, attribution: EXPIRED });

      const data = updated[0] ?? {};
      expect(data).not.toHaveProperty('originatingPartnerId');
      expect(data).not.toHaveProperty('originatingReferralLinkId');
      expect(data).not.toHaveProperty('referralCodeSnapshot');
    });
  });
});
