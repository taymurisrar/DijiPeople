import { PrismaClient, LegalDocumentVersionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { seedLegalDocuments } from '../prisma/seed-legal';
import {
  findDraftSelfDeclarations,
  findUnfilledPlaceholders,
} from '../src/modules/legal/legal.service';

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

  beforeAll(async () => {
    await prisma.$connect();
    // Run the seed this suite exists to assert on, rather than hoping an
    // earlier CI step ran it. The database e2e job seeds demo data and the
    // platform admin; it has never run seed:legal, so every assertion below
    // used to read an empty table and report the seed as incomplete when the
    // seed had simply never executed. It upserts and never rewrites a
    // published version, so running it here is idempotent.
    await seedLegalDocuments(prisma);
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

  it('publishes nothing by seeding, whatever is already published', async () => {
    /*
     * This asserted that **nothing** was published — `published === 0` and an
     * empty public index. That was right while publication was a decision
     * nobody had taken. It expired the day `npm run release:api` started
     * publishing the set: on any environment where a release has run, ten
     * documents are legitimately live and this failed for correct behaviour.
     *
     * The rule worth keeping is narrower and is the one the owner actually
     * relies on: **seeding is not publishing.** Unreviewed text must never
     * become live as a side effect of a deploy running the seed — it becomes
     * live only when somebody, or the release command, publishes deliberately.
     *
     * So the assertion is now a *delta* rather than an absolute: run the seed
     * again and the published count must not move.
     */
    const publishedBefore = await prisma.legalDocumentVersion.count({
      where: {
        status: LegalDocumentVersionStatus.PUBLISHED,
        document: { slug: { in: EXPECTED_SLUGS } },
      },
    });

    await seedLegalDocuments(prisma);

    const publishedAfter = await prisma.legalDocumentVersion.count({
      where: {
        status: LegalDocumentVersionStatus.PUBLISHED,
        document: { slug: { in: EXPECTED_SLUGS } },
      },
    });

    expect(publishedAfter).toBe(publishedBefore);

    /*
     * And every version the seed is free to touch — the drafts — is still a
     * draft. A seed that quietly promoted one would satisfy the count above by
     * leaving the total unchanged while changing which version is live.
     */
    const drafts = await prisma.legalDocumentVersion.findMany({
      where: {
        document: { slug: { in: EXPECTED_SLUGS } },
        status: { not: LegalDocumentVersionStatus.PUBLISHED },
      },
      select: { status: true },
    });
    for (const version of drafts) {
      expect([
        LegalDocumentVersionStatus.DRAFT,
        LegalDocumentVersionStatus.ARCHIVED,
      ]).toContain(version.status);
    }
  });

  /*
   * This assertion used to run the other way.
   *
   * It forbade any legal entity, registration number or tax number, on the
   * stated grounds that "DijiPeople is not incorporated" — true when it was
   * written, and a good guard: a page naming a company that does not exist is
   * worse than a page naming none.
   *
   * The company now exists and the owner supplied its details for exactly this
   * purpose, so the premise expired. The guard should not, so it is inverted
   * rather than deleted: the operator must be named, and every
   * registration-shaped number in the corpus must be one the owner actually
   * gave. Fabricated identity is the failure mode, and it outlives any
   * particular premise about whether the company had been incorporated yet.
   */
  const OPERATOR_LEGAL_NAME = 'DijiPeople (SMC-PRIVATE) LIMITED';
  const OPERATOR_REGISTRATION = '38252358';
  const OPERATOR_TAX_NUMBER = '748234783';

  it('names the real operator, and no other entity', async () => {
    const versions = await prisma.legalDocumentVersion.findMany({
      where: { document: { slug: { in: EXPECTED_SLUGS } } },
      select: { contentMarkdown: true, document: { select: { slug: true } } },
    });

    expect(versions.length).toBeGreaterThan(0);

    /*
     * Checking only that the real numbers are present would pass a document
     * that named them and invented a third alongside. So every long digit run
     * in the corpus has to be one of the two.
     */
    const KNOWN_NUMBERS = new Set([OPERATOR_REGISTRATION, OPERATOR_TAX_NUMBER]);

    for (const version of versions) {
      const { contentMarkdown, document } = version;

      for (const digits of contentMarkdown.match(/\b\d{6,}\b/g) ?? []) {
        expect({
          slug: document.slug,
          digits,
          known: KNOWN_NUMBERS.has(digits),
        }).toEqual({ slug: document.slug, digits, known: true });
      }

      /*
       * No second corporate identity. The operator is a Pakistani SMC-Private
       * Limited; an LLC, a Pvt Ltd or a Gulf-style CR number appearing anywhere
       * means text was carried over from somewhere it did not belong.
       */
      for (const pattern of [
        /\bCR-\d{6,}/i,
        /\bcommercial registration\b/i,
        /\bLLC\b|\bLimited Liability\b|\bPvt\.? Ltd\b/,
      ]) {
        expect({
          slug: document.slug,
          matched: pattern.exec(contentMarkdown)?.[0] ?? null,
        }).toEqual({ slug: document.slug, matched: null });
      }
    }
  });

  it('states who the operator is in the documents that create obligations', async () => {
    /*
     * Terms and the billing terms are the two that bind somebody to a
     * counterparty. A contract that never says who the other party is cannot be
     * enforced — and cannot be complained about either.
     */
    for (const slug of ['terms', 'billing-terms']) {
      const version = await prisma.legalDocumentVersion.findFirstOrThrow({
        where: { document: { slug } },
        select: { contentMarkdown: true },
      });

      expect({
        slug,
        names: version.contentMarkdown.includes(OPERATOR_LEGAL_NAME),
      }).toEqual({ slug, names: true });

      expect({
        slug,
        registration: version.contentMarkdown.includes(OPERATOR_REGISTRATION),
      }).toEqual({ slug, registration: true });
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

  it('seeds documents the release is allowed to publish', async () => {
    /*
     * This used to assert the opposite — that every seeded document carried
     * `not been reviewed by a lawyer` — and it was right to, for as long as the
     * copy was written by engineers from the implementation and no lawyer had
     * seen it. Publishing that would have been the worse failure.
     *
     * The business supplied the real clauses on 2026-08-23 and the banner came
     * off all ten documents, so the assertion flips to the thing that now
     * matters: the seed must write content that `legal:publish --confirm`
     * accepts. It is the same guard, asked of the rows the seed actually wrote
     * rather than of the source — Render's pre-deploy command runs this chain,
     * and two production deploys failed at exactly this step.
     *
     * `seed-legal-publishable.spec.ts` asks it of the source in unit tests, so
     * a regression is caught before this suite needs a database.
     */
    const versions = await prisma.legalDocumentVersion.findMany({
      where: { document: { slug: { in: EXPECTED_SLUGS } } },
      select: { contentMarkdown: true, document: { select: { slug: true } } },
    });

    expect(versions.length).toBeGreaterThanOrEqual(EXPECTED_SLUGS.length);

    for (const version of versions) {
      expect({
        slug: version.document.slug,
        declarations: findDraftSelfDeclarations(version.contentMarkdown),
        placeholders: findUnfilledPlaceholders(version.contentMarkdown),
      }).toEqual({
        slug: version.document.slug,
        declarations: [],
        placeholders: [],
      });
    }
  });
});
