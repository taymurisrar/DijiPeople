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
 * The publish path, against real PostgreSQL.
 *
 * `LegalService.publish()` existed from the day the legal module was written
 * and **nothing called it**. There is no admin controller for legal — only
 * `public-legal.controller.ts`, which serves published versions and 404s
 * otherwise — so the ten seeded documents could be drafted, corrected and
 * reviewed and never reach a customer, because the last step had no door.
 *
 * The consequence was quiet, which is why it survived: the subscribe wizard
 * requires only agreements carrying a *published* version, so with none
 * published it required none, and every purchase recorded no consent at all. A
 * checkout that silently captures nothing looks exactly like one that works.
 *
 * These tests are the door's contract, and they exist as much to stop the path
 * rotting again as to prove it works — an unreachable method passes every unit
 * test ever written about it.
 *
 * **Everything here is built by the suite and torn down after it.** The first
 * draft of this file published the *seeded* documents, which passed once and
 * then failed on every re-run, because its own first run consumed the drafts it
 * depended on. That is `borrowed-fixture-dependency`, written by somebody who
 * had read the pattern the week before. Owning the fixture also buys isolation:
 * a throwaway market means these documents can carry real types without
 * colliding with the seeded globals, since `LegalDocument` is unique on
 * `(type, marketId)` and `resolvePublished` sorts market-specific first.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const NOW = Date.now();

