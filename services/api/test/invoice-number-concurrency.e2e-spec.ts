import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BillingService } from '../src/modules/super-admin/billing.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-3201 (independent review follow-up). `createInvoice` picks a number that
 * is free at lookup time, but the lookup cannot guarantee it is still free at
 * insert time. This drives the REAL unique index with a deterministic losing
 * transaction: both callers draw the same number, the winner holds it
 * uncommitted, the loser blocks on the index and, when the winner commits, must
 * recover inside its own still-usable transaction with a different number.
 *
 * EVIDENCE CLASS: database-backed integration, persisted state verified.
 */
describeWithDatabase()('createInvoice number race (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  // Prisma builds a pretty error message for a failed query by resolving the
  // call site through jest's source maps, which throws a TypeError for frames in
  // transformed service code and hides the real unique-violation error. A client
  // with the minimal error format skips that, so the transactions under test use
  // it. Production never goes through jest's source maps.
  let txPrisma: PrismaClient;
  let billing: BillingService;
  let fixtures: DbFixtures;
  const suffix = randomUUID().slice(0, 6);
  let tenantId: string;
  let subscriptionId: string;
  let planId: string;
  const issueDate = new Date('2031-05-17T00:00:00Z');

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    txPrisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL as string,
        max: 4,
      }),
      errorFormat: 'minimal',
    });
    billing = app.get(BillingService);
    fixtures = new DbFixtures(prisma, 'invoice-race');

    const tenant = await fixtures.createTenant('inv');
    tenantId = tenant.id;
    const plan = await prisma.plan.create({
      data: {
        key: `invrace-${suffix}`,
        name: `Invoice race ${suffix}`,
        publicationStatus: 'PUBLISHED',
        isActive: true,
        kind: 'CATALOGUE',
        monthlyBasePrice: 10,
        annualBasePrice: 100,
        currency: 'USD',
      },
      select: { id: true },
    });
    planId = plan.id;
    const subscription = await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'ACTIVE',
        startDate: new Date('2031-01-01'),
        currentPeriodStart: new Date('2031-01-01'),
        currentPeriodEnd: new Date('2099-01-01'),
        renewalDate: new Date('2099-01-01'),
        basePrice: 10,
        finalPrice: 10,
        currency: 'USD',
        purchasedSeats: 1,
        paymentProvider: 'BANK_TRANSFER',
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the app open.
    try {
      await txPrisma.$disconnect();
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await fixtures.cleanup();
      await prisma.plan.deleteMany({ where: { id: planId } });
    } finally {
      await app.close();
    }
  });

  afterEach(() => jest.restoreAllMocks());

  const input = (extra: { stripeInvoiceId?: string } = {}) => ({
    tenantId,
    subscriptionId,
    amount: 10,
    currency: 'USD',
    issueDate,
    ...extra,
  });

  it('a transaction that loses the number race to an uncommitted winner redraws and commits', async () => {
    // Both callers draw 0.1234 first; every later draw differs.
    let draws = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => {
      draws += 1;
      return draws <= 2 ? 0.1234 : 0.5 + draws / 1000;
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const winner = txPrisma.$transaction(async (tx) => {
      const created = await billing.createInvoice(tx, input());
      await gate;
      return created.invoiceNumber;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    // The loser's lookup cannot see the uncommitted winner, so it draws the
    // same number and its insert blocks on the unique index.
    const loser = txPrisma.$transaction(async (tx) => {
      const created = await billing.createInvoice(tx, input());
      // Must still be usable after the refused insert.
      const count = await tx.invoice.count({ where: { tenantId } });
      return { number: created.invoiceNumber, count };
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    release();

    const winnerNumber = await winner;
    const outcome = await loser;
    expect(winnerNumber).toBe('INV-20310517-1234');
    expect(outcome.number).not.toBe(winnerNumber);
    expect(outcome.count).toBe(2);
    const numbers = (
      await prisma.invoice.findMany({
        where: { tenantId },
        select: { invoiceNumber: true },
      })
    ).map((row) => row.invoiceNumber);
    expect(new Set(numbers).size).toBe(2);
  });

  it('a duplicate stripeInvoiceId surfaces as the original error and is not retried as a numbering problem', async () => {
    const stripeInvoiceId = `in_${suffix}`;
    await billing.createInvoice(prisma, input({ stripeInvoiceId }));
    const before = await prisma.invoice.count({ where: { tenantId } });
    await expect(
      txPrisma.$transaction((tx) =>
        billing.createInvoice(tx, input({ stripeInvoiceId })),
      ),
    ).rejects.toThrow(/unique constraint/i);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(before);
  });
});
