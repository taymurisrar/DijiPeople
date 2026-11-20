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
      createWorkspace: jest.fn().mockResolvedValue({ tenantId: 'tenant-new' }),
      ensureSystemDomain: jest.fn().mockResolvedValue({ domain: 'acme.test' }),
      ensureOwnerInvitations: jest.fn().mockResolvedValue([]),
    };
    const dispatcher = { register: jest.fn() };
    const activation = { markTenantReady: jest.fn() };
    const settlement = { recordOrderPayment: jest.fn() };
    const runs = {
      startOrResumeForOrder: jest
        .fn()
        .mockResolvedValue({ id: 'run-1', attempt: 1, resumed: false }),
      stepStarted: jest.fn(),
      stepSucceeded: jest.fn(),
      stepSkipped: jest.fn(),
      stepFailed: jest.fn(),
      finish: jest.fn(),
    };
    const audit = { log: jest.fn() };
    const handler = new ProvisioningRequestedHandler(
      prisma as never,
      onboarding as never,
      dispatcher as never,
      activation as never,
      settlement as never,
      runs as never,
      audit as never,
    );
    return { handler, onboarding, activation, settlement, tx, runs, audit };
  }

  it('links the order to the tenant it creates, in the creating call', async () => {
    const { handler, onboarding } = build(null);
    const outcome = await handler.handle(event, payload);
    expect(outcome.status).toBe('PROCESSED');
    expect(onboarding.createWorkspace).toHaveBeenCalledTimes(1);
    expect(onboarding.createWorkspace).toHaveBeenCalledWith(
      partial({ subscriptionOrderId: 'order-1' }),
    );
  });

  it('never creates a second tenant on a retry, and still finishes the order', async () => {
    const { handler, onboarding, activation, settlement, tx } =
      build('tenant-existing');
    const outcome = await handler.handle(event, payload);
    expect(outcome.status).toBe('PROCESSED');
    expect(onboarding.createWorkspace).not.toHaveBeenCalled();
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

  describe('provisioning run lifecycle (BUG-4484)', () => {
    const auditActions = (audit: { log: jest.Mock }) =>
      audit.log.mock.calls.map((call: [{ action: string }]) => call[0].action);

    it('opens a run keyed on the order and records every step to success', async () => {
      const { handler, runs, audit } = build(null);
      await handler.handle(event, payload);
      expect(runs.startOrResumeForOrder).toHaveBeenCalledWith(
        partial({
          tenantId: 'tenant-new',
          subscriptionOrderId: 'order-1',
          customerAccountId: 'cust-1',
        }),
      );
      const succeeded = runs.stepSucceeded.mock.calls.map(
        (call: [string, string]) => call[1],
      );
      expect(succeeded).toEqual(
        expect.arrayContaining([
          'tenant-record',
          'workspace-domain',
          'invitations',
          'workspace-routing-verified',
        ]),
      );
      expect(runs.finish).toHaveBeenCalledWith('run-1', {
        status: 'SUCCEEDED',
      });
      expect(auditActions(audit)).toEqual([
        'TENANT_PROVISIONING_STARTED',
        'TENANT_PROVISIONING_SUCCEEDED',
      ]);
      // A system action: tenant-less platform routing, no invented actor.
      expect(audit.log).toHaveBeenCalledWith(
        partial({ tenantId: 'platform', actorUserId: null }),
      );
    });

    it('records the failing step on the run, audits it, and rethrows so the outbox retries', async () => {
      const { handler, runs, audit, onboarding } = build(null);
      onboarding.ensureOwnerInvitations.mockRejectedValue(
        new Error('SMTP down'),
      );
      await expect(handler.handle(event, payload)).rejects.toThrow('SMTP down');
      expect(runs.stepFailed).toHaveBeenCalledWith(
        'run-1',
        'invitations',
        'SMTP down',
      );
      expect(runs.finish).toHaveBeenCalledWith('run-1', {
        status: 'FAILED',
        failedStepKey: 'invitations',
        message: 'SMTP down',
      });
      expect(auditActions(audit)).toEqual([
        'TENANT_PROVISIONING_STARTED',
        'TENANT_PROVISIONING_FAILED',
      ]);
    });

    it('records a hostname failure against workspace-domain', async () => {
      const { handler, runs, onboarding } = build(null);
      onboarding.ensureSystemDomain.mockRejectedValue(
        new Error('TENANT_BASE_DOMAIN_NOT_CONFIGURED'),
      );
      await expect(handler.handle(event, payload)).rejects.toThrow(
        'TENANT_BASE_DOMAIN_NOT_CONFIGURED',
      );
      expect(runs.stepFailed).toHaveBeenCalledWith(
        'run-1',
        'workspace-domain',
        'TENANT_BASE_DOMAIN_NOT_CONFIGURED',
      );
    });

    it('records a settlement or readiness failure and rethrows', async () => {
      const { handler, runs, settlement } = build(null);
      settlement.recordOrderPayment.mockRejectedValue(new Error('ledger down'));
      await expect(handler.handle(event, payload)).rejects.toThrow(
        'ledger down',
      );
      expect(runs.finish).toHaveBeenCalledWith(
        'run-1',
        partial({
          status: 'FAILED',
          failedStepKey: 'workspace-routing-verified',
        }),
      );
    });

    it('resumes the same run on a retry instead of recreating the early steps', async () => {
      const { handler, runs, audit, onboarding } = build('tenant-existing');
      runs.startOrResumeForOrder.mockResolvedValue({
        id: 'run-1',
        attempt: 3,
        resumed: true,
      });
      await handler.handle(event, payload);
      expect(onboarding.createWorkspace).not.toHaveBeenCalled();
      const succeeded = runs.stepSucceeded.mock.calls.map(
        (call: [string, string]) => call[1],
      );
      expect(succeeded).not.toContain('tenant-record');
      expect(runs.stepSkipped).not.toHaveBeenCalled();
      expect(onboarding.ensureSystemDomain).toHaveBeenCalledWith(
        'tenant-existing',
        null,
      );
      expect(auditActions(audit)[0]).toBe('TENANT_PROVISIONING_RESUMED');
    });

    it('still provisions when the run cannot be recorded (telemetry never blocks)', async () => {
      const { handler, runs, onboarding } = build(null);
      runs.startOrResumeForOrder.mockResolvedValue(null);
      const outcome = await handler.handle(event, payload);
      expect(outcome.status).toBe('PROCESSED');
      expect(onboarding.ensureOwnerInvitations).toHaveBeenCalled();
    });

    it('never fails provisioning because the audit write failed', async () => {
      const { handler, audit } = build(null);
      audit.log.mockRejectedValue(new Error('audit down'));
      const outcome = await handler.handle(event, payload);
      expect(outcome.status).toBe('PROCESSED');
    });
  });
});
