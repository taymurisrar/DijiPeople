import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ensureIdentityForEmail } from '../src/modules/users/identity.service';
import { describeWithDatabase } from './helpers/db-fixtures';

/**
 * BUG-3201. `ensureIdentityForEmail` recovered from a unique violation by
 * re-reading on the same client. Inside an interactive transaction Postgres has
 * already aborted the transaction at the failed statement, so the recovery read
 * failed ("current transaction is aborted") and the caller's whole provisioning
 * rolled back. Two of its three callers run it inside `$transaction`.
 *
 * This drives the real function against the real schema:
 *   - the raw INSERT is valid for the table as migrations built it (a column
 *     that lost its default, or a renamed one, fails here and nowhere else);
 *   - many concurrent TRANSACTIONS for one email all succeed and agree on one
 *     row, which the old code could not do.
 *
 * EVIDENCE CLASS: database-backed integration, persisted state verified.
 */
describeWithDatabase()('ensureIdentityForEmail under concurrency (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = `idc-${randomUUID().slice(0, 8)}`;
  const email = (label: string) => `${prefix}-${label}@example.invalid`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the app open.
    try {
      await prisma.identity.deleteMany({
        where: { email: { startsWith: prefix } },
      });
    } finally {
      await app.close();
    }
  });

  it('creates a usable identity row with every default applied', async () => {
    const id = await ensureIdentityForEmail(
      prisma,
      email('fresh').toUpperCase(),
      'hash-fresh',
    );
    const row = await prisma.identity.findUniqueOrThrow({ where: { id } });
    expect(row.email).toBe(email('fresh'));
    expect(row.passwordHash).toBe('hash-fresh');
    expect(row.status).toBe('ACTIVE');
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('returns the existing identity and leaves its credential untouched', async () => {
    const first = await ensureIdentityForEmail(prisma, email('same'), 'real');
    const second = await ensureIdentityForEmail(
      prisma,
      email('same'),
      'placeholder-nobody-knows',
    );
    expect(second).toBe(first);
    expect(
      (await prisma.identity.findUniqueOrThrow({ where: { id: first } }))
        .passwordHash,
    ).toBe('real');
  });

  it('twelve concurrent TRANSACTIONS for one email all commit and agree on one row', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        prisma.$transaction((tx) =>
          ensureIdentityForEmail(tx, email('race'), `hash-${i}`),
        ),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    expect(failed.map((r) => String(r.reason))).toEqual([]);
    const ids = new Set(
      results.map((r) => (r as PromiseFulfilledResult<string>).value),
    );
    expect(ids.size).toBe(1);
    expect(
      await prisma.identity.count({ where: { email: email('race') } }),
    ).toBe(1);
  });

  it('a transaction that loses the race to an UNCOMMITTED winner still commits (deterministic reproduction)', async () => {
    // Transaction 1 inserts the identity and holds it uncommitted. Transaction 2
    // does not see it, so its first read is empty and its insert BLOCKS on the
    // unique index. When 1 commits, the old code's `create` failed with a unique
    // violation, Postgres aborted transaction 2, and the recovery read failed
    // with "current transaction is aborted". `ON CONFLICT DO NOTHING` proceeds.
    const raceEmail = email('uncommitted');
    const winnerId = randomUUID();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const winner = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "Identity" ("id", "email", "passwordHash", "updatedAt")
        VALUES (${winnerId}, ${raceEmail}, ${'winner-hash'}, ${new Date()})`;
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const loser = prisma.$transaction((tx) =>
      ensureIdentityForEmail(tx, raceEmail, 'loser-hash'),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await winner;

    await expect(loser).resolves.toBe(winnerId);
    expect(await prisma.identity.count({ where: { email: raceEmail } })).toBe(
      1,
    );
    expect(
      (await prisma.identity.findUniqueOrThrow({ where: { id: winnerId } }))
        .passwordHash,
    ).toBe('winner-hash');
  });

  it('a SAVEPOINT keeps an interactive transaction usable after a unique violation (the pattern recruitment uses)', async () => {
    const existing = email('savepoint');
    await prisma.identity.create({
      data: { email: existing, passwordHash: 'h' },
    });
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SAVEPOINT s1`;
      let violated = false;
      try {
        await tx.identity.create({
          data: { email: existing, passwordHash: 'dup' },
        });
      } catch {
        violated = true;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT s1`;
      }
      // Would throw "current transaction is aborted" without the rollback above.
      const count = await tx.identity.count({ where: { email: existing } });
      await tx.identity.create({
        data: { email: email('after-savepoint'), passwordHash: 'ok' },
      });
      return { violated, count };
    });
    expect(outcome).toEqual({ violated: true, count: 1 });
    // The statement after the rollback was committed with the transaction.
    expect(
      await prisma.identity.count({
        where: { email: email('after-savepoint') },
      }),
    ).toBe(1);
  });

  it('WITHOUT the savepoint the same sequence aborts the transaction (why the old recovery could not work)', async () => {
    const existing = email('nosavepoint');
    await prisma.identity.create({
      data: { email: existing, passwordHash: 'h' },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        try {
          await tx.identity.create({
            data: { email: existing, passwordHash: 'dup' },
          });
        } catch {
          // swallowed, exactly as the old code did
        }
        return tx.identity.count({ where: { email: existing } });
      }),
    ).rejects.toThrow(/current transaction is aborted/i);
  });

  it('the transaction is still usable after losing the race', async () => {
    // A winner exists before the transaction starts: its first read may or may
    // not see it, and either way the transaction must go on to write.
    await ensureIdentityForEmail(prisma, email('late'), 'winner');
    const outcome = await prisma.$transaction(async (tx) => {
      const id = await ensureIdentityForEmail(tx, email('late'), 'loser');
      // A further statement on the same transaction: it would throw "current
      // transaction is aborted" if the previous step had poisoned it.
      return tx.identity.count({ where: { id } });
    });
    expect(outcome).toBe(1);
  });
});
