import { Prisma } from '@prisma/client';

import { BillingService } from './billing.service';

type Db = {
  invoice: { findFirst: jest.Mock; create: jest.Mock };
};

/**
 * BUG-3201. `createInvoice` used to insert and then recover from a unique
 * violation by retrying on the same client. That cannot work inside an
 * interactive transaction (a failed statement aborts it), and it swallowed the
 * wrong error: a duplicate `stripeInvoiceId` is also a unique violation.
 */
describe('BillingService.createInvoice (BUG-3201)', () => {
  const service = Object.create(BillingService.prototype) as {
    createInvoice: (db: unknown, input: object) => Promise<unknown>;
  };
  const input = {
    tenantId: 't1',
    subscriptionId: 's1',
    amount: 10,
    currency: 'USD',
    issueDate: new Date('2026-11-23T00:00:00Z'),
  };

  const build = (taken: boolean[]): Db => ({
    invoice: {
      findFirst: jest.fn(async () => (taken.shift() ? { id: 'x' } : null)),
      create: jest.fn(async ({ data }: { data: object }) => ({
        id: 'new',
        ...data,
      })),
    },
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks the number is free for this tenant before inserting', async () => {
    const db = build([false]);
    await service.createInvoice(db, input);
    expect(db.invoice.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        invoiceNumber: expect.stringMatching(/^INV-20261123-\d{4}$/) as string,
      },
      select: { id: true },
    });
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('draws another number when the first is taken, without ever attempting the colliding insert', async () => {
    const db = build([true, true, false]);
    await service.createInvoice(db, input);
    expect(db.invoice.findFirst).toHaveBeenCalledTimes(3);
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('gives up with a clear error after five taken numbers', async () => {
    const db = build([true, true, true, true, true]);
    await expect(service.createInvoice(db, input)).rejects.toThrow(
      /unique invoice number/i,
    );
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('does NOT swallow a unique violation from the insert (a duplicate stripeInvoiceId must surface, not read as a numbering problem)', async () => {
    const db = build([false]);
    const violation = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    db.invoice.create.mockRejectedValueOnce(violation);
    await expect(service.createInvoice(db, input)).rejects.toBe(violation);
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });
});
