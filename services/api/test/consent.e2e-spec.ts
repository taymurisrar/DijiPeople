import { PrismaClient, ConsentState, ConsentType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { ConsentService } from '../src/modules/legal/consent.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Consent history, against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The whole value of this model is the
 * *sequence*: grant, withdraw, grant again, and being able to answer which was
 * most recent and under which wording. That is ordering across appended rows,
 * which a double cannot demonstrate.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Consent (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const consent = new ConsentService(prisma as unknown as PrismaService);

  const runId = `consent-${Date.now()}`;
  const email = `subject-${runId}@example.invalid`;
  const visitorId = `visitor-${runId}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.consentRecord.deleteMany({
      where: { OR: [{ subjectEmail: email }, { visitorId }] },
    });
    await prisma.$disconnect();
  });

  it('appends rather than overwrites, so the sequence survives', async () => {
    await consent.record({
      type: ConsentType.MARKETING_EMAIL,
      state: ConsentState.GRANTED,
      subjectEmail: email,
      definitionVersion: 'v1',
      source: 'landing:contact',
    });

    await consent.withdraw({
      type: ConsentType.MARKETING_EMAIL,
      subjectEmail: email,
      source: 'web:preferences',
    });

    const rows = await prisma.consentRecord.findMany({
      where: { subjectEmail: email, type: ConsentType.MARKETING_EMAIL },
      orderBy: { createdAt: 'asc' },
      select: { state: true, source: true, grantedAt: true, withdrawnAt: true },
    });

    // Two rows, not one edited row. "Did they opt in, then out" is a question a
    // boolean cannot answer and a regulator will ask.
    expect(rows).toHaveLength(2);
    expect(rows[0].state).toBe(ConsentState.GRANTED);
    expect(rows[0].grantedAt).not.toBeNull();
    expect(rows[1].state).toBe(ConsentState.WITHDRAWN);
    expect(rows[1].withdrawnAt).not.toBeNull();
    expect(rows[1].source).toBe('web:preferences');
  });

  it('reports the latest decision as the current state', async () => {
    const current = await consent.currentState(ConsentType.MARKETING_EMAIL, {
      subjectEmail: email,
    });
    expect(current?.state).toBe(ConsentState.WITHDRAWN);
  });

  it('carries the withdrawn version forward rather than inventing one', async () => {
    const withdrawal = await prisma.consentRecord.findFirstOrThrow({
      where: { subjectEmail: email, state: ConsentState.WITHDRAWN },
      orderBy: { createdAt: 'desc' },
      select: { definitionVersion: true },
    });

    // The withdrawal is of the thing that was granted, so it inherits that
    // wording. Stamping today's version would misstate what was withdrawn.
    expect(withdrawal.definitionVersion).toBe('v1');
  });

  it('treats a second withdrawal as a no-op success', async () => {
    const again = await consent.withdraw({
      type: ConsentType.MARKETING_EMAIL,
      subjectEmail: email,
      source: 'email:unsubscribe',
    });

    // Somebody unsubscribing twice must not see an error.
    expect(again.withdrawn).toBe(false);

    const count = await prisma.consentRecord.count({
      where: { subjectEmail: email, state: ConsentState.WITHDRAWN },
    });
    expect(count).toBe(1);
  });

  it('lets a withdrawn subject grant again, and reports the newest state', async () => {
    await consent.record({
      type: ConsentType.MARKETING_EMAIL,
      state: ConsentState.GRANTED,
      subjectEmail: email,
      definitionVersion: 'v2',
      source: 'web:preferences',
    });

    const current = await consent.currentState(ConsentType.MARKETING_EMAIL, {
      subjectEmail: email,
    });
    expect(current?.state).toBe(ConsentState.GRANTED);
    expect(current?.definitionVersion).toBe('v2');
  });

  it('records a full set of cookie choices atomically', async () => {
    const result = await consent.recordCookieChoices({
      visitorId,
      definitionVersion: 'cookies-v1',
      source: 'landing:cookie-banner',
      choices: {
        [ConsentType.COOKIE_FUNCTIONAL]: true,
        [ConsentType.COOKIE_ANALYTICS]: true,
        [ConsentType.COOKIE_MARKETING]: false,
      },
    });

    expect(result.recorded).toBe(3);

    const preferences = await consent.cookiePreferences(visitorId);
    expect(preferences[ConsentType.COOKIE_FUNCTIONAL]).toBe(
      ConsentState.GRANTED,
    );
    expect(preferences[ConsentType.COOKIE_ANALYTICS]).toBe(
      ConsentState.GRANTED,
    );
    // Declined, which is deliberately different from never asked.
    expect(preferences[ConsentType.COOKIE_MARKETING]).toBe(
      ConsentState.DECLINED,
    );
  });

  it('never stores an ESSENTIAL cookie choice, because it is not a choice', async () => {
    const stored = await prisma.consentRecord.findMany({
      where: { visitorId },
      select: { type: true },
    });

    const types = stored.map((row) => row.type);
    // Offering a toggle for cookies the site cannot work without, and then
    // ignoring it, is a dark pattern. The enum has no such member.
    expect(types).not.toContain('COOKIE_ESSENTIAL' as ConsentType);
    expect(new Set(types).size).toBe(3);
  });

  it('distinguishes "not asked" from "declined"', async () => {
    const freshVisitor = `${visitorId}-fresh`;
    const preferences = await consent.cookiePreferences(freshVisitor);

    // Absent, not defaulted to DECLINED — the banner needs to know whether to
    // appear at all.
    expect(preferences[ConsentType.COOKIE_ANALYTICS]).toBeUndefined();
    expect(Object.keys(preferences)).toHaveLength(0);
  });
});
