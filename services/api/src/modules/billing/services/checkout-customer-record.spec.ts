import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOriginChannel,
} from '@prisma/client';
import { SubscriptionOrderService } from './subscription-order.service';
import type { CustomerIdentityService } from './customer-identity.service';
import type { OutboxService } from '../../outbox/outbox.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TaxBasisService } from './tax-basis.service';

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

const SELECTION = {
  planId: 'plan-growth',
  billingCycle: BillingCycle.ANNUAL,
  originChannel: CustomerOriginChannel.WEBSITE,
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
          },
        ),
    },
  };

  const identity = {
    findExisting: () => Promise.resolve(overrides.existing ?? null),
  } as unknown as CustomerIdentityService;

  const outbox = { emit: () => Promise.resolve() } as unknown as OutboxService;

  const service = new SubscriptionOrderService(
    {} as PrismaService,
    identity,
    {} as TaxBasisService,
    outbox,
  );

  const resolveCustomer = (
    service as unknown as { resolveCustomer: ResolveCustomer }
  ).resolveCustomer.bind(service);

  return { resolveCustomer, tx, created, updated };
}

describe('checkout customer record', () => {
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
});