describeWithDatabase()('Legal publication (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const legal = new LegalService(prisma as unknown as PrismaService);

  let marketId: string;
  let operatorId: string;
  const documentIds: string[] = [];

  /** A draft of `type`, owned by this suite, in its own market. */
  async function makeDocument(
    type: LegalDocumentType,
    contentMarkdown: string,
  ) {
    const document = await prisma.legalDocument.create({
      data: {
        type,
        marketId,
        slug: `publish-contract-${type.toLowerCase()}-${NOW}`,
        title: `${type} (publish contract)`,
        isActive: true,
        versions: {
          create: {
            version: 1,
            status: LegalDocumentVersionStatus.DRAFT,
            contentMarkdown,
            changeSummary: 'suite fixture',
            // Required on the model. `publish()` overwrites it with the moment
            // the version actually takes effect.
            effectiveFrom: new Date(),
          },
        },
      },
      select: { id: true, slug: true, versions: { select: { id: true } } },
    });
    documentIds.push(document.id);
    return { ...document, draftId: document.versions[0].id };
  }

  beforeAll(async () => {
    await prisma.$connect();

    const market = await prisma.market.create({
      data: {
        code: `LP${NOW % 100000}`,
        name: 'Legal publish contract',
        defaultCurrency: 'PKR',
        supportedCurrencies: ['PKR'],
      },
      select: { id: true },
    });
    marketId = market.id;

    /*
     * Publication is attributed to a real platform user rather than a constant,
     * because `publishedByPlatformUser` is the audit answer to "who decided
     * this text becomes binding". Every publication in the platform's history
     * would otherwise look identical.
     */
    const operator = await prisma.platformUser.create({
      data: {
        email: `legal-publish-${NOW}@dijipeople.test`,
        firstName: 'Publish',
        lastName: 'Contract',
        passwordHash: 'not-a-real-hash-this-user-never-signs-in',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    operatorId = operator.id;
  });

  afterAll(async () => {
    // Order matters: versions reference the document, and the version rows
    // reference the operator.
    if (documentIds.length) {
      await prisma.legalDocumentVersion.deleteMany({
        where: { legalDocumentId: { in: documentIds } },
      });
      await prisma.legalDocument.deleteMany({
        where: { id: { in: documentIds } },
      });
    }
    if (operatorId) {
      await prisma.platformUser.deleteMany({ where: { id: operatorId } });
    }
    if (marketId) {
      await prisma.market.deleteMany({ where: { id: marketId } });
    }
    await prisma.$disconnect();
  });

  it('turns a draft into the version the public path serves', async () => {
    const type = LegalDocumentType.TERMS_OF_SERVICE;

    // Before: nothing resolves for this market — the state that made every
    // purchase consent-free.
    const doc = await makeDocument(type, '# Terms\n\nThe agreement.');

    const published = await legal.publish(doc.draftId, operatorId);

    expect(published.status).toBe(LegalDocumentVersionStatus.PUBLISHED);
    expect(published.publishedAt).not.toBeNull();
    expect(published.effectiveFrom).not.toBeNull();
    expect(published.publishedByPlatformUser).toBe(operatorId);

    /*
     * `versionId`, not `id`. `ResolvedLegalVersion` deliberately names both
     * halves — `documentId` and `versionId` — because the two are different
     * answers and an acknowledgement has to point at the version, not the
     * document. The first draft of this test asserted on `.id` and read
     * `undefined`; `test/jest-e2e.json` sets `diagnostics: false`, so tsc never
     * complained.
     */
    const live = await legal.resolvePublished(type, marketId);
    expect(live?.versionId).toBe(doc.draftId);
    expect(live?.documentId).toBe(doc.id);
    expect(live?.slug).toBe(doc.slug);
  });

  it('puts the document into the index the checkout wizard reads', async () => {
    const doc = await makeDocument(
      LegalDocumentType.PRIVACY_POLICY,
      '# Privacy\n\nWhat we collect.',
    );
    await legal.publish(doc.draftId, operatorId);

    const index = await legal.listPublished(marketId);
    const entry = index.find((e) => e.slug === doc.slug);

    /*
     * This is the assertion connecting publication to consent. The landing
     * wizard filters agreements down to entries carrying a `versionId` and asks
     * the buyer to accept exactly those. An entry without one is silently
     * dropped — so a published document reaching the index without a version id
     * would restore the original defect wearing a new face.
     */
    expect({ found: Boolean(entry) }).toEqual({ found: true });
    expect({ hasVersionId: Boolean(entry?.versionId) }).toEqual({
      hasVersionId: true,
    });
  });

  it('refuses to publish the same version twice', async () => {
    const doc = await makeDocument(
      LegalDocumentType.SECURITY_NOTICE,
      '# Security\n\nWhat the platform does.',
    );
    await legal.publish(doc.draftId, operatorId);

    // Not a silent no-op. Re-publishing an in-force version would move
    // `effectiveFrom` and orphan the acknowledgements pointing at the old date.
    await expect(legal.publish(doc.draftId, operatorId)).rejects.toThrow();
  });

  it('archives the version it replaces rather than deleting it', async () => {
    const doc = await makeDocument(
      LegalDocumentType.COOKIE_POLICY,
      '# Cookies\n\nVersion one.',
    );
    await legal.publish(doc.draftId, operatorId);

    const second = await prisma.legalDocumentVersion.create({
      data: {
        legalDocumentId: doc.id,
        version: 2,
        status: LegalDocumentVersionStatus.DRAFT,
        contentMarkdown: '# Cookies\n\nA corrected version.',
        changeSummary: 'correction',
        effectiveFrom: new Date(),
      },
      select: { id: true },
    });

    await legal.publish(second.id, operatorId);

    const rows = await prisma.legalDocumentVersion.findMany({
      where: { legalDocumentId: doc.id },
      select: { id: true, status: true, effectiveTo: true },
    });

    const replaced = rows.find((r) => r.id === doc.draftId);
    const current = rows.find((r) => r.id === second.id);

    /*
     * The old row survives, because acknowledgements point at it. Somebody who
     * accepted version 1 must still be shown what they accepted — deleting it
     * would make every past consent unprovable.
     */
    expect(replaced?.status).toBe(LegalDocumentVersionStatus.ARCHIVED);
    expect(replaced?.effectiveTo).not.toBeNull();
    expect(current?.status).toBe(LegalDocumentVersionStatus.PUBLISHED);
    expect(current?.effectiveTo).toBeNull();
  });

  it('refuses a draft that still carries a placeholder', async () => {
    const doc = await makeDocument(
      LegalDocumentType.REFUND_CANCELLATION_POLICY,
      '# Refunds\n\nProvided by {{LEGAL_ENTITY_NAME}} of {{JURISDICTION}}.',
    );

    /*
     * A live Terms of Service reading `{{LEGAL_ENTITY_NAME}}` is worse than one
     * naming nobody. This guard is what makes the placeholder convention safe,
     * so it is tested from the outside rather than trusted.
     */
    await expect(legal.publish(doc.draftId, operatorId)).rejects.toThrow(
      /placeholder/i,
    );

    const after = await prisma.legalDocumentVersion.findUniqueOrThrow({
      where: { id: doc.draftId },
      select: { status: true },
    });
    expect(after.status).toBe(LegalDocumentVersionStatus.DRAFT);
  });

  it('leaves nothing resolvable for a market it never published into', async () => {
    // The other half of the isolation claim above: publishing into this suite's
    // market must not make anything resolvable for a market that has none.
    const orphanMarket = await prisma.market.create({
      data: {
        code: `LQ${NOW % 100000}`,
        name: 'Never published into',
        defaultCurrency: 'PKR',
        supportedCurrencies: ['PKR'],
      },
      select: { id: true },
    });

    try {
      const index = await legal.listPublished(orphanMarket.id);
      const leaked = index.filter((e) =>
        e.slug.startsWith('publish-contract-'),
      );
      expect(leaked).toEqual([]);
    } finally {
      await prisma.market.deleteMany({ where: { id: orphanMarket.id } });
    }
  });
});
