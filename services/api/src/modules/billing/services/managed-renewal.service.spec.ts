import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { ManagedRenewalService } from './managed-renewal.service';

type Row = Record<string, unknown>;

/**
 * The period-boundary sweep reads candidates, then writes each transition.
 * Between the two a renewal can be paid or a cancellation revoked, so the write
 * must be conditional on everything the decision was made from — Reviewer
 * finding 1 (SESSION-0108): matching on status alone expired a tenant who had
 * just paid, because a paid renewal leaves the status ACTIVE.
 */
function harness(live: Row, snapshot: Row = { ...live }) {
  const invoiceUpdates: Row[] = [];
  const prisma = {
    subscription: {
      findMany: () => Promise.resolve([snapshot]),
      updateMany: ({ where, data }: { where: Row; data: Row }) => {
        const matches = Object.entries(where).every(([key, value]) =>
          value instanceof Date
            ? (live[key] as Date | null)?.getTime() === value.getTime()
            : live[key] === value,
        );
        if (!matches) return Promise.resolve({ count: 0 });
        Object.assign(live, data);
        return Promise.resolve({ count: 1 });
      },
    },
    invoice: {
      updateMany: ({ where, data }: { where: Row; data: Row }) => {
        invoiceUpdates.push({ where, data });
        return Promise.resolve({ count: 1 });
      },
    },
    $transaction: <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };
  const service = new ManagedRenewalService(
    prisma as never,
    { get: () => undefined } as never,
    {} as never,
    {} as never,
    { log: () => Promise.resolve() } as never,
  );
  return { service, live, invoiceUpdates };
}

describe('ManagedRenewalService.applyPeriodBoundaries', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const ended = new Date('2026-09-25T00:00:00Z');
  const base = {
    id: 'sub-1',
    tenantId: 'tenant-1',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: ended,
    cancelAtPeriodEnd: false,
    gracePeriodEndsAt: null,
  };

  it('moves an unpaid renewal to PAST_DUE and marks its invoice overdue', async () => {
    const h = harness({ ...base });

    await expect(h.service.applyPeriodBoundaries(now)).resolves.toBe(1);

    expect(h.live.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(h.invoiceUpdates[0].data).toEqual({ status: InvoiceStatus.OVERDUE });
  });

  it('leaves a subscription renewed between the read and the write alone', async () => {
    const renewedThrough = new Date('2026-10-25T00:00:00Z');
    const h = harness(
      { ...base, currentPeriodEnd: renewedThrough },
      { ...base },
    );

    await expect(h.service.applyPeriodBoundaries(now)).resolves.toBe(0);

    expect(h.live.status).toBe(SubscriptionStatus.ACTIVE);
    expect(h.live.gracePeriodEndsAt).toBeNull();
  });

  it('leaves a cancellation revoked between the read and the write alone', async () => {
    const h = harness(
      { ...base, cancelAtPeriodEnd: false },
      { ...base, cancelAtPeriodEnd: true },
    );

    await h.service.applyPeriodBoundaries(now);

    expect(h.live.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('withdraws open renewals when a subscription ends', async () => {
    const h = harness({ ...base, cancelAtPeriodEnd: true });

    await h.service.applyPeriodBoundaries(now);

    expect(h.live).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      autoRenew: false,
    });
    expect(h.invoiceUpdates[0].data).toMatchObject({
      status: InvoiceStatus.VOIDED,
    });
  });
});
