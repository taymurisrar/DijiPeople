import type { OutboxEvent } from '@prisma/client';
import { ProvisioningRequestedHandler } from './provisioning-requested.handler';

/**
 * BUG-4467. Provisioning created the tenant, then failed (no hostname could be
 * issued), and the outbox retried. The order did not yet know about the tenant,
 * so every retry created another one: three tenants for one paid order.
 *
 * The order is now pointed at the tenant inside the creating transaction, so a
 * retry must find it, skip creation, and still run the closing steps.
 */
/** `expect.objectContaining` is typed `any`; naming it `unknown` keeps the lint budget. */
const partial = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

describe('ProvisioningRequestedHandler idempotency', () => {
  const event = {} as OutboxEvent;
  const payload = { subscriptionOrderId: 'order-1' };

  function build(orderTenantId: string | null) {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-1',
      tenantId: orderTenantId,
      customerAccountId: 'cust-1',
      planId: 'plan-1',
      planPriceId: 'price-1',
      billingCycle: 'MONTHLY',
      currency: 'USD',
      requestedSeats: 5,
      requestedSlug: 'acme',
      paymentProvider: null,
      stripeCheckoutSessionId: null,
      subscription: null,
      customer: {
        companyName: 'Acme',
        contactEmail: 'a@example.test',
        primaryContactFirstName: 'A',
        primaryContactLastName: 'B',
        primaryContactEmail: 'a@example.test',
      },
    };
    const tx = {
      subscriptionOrder: { update: jest.fn() },
      customerAccount: { update: jest.fn() },
      customerOnboarding: { updateMany: jest.fn() },
    };
    const prisma = {
      subscriptionOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const onboarding = {
      resolveWorkspaceSlug: jest.fn().mockResolvedValue('acme'),
      provisionTenantForCustomer: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-new' }),
    };
    const dispatcher = { register: jest.fn() };
    const activation = { markTenantReady: jest.fn() };
    const settlement = { recordOrderPayment: jest.fn() };
    const handler = new ProvisioningRequestedHandler(
      prisma as never,
      onboarding as never,
      dispatcher as never,
      activation as never,
      settlement as never,
    );
    return { handler, onboarding, activation, settlement, tx };
  }

  it('links the order to the tenant it creates, in the creating call', async () => {
    const { handler, onboarding } = build(null);
    const outcome = await handler.handle(event, payload);
    expect(outcome.status).toBe('PROCESSED');
    expect(onboarding.provisionTenantForCustomer).toHaveBeenCalledTimes(1);
    expect(onboarding.provisionTenantForCustomer).toHaveBeenCalledWith(
      partial({ subscriptionOrderId: 'order-1' }),
    );
  });

  it('never creates a second tenant on a retry, and still finishes the order', async () => {
    const { handler, onboarding, activation, settlement, tx } =
      build('tenant-existing');
    const outcome = await handler.handle(event, payload);
    expect(outcome.status).toBe('PROCESSED');
    expect(onboarding.provisionTenantForCustomer).not.toHaveBeenCalled();
    expect(tx.subscriptionOrder.update).toHaveBeenCalledWith(
      partial({
        data: partial({ tenantId: 'tenant-existing' }),
      }),
    );
    expect(settlement.recordOrderPayment).toHaveBeenCalledWith('order-1');
    expect(activation.markTenantReady).toHaveBeenCalledWith({
      tenantId: 'tenant-existing',
      orderId: 'order-1',
    });
  });
});
