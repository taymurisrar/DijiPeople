import { TenantIdentitiesProvisioningService } from './tenant-identities-provisioning.service';

/*
 * REG — BUG-0015: a tenant that failed before identities-and-billing was
 * permanently unrecoverable.
 *
 * The step was declared non-retryable because replaying it created a second
 * owner and a second invoice. It is also the only step that creates the
 * business unit, the owner and the subscription, so a tenant that failed at or
 * before it could never get an owner — and `POST /access` refuses to add one to
 * a tenant with no business unit. Retry skipped the step, reported SUCCEEDED,
 * and produced a tenant that looked healthy and could never be activated.
 *
 * These tests pin the property that made it safe to mark retryable: running the
 * step twice converges. They drive the service against an in-memory double of
 * the three tables that carry the anchors, because what is being asserted is
 * "how many rows exist afterwards", which a jest.fn() call count cannot say.
 */
describe('identities and billing provisioning is re-entrant', () => {
  const TENANT = 'tenant-1';
  const ONBOARDING = 'onboarding-1';

  type Row = Record<string, unknown>;

  /** Enough of Prisma to hold rows and honour the uniqueness the fix relies on. */
  function makeDatabase() {
    const users: Row[] = [];
    const userRoles: Row[] = [];
    const subscriptions: Row[] = [];
    const invoices: Row[] = [];
    const features: Row[] = [];

    const onboarding = {
      id: ONBOARDING,
      customerId: 'customer-1',
      primaryOwnerFirstName: 'Ada',
      primaryOwnerLastName: 'Lovelace',
      primaryOwnerWorkEmail: 'ada@acme.test',
      serviceAccountDisplayName: 'Configuration',
      discountType: 'NONE',
      discountValue: 0,
      agreedPrice: null,
      agreedSeats: null,
      featureSelectionSummary: [{ key: 'attendance', isEnabled: true }],
      customer: { id: 'customer-1' },
    };

    const tx = {
      user: {
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: { tenantId_email: { tenantId: string; email: string } };
          }) =>
            Promise.resolve(
              users.find(
                (row) =>
                  row.tenantId === where.tenantId_email.tenantId &&
                  row.email === where.tenantId_email.email,
              ) ?? null,
            ),
        ),
      },
      userRole: {
        createMany: jest.fn(({ data }: { data: Row[] }) => {
          for (const row of data) {
            const duplicate = userRoles.some(
              (existing) =>
                existing.userId === row.userId &&
                existing.roleId === row.roleId,
            );
            if (!duplicate) userRoles.push(row);
          }
          return Promise.resolve({ count: data.length });
        }),
      },
      tenant: { update: jest.fn(() => Promise.resolve({})) },
      tenantFeature: {
        upsert: jest.fn(
          ({ where }: { where: { tenantId_key: { key: string } } }) => {
            const key = where.tenantId_key.key;
            if (!features.some((row) => row.key === key))
              features.push({ key });
            return Promise.resolve({});
          },
        ),
      },
      customerAccount: { update: jest.fn(() => Promise.resolve({})) },
      customerOnboarding: { update: jest.fn(() => Promise.resolve({})) },
      invoice: {
        findFirst: jest.fn(({ where }: { where: { subscriptionId: string } }) =>
          Promise.resolve(
            invoices.find(
              (row) => row.subscriptionId === where.subscriptionId,
            ) ?? null,
          ),
        ),
      },
    };

    const prisma = {
      customerOnboarding: {
        findUnique: jest.fn(() => Promise.resolve(onboarding)),
      },
      $transaction: jest.fn((work: (client: unknown) => Promise<unknown>) =>
        work(tx),
      ),
    };

    const usersRepository = {
      create: jest.fn((data: Row) => {
        const row = { id: `user-${users.length + 1}`, ...data };
        users.push(row);
        return Promise.resolve(row);
      }),
    };

    const rolesRepository = {
      findByKeyAndTenant: jest.fn((_tenantId: string, key: string) =>
        Promise.resolve({ id: `role-${key}` }),
      ),
    };

    const billingService = {
      /* Mirrors `upsert where { tenantId }` — Subscription.tenantId is @unique. */
      createOrUpdateSubscription: jest.fn(() => {
        let existing = subscriptions.find((row) => row.tenantId === TENANT);
        if (!existing) {
          existing = {
            id: 'subscription-1',
            tenantId: TENANT,
            finalPrice: 100,
            currency: 'USD',
          };
          subscriptions.push(existing);
        }
        return Promise.resolve(existing);
      }),
      createInvoice: jest.fn(
        (_db: unknown, input: { subscriptionId: string }) => {
          const row = {
            id: `invoice-${invoices.length + 1}`,
            subscriptionId: input.subscriptionId,
          };
          invoices.push(row);
          return Promise.resolve(row);
        },
      ),
    };

    const service = new TenantIdentitiesProvisioningService(
      prisma as never,
      usersRepository as never,
      rolesRepository as never,
      billingService as never,
    );

    return { service, users, userRoles, subscriptions, invoices, features };
  }

  const input = {
    tenantId: TENANT,
    onboardingId: ONBOARDING,
    actorUserId: 'actor-1',
    planId: 'plan-1',
    billingCycle: 'MONTHLY' as never,
    createServiceAccount: true,
    serviceAccountEmail: 'svc@acme.test',
    serviceAccountDisplayName: 'Configuration',
    assignServiceAccountSystemAdminRole: true,
  };

  it('creates the owner, service account, subscription and invoice on a clean run', async () => {
    const db = makeDatabase();
    const outcome = await db.service.ensureIdentitiesAndBilling(input);

    expect(db.users).toHaveLength(2);
    expect(db.subscriptions).toHaveLength(1);
    expect(db.invoices).toHaveLength(1);
    expect(outcome.invoiceCreated).toBe(true);
    expect(outcome.createdIdentities).toHaveLength(2);
  });

  it('creates no duplicate of anything when replayed', async () => {
    const db = makeDatabase();
    await db.service.ensureIdentitiesAndBilling(input);
    const replay = await db.service.ensureIdentitiesAndBilling(input);

    /*
     * The whole of the fix, in four assertions. Before it, a replay produced a
     * second owner, a second service account and a second invoice — which is
     * exactly why the step had to be declared non-retryable, and why a tenant
     * that failed before it could never be recovered.
     */
    expect(db.users).toHaveLength(2);
    expect(db.userRoles).toHaveLength(2);
    expect(db.subscriptions).toHaveLength(1);
    expect(db.invoices).toHaveLength(1);
    expect(replay.invoiceCreated).toBe(false);
  });

  it('reports nothing as newly created on a replay, so nobody is re-invited', async () => {
    const db = makeDatabase();
    await db.service.ensureIdentitiesAndBilling(input);
    const replay = await db.service.ensureIdentitiesAndBilling(input);

    expect(replay.createdIdentities).toHaveLength(0);
    /* The identities still exist and are still reported — just not as new. */
    expect(replay.identities).toHaveLength(2);
  });

  it('reports the owner as newly created when only it was missing', async () => {
    /*
     * The recovery case: the tenant died before step 5, so nothing exists yet.
     * The owner must be reported as created so the invitations step mails them
     * — a recovered owner with no invitation cannot reach the workspace.
     */
    const db = makeDatabase();
    const outcome = await db.service.ensureIdentitiesAndBilling({
      ...input,
      createServiceAccount: false,
      serviceAccountEmail: null,
    });

    expect(outcome.createdIdentities.map((item) => item.email)).toEqual([
      'ada@acme.test',
    ]);
  });

  it('replays feature overrides without duplicating them', async () => {
    const db = makeDatabase();
    await db.service.ensureIdentitiesAndBilling(input);
    await db.service.ensureIdentitiesAndBilling(input);

    expect(db.features).toHaveLength(1);
  });
});
