import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { PlatformNumberingService } from '../src/common/numbering/platform-numbering.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuditService } from '../src/modules/audit/audit.service';

/**
 * ADR-0027 allocation guarantees, executed against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. "Twenty-five concurrent creators get
 * twenty-five distinct, consecutive numbers" is a property of the row lock
 * `UPDATE … RETURNING` takes, and "a rolled-back create hands its number back"
 * is a property of the transaction. A Prisma double would return whatever it
 * was told and prove neither.
 *
 * Each run creates its own sequence row under a unique key rather than
 * drawing from `partner`: the code path is identical (the service is keyed),
 * and a test that advanced the real partner counter would leave a gap in a
 * shared database's partner numbers every time it ran.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Platform number sequences (DB-backed)', () => {
  jest.setTimeout(120_000);

  const prisma = createTestPrismaClient();
  const service = new PlatformNumberingService(
    prisma as unknown as PrismaService,
    { log: jest.fn() } as unknown as AuditService,
  );
  const key = `e2e-seq-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.platformNumberSequence.create({
      data: {
        key,
        label: 'E2E sequence',
        prefix: 'PART-',
        padding: 6,
        nextValue: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.platformNumberSequence.deleteMany({ where: { key } });
    await prisma.$disconnect();
  });

  it('issues 25 distinct, consecutive numbers to 25 concurrent transactions', async () => {
    const N = 25;
    const issued = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.$transaction((tx) => service.next(key, tx)),
      ),
    );

    expect(new Set(issued).size).toBe(N);
    const values = issued
      .map((number) => Number(/^PART-(\d{6})$/.exec(number)?.[1]))
      .sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: N }, (_, index) => index + 1));

    const row = await prisma.platformNumberSequence.findUniqueOrThrow({
      where: { key },
    });
    expect(row.nextValue).toBe(N + 1);
  });

  it('hands the number back when the allocating transaction rolls back', async () => {
    const before = await prisma.platformNumberSequence.findUniqueOrThrow({
      where: { key },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await service.next(key, tx);
        throw new Error('create failed after allocation');
      }),
    ).rejects.toThrow('create failed after allocation');

    const after = await prisma.platformNumberSequence.findUniqueOrThrow({
      where: { key },
    });
    expect(after.nextValue).toBe(before.nextValue);
    await expect(
      prisma.$transaction((tx) => service.next(key, tx)),
    ).resolves.toBe(`PART-${String(before.nextValue).padStart(6, '0')}`);
  });

  it('refuses an unknown key with a catalog error', async () => {
    await expect(
      prisma.$transaction((tx) => service.next(`${key}-missing`, tx)),
    ).rejects.toMatchObject({ errorCode: 'NUMBER_SEQUENCE_NOT_CONFIGURED' });
  });
});
