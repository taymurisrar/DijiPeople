import {
  PrismaClient,
  LegalDocumentType,
  LegalDocumentVersionStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { LegalService } from '../src/modules/legal/legal.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Legal document versioning, executed against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. Two of the three guarantees here are
 * referential, not procedural:
 *
 *   - an archived version cannot be deleted while an acknowledgement cites it,
 *     which is `onDelete: Restrict` and nothing else;
 *   - a subject and the acknowledgement that justified contacting them commit
 *     together, which is the transaction boundary and nothing else.
 *
 * The service spec covers the branching. This covers what the schema enforces.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Legal documents (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const service = new LegalService(prisma as unknown as PrismaService);

  const runId = `legal-e2e-${Date.now()}`;
  let documentId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const document = await prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.PRIVACY_POLICY,
        slug: `${runId}-privacy`,
        title: 'Privacy Policy (test)',
      },
      select: { id: true },
    });
    documentId = document.id;
  });

  afterAll(async () => {
    // Acknowledgements hold Restrict references, so they go first — which is
    // itself a small demonstration of the constraint under test.
    await prisma.legalDocumentAcknowledgement.deleteMany({
      where: { source: { startsWith: runId } },
    });
    await prisma.legalDocumentVersion.deleteMany({
      where: { legalDocumentId: documentId },
    });
    await prisma.legalDocument.deleteMany({ where: { id: documentId } });
    await prisma.$disconnect();
  });

  it('numbers drafts monotonically and refuses a duplicate version number', async () => {
    const first = await service.createDraft(documentId, '# v1');
    expect(first.version).toBe(1);

    await expect(
      prisma.legalDocumentVersion.create({
        data: {
          legalDocumentId: documentId,
          version: 1,
          contentMarkdown: 'collision',
          effectiveFrom: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('archives the version in force when a successor is published, leaving exactly one current', async () => {
    const v1 = await prisma.legalDocumentVersion.findFirstOrThrow({
      where: { legalDocumentId: documentId, version: 1 },
    });
    await service.publish(v1.id, 'platform_user_test');

    const v2 = await service.createDraft(
      documentId,
      '# v2',
      'clarified retention',
    );
    await service.publish(v2.id, 'platform_user_test');

    const current = await prisma.legalDocumentVersion.findMany({
      where: {
        legalDocumentId: documentId,
        status: LegalDocumentVersionStatus.PUBLISHED,
        effectiveTo: null,
      },
      select: { version: true },
    });

    // Two versions simultaneously in force would make "which text did this
    // person accept" unanswerable for anything acknowledged in the overlap.
    expect(current).toHaveLength(1);
    expect(current[0].version).toBe(2);

    const archived = await prisma.legalDocumentVersion.findFirstOrThrow({
      where: { legalDocumentId: documentId, version: 1 },
      select: { status: true, effectiveTo: true },
    });
    expect(archived.status).toBe(LegalDocumentVersionStatus.ARCHIVED);
    expect(archived.effectiveTo).not.toBeNull();
  });

  it('keeps an acknowledgement pointing at the version that was in force when it was given', async () => {
    const v1 = await prisma.legalDocumentVersion.findFirstOrThrow({
      where: { legalDocumentId: documentId, version: 1 },
      select: { id: true },
    });

    const ack = await service.acknowledge({
      legalDocumentVersionId: v1.id,
      source: `${runId}:contact`,
      subjectEmail: 'Person@Example.com',
    });

    const stored = await prisma.legalDocumentAcknowledgement.findUniqueOrThrow({
      where: { id: ack.id },
      select: { legalDocumentVersionId: true, subjectEmail: true },
    });

    // Still v1, even though v2 is now the published version.
    expect(stored.legalDocumentVersionId).toBe(v1.id);
    expect(stored.subjectEmail).toBe('person@example.com');
  });

  it('refuses to delete a version an acknowledgement still cites', async () => {
    const v1 = await prisma.legalDocumentVersion.findFirstOrThrow({
      where: { legalDocumentId: documentId, version: 1 },
      select: { id: true },
    });

    // Asserted on the message rather than a Prisma error code: the pg driver
    // adapter surfaces this as a DriverAdapterError, so a `code: 'P2003'`
    // assertion would pass only by accident of which layer wrapped it.
    //
    // Three wordings are accepted because three layers can produce the
    // rejection and all three mean the same thing — PostgreSQL refused the
    // delete:
    //
    //   PostgreSQL   "violates foreign key constraint ..."
    //   the adapter  "violates RESTRICT setting of foreign key constraint ..."
    //   Prisma       "Foreign key constraint violated ..."
    //
    // This widens which SENTENCE is accepted, not which OUTCOME. The delete
    // must still be rejected — `rejects` is the assertion; the pattern only
    // proves it was rejected for the referential reason and not, say, because
    // the row was already gone.
    await expect(
      prisma.legalDocumentVersion.delete({ where: { id: v1.id } }),
    ).rejects.toThrow(
      /RESTRICT|violates foreign key|foreign key constraint violated/i,
    );
  });

  it('commits the subject and its acknowledgement together, or not at all', async () => {
    const current = await service.resolvePublished(
      LegalDocumentType.PRIVACY_POLICY,
      null,
    );
    expect(current).not.toBeNull();

    const marker = `${runId}:rollback`;

    await expect(
      prisma.$transaction(async (tx) => {
        await service.acknowledge(
          {
            legalDocumentVersionId: current!.versionId,
            source: marker,
            subjectEmail: 'rollback@example.com',
          },
          tx,
        );
        // Stand-in for the lead insert failing after consent was recorded.
        throw new Error('subject write failed');
      }),
    ).rejects.toThrow('subject write failed');

    const orphans = await prisma.legalDocumentAcknowledgement.count({
      where: { source: marker },
    });
    // An acknowledgement without its subject is as broken as the reverse.
    expect(orphans).toBe(0);
  });

  it('does not resolve a draft', async () => {
    /*
     * This used to read "…and returns null when nothing is published",
     * asserting that `resolvePublished` found nothing at all. That premise
     * expired the day publication was wired into `npm run release:api`: on any
     * environment where a release has run, the seeded set *is* published, and
     * the assertion failed for a reason that was correct behaviour.
     *
     * The guard is still worth having — a draft must never be served — so it is
     * scoped to a document this test owns, in its own market, rather than
     * asserting on the state of the whole table. `resolvePublished` sorts
     * market-specific ahead of global, so an unpublished document here resolves
     * to nothing even while the global set is live.
     */
    const market = await prisma.market.create({
      data: {
        code: `LD${Date.now() % 100000}`,
        name: 'Draft resolution test',
        defaultCurrency: 'PKR',
        supportedCurrencies: ['PKR'],
      },
      select: { id: true },
    });

    const draftOnly = await prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.COOKIE_POLICY,
        marketId: market.id,
        slug: `${runId}-cookies`,
        title: 'Cookie Policy (test)',
      },
      select: { id: true },
    });
    const draft = await service.createDraft(draftOnly.id, '# unpublished');

    const resolved = await service.resolvePublished(
      LegalDocumentType.COOKIE_POLICY,
      market.id,
    );

    /*
     * Not `toBeNull()` — and the difference is the point.
     *
     * `resolvePublished` prefers a market-specific document but falls back to
     * the global one, and the global cookie policy is published on any
     * environment where a release has run. So the honest assertion is not "it
     * finds nothing", it is **"it never serves the draft"**: whatever comes
     * back, it is not this unpublished version and does not carry its text.
     */
    expect(resolved?.versionId).not.toBe(draft.id);
    expect(resolved?.contentMarkdown ?? '').not.toContain('# unpublished');

    await prisma.legalDocumentVersion.deleteMany({
      where: { legalDocumentId: draftOnly.id },
    });
    await prisma.legalDocument.delete({ where: { id: draftOnly.id } });
    await prisma.market.delete({ where: { id: market.id } });
  });
});
