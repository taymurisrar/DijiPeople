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
 * The seeded legal set, against a real PostgreSQL.
 *
 * The point of this suite is the promise made to the owner: drafting the text
 * does **not** put it in front of anybody. Every document is seeded as a DRAFT
 * and must stay unresolvable until somebody publishes it deliberately.
 *
 * It also guards the two content rules that cannot be enforced by a type: no
 * fabricated legal entity, and no invented certification.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const EXPECTED_SLUGS = [
  'privacy',
  'terms',
  'billing-terms',
  'refund-policy',
  'cookie-policy',
  'acceptable-use',
  'security',
  'data-retention',
  'dpa',
  'subprocessors',
];

describeWithDatabase()('Seeded legal documents (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const legal = new LegalService(prisma as unknown as PrismaService);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds every route the brief names', async () => {
    const documents = await prisma.legalDocument.findMany({
      where: { slug: { in: EXPECTED_SLUGS } },
      select: { slug: true },
    });

    expect(documents.map((d) => d.slug).sort()).toEqual(
      [...EXPECTED_SLUGS].sort(),
    );
  });

  it('seeds them all as DRAFT, so nothing is publicly resolvable', async () => {
    const published = await prisma.legalDocumentVersion.count({
      where: {
        status: LegalDocumentVersionStatus.PUBLISHED,
        document: { slug: { in: EXPECTED_SLUGS } },
      },
    });

    // The owner chose draft-then-publish precisely so unreviewed legal text
    // cannot be served. If this ever fails, something published without asking.
    expect(published).toBe(0);

    for (const type of [
      LegalDocumentType.PRIVACY_POLICY,
      LegalDocumentType.TERMS_OF_SERVICE,
      LegalDocumentType.SECURITY_NOTICE,
      LegalDocumentType.DATA_PROCESSING_ADDENDUM,
    ]) {
      await expect(legal.resolvePublished(type, null)).resolves.toBeNull();
    }

    const index = await legal.listPublished(null);
    // The footer renders from this, so an empty list is what makes the site
    // show no legal links rather than links to pages that apologise.
    expect(index).toEqual([]);
  });

  it('names no legal entity, registration number or tax number', async () => {
    const versions = await prisma.legalDocumentVersion.findMany({
      where: { document: { slug: { in: EXPECTED_SLUGS } } },
      select: { contentMarkdown: true, document: { select: { slug: true } } },
    });

    expect(versions.length).toBeGreaterThan(0);

    // DijiPeople is not incorporated. A page naming an entity that does not
    // exist is worse than a page naming none, so this is asserted rather than
    // trusted to review.
    const forbidden = [
      /\bCR-\d{6,}/i,
      /\bcommercial registration\b/i,
      /\bregistration number[:\s]+\S+/i,
      /\btax (id|number)[:\s]+\d/i,
      /\bregistered office[:\s]+\S+/i,
      /\bLLC\b|\bLimited Liability\b|\bPvt\.? Ltd\b/,
    ];

    for (const version of versions) {
      for (const pattern of forbidden) {
        expect({
          slug: version.document.slug,
          matched: pattern.exec(version.contentMarkdown)?.[0] ?? null,
        }).toEqual({ slug: version.document.slug, matched: null });
      }
    }
  });

  it('claims no certification the platform does not hold', async () => {
    const security = await prisma.legalDocumentVersion.findFirstOrThrow({
      where: { document: { slug: 'security' } },
      select: { contentMarkdown: true },
    });

    // The disclaimer section names these terms in order to deny them, so
    // searching the whole document would match its own honesty. Only the part
    // that makes positive statements is examined.
    const disclaimerIndex = security.contentMarkdown.indexOf(
      '## What is NOT claimed',
    );
    expect(disclaimerIndex).toBeGreaterThan(-1);
    const positiveClaims = security.contentMarkdown.slice(0, disclaimerIndex);

    for (const term of [
      /SOC ?2/i,
      /ISO ?27001/i,
      /HIPAA/i,
      /PCI/i,
      /GDPR/i,
      /uptime/i,
      /24\/7/i,
      /\bSLA\b/i,
    ]) {
      expect({
        term: term.source,
        matched: term.exec(positiveClaims)?.[0] ?? null,
      }).toEqual({ term: term.source, matched: null });
    }
  });

  it('records subprocessors with an unknown region rather than a guessed one', async () => {
    const providers = await prisma.subprocessor.findMany({
      select: { name: true, processingRegion: true, purpose: true },
    });

    expect(providers.length).toBeGreaterThanOrEqual(4);

    for (const provider of providers) {
      // Null means unknown, which is a different and more honest statement than
      // naming a plausible region on a page that gets published.
      expect(provider.processingRegion).toBeNull();
      expect(provider.purpose.length).toBeGreaterThan(10);
    }
  });

  it('carries a visible draft banner on every document', async () => {
    const versions = await prisma.legalDocumentVersion.findMany({
      where: { document: { slug: { in: EXPECTED_SLUGS } } },
      select: { contentMarkdown: true },
    });

    for (const version of versions) {
      expect(version.contentMarkdown).toContain('not been reviewed by a');
    }
  });
});
