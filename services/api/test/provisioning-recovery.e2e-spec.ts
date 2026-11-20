import { Test, TestingModule } from '@nestjs/testing';
import {
  SubscriptionOrderStatus,
  TenantProvisioningRunStatus,
  UserInvitationStatus,
} from '@prisma/client';
import type { OutboxEvent } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { ProvisioningRequestedHandler } from '../src/modules/super-admin/provisioning-requested.handler';
import { UserInvitationsService } from '../src/modules/auth/user-invitations.service';
import { TenantProvisioningService } from '../src/modules/super-admin/tenant-provisioning.service';
import { OrderActivationService } from '../src/modules/billing/services/order-activation.service';
import { PaymentSettlementService } from '../src/modules/billing/services/payment-settlement.service';
import { ProvisioningOperationsService } from '../src/modules/tenant-control-plane/provisioning-operations.service';
import { describeWithDatabase } from './helpers/db-fixtures';

/**
 * Self-service provisioning survives a failure AFTER the tenant exists
 * (BUG-4467, BUG-4484), against a real PostgreSQL and the real Nest graph.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The defects were row counts: three tenants
 * for one order, an owner who never got an invitation, a hostname never issued.
 * Each is a statement about what the database holds after N retries, and a
 * Prisma double returns whatever the test imagined.
 *
 * Each scenario makes one step fail three times (the outbox's retries), then
 * lets it succeed, and asserts the invariants that must hold throughout: one
 * tenant, one subscription, one owner, exactly one activation email, the order
 * ACTIVATED against the tenant, the tenant READY, and ONE provisioning run
 * (visible to Operations) that counted every attempt.
 */
const BASE_DOMAIN = 'recovery.e2e.test';

/** Every variable the platform reads a tenant base domain from. */
const BASE_DOMAIN_KEYS = [
  'TENANT_BASE_DOMAIN',
  'NEXT_PUBLIC_TENANT_BASE_DOMAIN',
  'NEXT_PUBLIC_TENANT_ROOT_DOMAIN',
  'WEB_APP_PROD_ROOT_DOMAIN',
  'NEXT_PUBLIC_WEB_ROOT_DOMAIN',
  'PUBLIC_BASE_DOMAIN',
  'NEXT_PUBLIC_PUBLIC_BASE_DOMAIN',
];
const savedDomainEnv = new Map(
  BASE_DOMAIN_KEYS.map((key) => [key, process.env[key]] as const),
);

/** Make the environment genuinely unconfigured, as a fresh deployment is. */
function unconfigureBaseDomain() {
  for (const key of BASE_DOMAIN_KEYS) delete process.env[key];
}

