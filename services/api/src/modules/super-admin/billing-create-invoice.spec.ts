import { Prisma } from '@prisma/client';

import { BillingService } from './billing.service';

type Db = {
  invoice: { findFirst: jest.Mock; create: jest.Mock };
  $connect?: jest.Mock;
  $executeRaw?: jest.Mock;
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

  // A root client has $connect; a transaction client does not.
  const build = (taken: boolean[], tx = false): Db => ({
    ...(tx
      ? {
          $executeRaw: jest.fn(async () => 0),
        }
      : { $connect: jest.fn() }),
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
    const db = build([false, false]);
    const violation = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    db.invoice.create.mockRejectedValueOnce(violation);
    await expect(service.createInvoice(db, input)).rejects.toBe(violation);
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });

  const violation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  it('inside a transaction: a number lost in the race is rolled back to a savepoint and redrawn', async () => {
    // free at check time, then another transaction commits the same number
    const db = build([false, true, false], true);
    db.invoice.create.mockRejectedValueOnce(violation());
    await expect(service.createInvoice(db, input)).resolves.toBeDefined();
    expect(db.invoice.create).toHaveBeenCalledTimes(2);
    const sql = (db.$executeRaw as jest.Mock).mock.calls.map((c) =>
      (c[0] as string[]).join('').trim(),
    );
    expect(sql).toEqual([
      'SAVEPOINT invoice_number_insert',
      'ROLLBACK TO SAVEPOINT invoice_number_insert',
      'SAVEPOINT invoice_number_insert',
      'RELEASE SAVEPOINT invoice_number_insert',
    ]);
  });

  it('inside a transaction: a duplicate stripeInvoiceId is rolled back and rethrown, not retried', async () => {
    const db = build([false, false], true);
    const v = violation();
    db.invoice.create.mockRejectedValueOnce(v);
    await expect(service.createInvoice(db, input)).rejects.toBe(v);
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('outside a transaction no savepoint is issued', async () => {
    const db = build([false, true, false]);
    db.invoice.create.mockRejectedValueOnce(violation());
    await service.createInvoice(db, input);
    expect(db.invoice.create).toHaveBeenCalledTimes(2);
  });
});