/** Restore the environment, then point the tenant base domain at the test domain. */
function configureBaseDomain() {
  for (const [key, value] of savedDomainEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.env.TENANT_BASE_DOMAIN = BASE_DOMAIN;
}

/** A platform operator: the queue is explicitly platform-guarded. */
function platformUser(): AuthenticatedUser {
  return {
    userId: 'recovery-test-operator',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: ['tenants.read'],
    rolePrivileges: [],
    authSubjectType: 'platform-user',
    platform: { id: 'recovery-test-operator', role: null },
  } as unknown as AuthenticatedUser;
}

describeWithDatabase()('Self-service provisioning recovery (DB-backed)', () => {
  jest.setTimeout(240_000);

  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let handler: ProvisioningRequestedHandler;
  let invitations: UserInvitationsService;
  let tenantProvisioning: TenantProvisioningService;
  let activation: OrderActivationService;
  let settlement: PaymentSettlementService;
  let queue: ProvisioningOperationsService;

  const runId = Date.now().toString(36);
  const customerIds: string[] = [];
  const orderIds: string[] = [];
  let marketId = '';
  let planId = '';
  let planPriceId = '';
  let emailsSent = 0;

  const event = {} as OutboxEvent;

  /** The email transport, counted. A real SMTP send is never the point here. */
  function countEmails() {
    emailsSent = 0;
    jest
      .spyOn(
        invitations as unknown as {
          sendAccountActivationEmail: () => Promise<unknown>;
        },
        'sendAccountActivationEmail',
      )
      .mockImplementation(() => {
        emailsSent += 1;
        return Promise.resolve({ sent: true, status: 'SENT' });
      });
  }

  async function makeOrder(suffix: string) {
    const email = `owner-${suffix}-${runId}@example.test`;
    const customer = await prisma.customerAccount.create({
      data: {
        companyName: `Recovery ${suffix} ${runId}`,
        country: 'PK',
        contactEmail: email,
        primaryContactEmail: email,
        primaryContactFirstName: 'Rae',
        primaryContactLastName: 'Cover',
      },
      select: { id: true },
    });
    customerIds.push(customer.id);
    const order = await prisma.subscriptionOrder.create({
      data: {
        orderNumber: `ORD-REC-${suffix}-${runId}`,
        customerAccountId: customer.id,
        planId,
        planPriceId,
        marketId,
        currency: 'PKR',
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        requestedSeats: 5,
        unitAmount: 5000,
        subtotalAmount: 25000,
        taxableAmount: 25000,
        totalAmount: 25000,
        status: SubscriptionOrderStatus.PAID,
        paidAt: new Date(),
        requestedSlug: `rec-${suffix}-${runId}`.slice(0, 40),
        ownerEmailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    orderIds.push(order.id);
    return { orderId: order.id, customerId: customer.id, email };
  }

  /** Three failed deliveries, as the outbox would retry them. */
  async function failThreeTimes(orderId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        handler.handle(event, { subscriptionOrderId: orderId }),
      ).rejects.toBeDefined();
    }
  }

  async function succeed(orderId: string) {
    const outcome = await handler.handle(event, {
      subscriptionOrderId: orderId,
    });
    expect(outcome.status).toBe('PROCESSED');
  }

  /** The invariants every scenario must end on. */
  async function expectConverged(
    orderId: string,
    customerId: string,
    email: string,
    expectedAttempt: number,
    // A redelivery after success succeeds (and is audited) again.
    successes = 1,
  ) {
    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, tenantId: true },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.ACTIVATED);
    expect(order.tenantId).not.toBeNull();
    const tenantId = order.tenantId as string;

    expect(
      await prisma.tenant.count({ where: { customerAccountId: customerId } }),
    ).toBe(1);
    expect(await prisma.subscription.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.user.count({ where: { tenantId, email } })).toBe(1);
    expect(
      (
        await prisma.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { readinessStatus: true },
        })
      ).readinessStatus,
    ).toBe('READY');

    // Exactly one live invitation, and exactly one email for it.
    expect(
      await prisma.userInvitation.count({
        where: { tenantId, status: UserInvitationStatus.PENDING },
      }),
    ).toBe(1);
    expect(emailsSent).toBe(1);

    // One system hostname, primary.
    expect(
      await prisma.tenantDomain.count({
        where: { tenantId, isPrimary: true },
      }),
    ).toBe(1);

    // One run for the order, which counted every attempt; Operations sees it.
    const runs = await prisma.tenantProvisioningRun.findMany({
      where: { subscriptionOrderId: orderId },
      include: { steps: true },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe(TenantProvisioningRunStatus.SUCCEEDED);
    expect(runs[0].attempt).toBe(expectedAttempt);
    expect(runs[0].failedStepKey).toBeNull();
    expect(runs[0].requestedById).toBeNull();
    expect(
      runs[0].steps.every(
        (step) => step.status === 'SUCCEEDED' || step.status === 'SKIPPED',
      ),
    ).toBe(true);

    const listed = await queue.listQueue(platformUser(), {
      includeCompleted: true,
      limit: 200,
    });
    expect(listed.rows.some((row) => row.subscriptionOrderId === orderId)).toBe(
      true,
    );

    expect(
      await prisma.platformAuditLog.count({
        where: {
          entityId: runs[0].id,
          action: 'TENANT_PROVISIONING_SUCCEEDED',
        },
      }),
    ).toBe(successes);
    return { tenantId, run: runs[0] };
  }

  beforeAll(async () => {
    configureBaseDomain();
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    handler = moduleRef.get(ProvisioningRequestedHandler);
    invitations = moduleRef.get(UserInvitationsService);
    tenantProvisioning = moduleRef.get(TenantProvisioningService);
    activation = moduleRef.get(OrderActivationService);
    settlement = moduleRef.get(PaymentSettlementService);
    queue = moduleRef.get(ProvisioningOperationsService);

    marketId = (
      await prisma.market.create({
        data: {
          code: `RC-${runId}`,
          name: 'Recovery test',
          defaultCurrency: 'PKR',
          supportedCurrencies: ['PKR'],
          publicationStatus: 'PUBLISHED',
          isEnabled: true,
          selfServiceEnabled: true,
        },
        select: { id: true },
      })
    ).id;
    planId = (
      await prisma.plan.create({
        data: {
          key: `rec-plan-${runId}`,
          name: `Recovery ${runId}`,
          currency: 'PKR',
          publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
      })
    ).id;
    planPriceId = (
      await prisma.planPrice.create({
        data: {
          planId,
          marketId,
          billingCycle: 'MONTHLY',
          currency: 'PKR',
          unitAmount: 5000,
          isActive: true,
          publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(() => {
    configureBaseDomain();
    countEmails();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    for (const [key, value] of savedDomainEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    const tenants = await prisma.tenant.findMany({
      where: { customerAccountId: { in: customerIds } },
      select: { id: true },
    });
    const tenantIds = tenants.map((tenant) => tenant.id);
    const runs = await prisma.tenantProvisioningRun.findMany({
      where: { subscriptionOrderId: { in: orderIds } },
      select: { id: true },
    });
    await prisma.platformAuditLog.deleteMany({
      where: {
        entityType: 'TenantProvisioningRun',
        entityId: { in: runs.map((run) => run.id) },
      },
    });
    await prisma.platformEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { customerAccountId: { in: customerIds } },
          { tenantId: { in: tenantIds } },
        ],
      },
    });
    await prisma.subscriptionOrder.updateMany({
      where: { id: { in: orderIds } },
      data: { tenantId: null, subscriptionId: null },
    });
    await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscription.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.updateMany({
      where: { id: { in: tenantIds } },
      data: { ownerUserId: null },
    });
    await prisma.customerAccount.updateMany({
      where: { id: { in: customerIds } },
      data: { primaryOwnerUserId: null },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.subscriptionOrder.deleteMany({
      where: { id: { in: orderIds } },
    });
    await prisma.customerAccount.deleteMany({
      where: { id: { in: customerIds } },
    });
    await prisma.planPrice.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.market.deleteMany({ where: { id: marketId } });
    await moduleRef.close();
  });

  it('(a) the owner invitation step throws three times: still one tenant, one invitation, one email', async () => {
    const { orderId, customerId, email } = await makeOrder('inv');
    const real = invitations.issueInvitation.bind(
      invitations,
    ) as UserInvitationsService['issueInvitation'];
    let calls = 0;
    jest.spyOn(invitations, 'issueInvitation').mockImplementation((input) => {
      calls += 1;
      if (calls <= 3) return Promise.reject(new Error('mail subsystem down'));
      return real(input);
    });

    await failThreeTimes(orderId);
    // The tenant already exists and the order already knows it.
    expect(
      await prisma.tenant.count({ where: { customerAccountId: customerId } }),
    ).toBe(1);
    const mid = await prisma.tenantProvisioningRun.findFirstOrThrow({
      where: { subscriptionOrderId: orderId },
    });
    expect(mid.status).toBe(TenantProvisioningRunStatus.FAILED);
    expect(mid.failedStepKey).toBe('invitations');
    expect(mid.attempt).toBe(3);

    await succeed(orderId);
    await expectConverged(orderId, customerId, email, 4);
  });

  it('(a2) the invitation is created and THEN the call throws: the retry does not send a second email', async () => {
    const { orderId, customerId, email } = await makeOrder('inv2');
    const real = invitations.issueInvitation.bind(
      invitations,
    ) as UserInvitationsService['issueInvitation'];
    let first = true;
    jest
      .spyOn(invitations, 'issueInvitation')
      .mockImplementation(async (input) => {
        const result = await real(input);
        if (first) {
          first = false;
          throw new Error('crashed after the invitation was sent');
        }
        return result;
      });

    await expect(
      handler.handle(event, { subscriptionOrderId: orderId }),
    ).rejects.toThrow('crashed after');
    await succeed(orderId);
    // A redelivery after success changes nothing either.
    await succeed(orderId);
    await expectConverged(orderId, customerId, email, 3, 2);
  });

  it('(b) the system hostname cannot be issued three times (TENANT_BASE_DOMAIN_NOT_CONFIGURED): recovered once, idempotently', async () => {
    const { orderId, customerId, email } = await makeOrder('dom');
    unconfigureBaseDomain();

    await failThreeTimes(orderId);
    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { tenantId: true },
    });
    // Incomplete activation: the tenant exists and has no hostname yet.
    expect(
      await prisma.tenantDomain.count({
        where: { tenantId: order.tenantId as string },
      }),
    ).toBe(0);
    const mid = await prisma.tenantProvisioningRun.findFirstOrThrow({
      where: { subscriptionOrderId: orderId },
    });
    expect(mid.failedStepKey).toBe('workspace-domain');

    configureBaseDomain();
    const spy = jest.spyOn(tenantProvisioning, 'provisionSystemDomain');
    await succeed(orderId);
    await succeed(orderId); // redelivery: the hostname is not announced again
    expect(spy).toHaveBeenCalledTimes(1);
    const { tenantId } = await expectConverged(
      orderId,
      customerId,
      email,
      5,
      2,
    );
    expect(
      await prisma.platformEvent.count({
        where: { tenantId, eventCode: 'TENANT_PROVISIONING_REQUESTED' },
      }),
    ).toBe(1);
  });

  it('(c1) markTenantReady throws three times: the order still ends ACTIVATED and the tenant READY', async () => {
    const { orderId, customerId, email } = await makeOrder('ready');
    const real = activation.markTenantReady.bind(
      activation,
    ) as OrderActivationService['markTenantReady'];
    let calls = 0;
    jest.spyOn(activation, 'markTenantReady').mockImplementation((input) => {
      calls += 1;
      if (calls <= 3)
        return Promise.reject(new Error('readiness write failed'));
      return real(input);
    });

    await failThreeTimes(orderId);
    // The hostname and the single invitation already landed before the failure.
    expect(emailsSent).toBe(1);
    await succeed(orderId);
    await expectConverged(orderId, customerId, email, 4);
  });

  it('(c2) recordOrderPayment throws three times: converges without a duplicate tenant, user or email', async () => {
    const { orderId, customerId, email } = await makeOrder('settle');
    const real = settlement.recordOrderPayment.bind(
      settlement,
    ) as PaymentSettlementService['recordOrderPayment'];
    let calls = 0;
    jest
      .spyOn(settlement, 'recordOrderPayment')
      .mockImplementation((id: string) => {
        calls += 1;
        if (calls <= 3) return Promise.reject(new Error('ledger unavailable'));
        return real(id);
      });

    await failThreeTimes(orderId);
    await succeed(orderId);
    await expectConverged(orderId, customerId, email, 4);
  });
});
