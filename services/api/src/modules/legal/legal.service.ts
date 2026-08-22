import { Injectable, Logger } from '@nestjs/common';
import {
  LegalDocumentType,
  LegalDocumentVersionStatus,
  Prisma,
} from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

export type ResolvedLegalVersion = {
  documentId: string;
  slug: string;
  type: LegalDocumentType;
  title: string;
  versionId: string;
  version: number;
  contentMarkdown: string;
  effectiveFrom: Date;
  publishedAt: Date | null;
  marketId: string | null;
};

export type AcknowledgeLegalVersionInput = {
  legalDocumentVersionId: string;
  source: string;
  leadId?: string | null;
  customerAccountId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  subjectEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The version of a document that is in force right now for a market.
   *
   * A market-specific document wins over the global one, which is the whole
   * reason `marketId` is nullable rather than required — a jurisdiction can get
   * its own wording without every other market needing a duplicate row.
   *
   * Returns null rather than throwing when nothing is published. An unpublished
   * legal document is a normal state for a platform that has not launched a
   * market yet, and the caller's correct response is to show no link at all —
   * not to render a page that claims terms exist.
   */
  async resolvePublished(
    type: LegalDocumentType,
    marketId?: string | null,
  ): Promise<ResolvedLegalVersion | null> {
    const now = new Date();

    // Ordered so a market-specific document sorts before the global one, and
    // the newest effective version sorts first within either.
    const candidates = await this.prisma.legalDocument.findMany({
      where: {
        type,
        isActive: true,
        OR: [{ marketId: marketId ?? null }, { marketId: null }],
      },
      select: {
        id: true,
        slug: true,
        type: true,
        title: true,
        marketId: true,
        versions: {
          where: {
            status: LegalDocumentVersionStatus.PUBLISHED,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
          take: 1,
          select: {
            id: true,
            version: true,
            contentMarkdown: true,
            effectiveFrom: true,
            publishedAt: true,
          },
        },
      },
    });

    const withVersion = candidates.filter((doc) => doc.versions.length > 0);
    if (withVersion.length === 0) {
      return null;
    }

    const preferred =
      withVersion.find((doc) => doc.marketId && doc.marketId === marketId) ??
      withVersion.find((doc) => doc.marketId === null);

    if (!preferred) {
      return null;
    }

    const version = preferred.versions[0];
    return {
      documentId: preferred.id,
      slug: preferred.slug,
      type: preferred.type,
      title: preferred.title,
      versionId: version.id,
      version: version.version,
      contentMarkdown: version.contentMarkdown,
      effectiveFrom: version.effectiveFrom,
      publishedAt: version.publishedAt,
      marketId: preferred.marketId,
    };
  }

  /** Same resolution, addressed by public slug rather than type. */
  async resolvePublishedBySlug(
    slug: string,
  ): Promise<ResolvedLegalVersion | null> {
    const document = await this.prisma.legalDocument.findFirst({
      where: { slug, isActive: true },
      select: { type: true, marketId: true },
    });

    if (!document) {
      return null;
    }

    return this.resolvePublished(document.type, document.marketId);
  }

  /** Every document that currently has something published, for footer links. */
  async listPublished(marketId?: string | null) {
    const types = Object.values(LegalDocumentType);
    const resolved = await Promise.all(
      types.map((type) => this.resolvePublished(type, marketId)),
    );

    return resolved
      .filter((entry): entry is ResolvedLegalVersion => entry !== null)
      .map(({ contentMarkdown: _contentMarkdown, ...summary }) => summary);
  }

  /**
   * Edit a draft.
   *
   * Refuses anything that is not a draft. This is the single most important
   * rule in this module: a published version is the evidence behind every
   * acknowledgement that names it, so editing one retroactively changes what
   * people are recorded as having agreed to. A correction is a new version.
   */
  async updateDraft(
    versionId: string,
    data: {
      contentMarkdown?: string;
      changeSummary?: string;
      effectiveFrom?: Date;
    },
  ) {
    const existing = await this.prisma.legalDocumentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, status: true, version: true },
    });

    if (!existing) {
      throw new AppError('LEGAL_VERSION_NOT_FOUND', {
        message: 'That legal document version does not exist.',
      });
    }

    if (existing.status !== LegalDocumentVersionStatus.DRAFT) {
      throw new AppError('LEGAL_VERSION_IMMUTABLE', {
        message: `Version ${existing.version} is ${existing.status} and cannot be edited. Publish a new version instead.`,
      });
    }

    return this.prisma.legalDocumentVersion.update({
      where: { id: versionId },
      data,
    });
  }

  /**
   * Publish a draft, closing the version it supersedes.
   *
   * Both writes happen in one transaction. Two versions of the same document
   * being simultaneously in force is not a display bug — it makes "which text
   * did this person accept" unanswerable for every acknowledgement recorded in
   * the overlap.
   */
  async publish(
    versionId: string,
    publishedByPlatformUser: string,
    effectiveFrom?: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.legalDocumentVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          status: true,
          version: true,
          legalDocumentId: true,
          contentMarkdown: true,
        },
      });

      if (!version) {
        throw new AppError('LEGAL_VERSION_NOT_FOUND', {
          message: 'That legal document version does not exist.',
        });
      }

      if (version.status !== LegalDocumentVersionStatus.DRAFT) {
        throw new AppError('LEGAL_VERSION_NOT_DRAFT', {
          message: `Version ${version.version} is already ${version.status}.`,
        });
      }

      /*
       * A draft still carrying `{{PLACEHOLDER}}` markers cannot be published.
       *
       * The seeded documents mark the contracting party — legal entity name,
       * registration number, registered office, tax number, jurisdiction — as
       * blanks, because DijiPeople is not incorporated yet and naming an entity
       * that does not exist would be false. Marking the gap is more useful than
       * omitting it, but only if the marker cannot escape: a live Terms of
       * Service reading `{{LEGAL_ENTITY_NAME}}` is worse than either.
       *
       * So the guard is what makes the placeholders safe, and the two were
       * added together. Publishing is refused with the list of what is still
       * unfilled, because "it has placeholders" is not actionable and
       * "{{JURISDICTION}} is unfilled" is.
       */
      const unfilled = findUnfilledPlaceholders(version.contentMarkdown);
      if (unfilled.length) {
        throw new AppError('LEGAL_VERSION_HAS_PLACEHOLDERS', {
          message: `Version ${version.version} still has unfilled placeholders: ${unfilled.join(', ')}.`,
        });
      }

      const now = new Date();
      const startsAt = effectiveFrom ?? now;

      // Close whatever is currently in force for this document. Archiving is
      // deliberate: the row stays, because acknowledgements point at it.
      await tx.legalDocumentVersion.updateMany({
        where: {
          legalDocumentId: version.legalDocumentId,
          status: LegalDocumentVersionStatus.PUBLISHED,
          effectiveTo: null,
        },
        data: {
          status: LegalDocumentVersionStatus.ARCHIVED,
          effectiveTo: startsAt,
        },
      });

      return tx.legalDocumentVersion.update({
        where: { id: versionId },
        data: {
          status: LegalDocumentVersionStatus.PUBLISHED,
          publishedAt: now,
          publishedByPlatformUser,
          effectiveFrom: startsAt,
          effectiveTo: null,
        },
      });
    });
  }

  /**
   * Create the next draft for a document.
   *
   * The version number is derived inside the transaction from the highest
   * existing one, so two operators drafting at once cannot both claim the same
   * number — the unique constraint on (document, version) is what actually
   * refuses the second one.
   */
  async createDraft(
    legalDocumentId: string,
    contentMarkdown: string,
    changeSummary?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.legalDocumentVersion.findFirst({
        where: { legalDocumentId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      return tx.legalDocumentVersion.create({
        data: {
          legalDocumentId,
          version: (latest?.version ?? 0) + 1,
          status: LegalDocumentVersionStatus.DRAFT,
          contentMarkdown,
          changeSummary: changeSummary ?? null,
          effectiveFrom: new Date(),
        },
      });
    });
  }

  /**
   * Record that a party accepted an exact version.
   *
   * Takes an optional transaction client so a public form can persist its lead
   * and the acknowledgement of the notice it displayed in one commit. A lead
   * that exists without the acknowledgement that justified contacting them is
   * exactly the split state that makes consent unprovable.
   */
  async acknowledge(
    input: AcknowledgeLegalVersionInput,
    client?: Prisma.TransactionClient,
  ) {
    const db = client ?? this.prisma;

    return db.legalDocumentAcknowledgement.create({
      data: {
        legalDocumentVersionId: input.legalDocumentVersionId,
        source: input.source.slice(0, 120),
        leadId: input.leadId ?? null,
        customerAccountId: input.customerAccountId ?? null,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        subjectEmail: input.subjectEmail?.toLowerCase().slice(0, 320) ?? null,
        ipAddress: input.ipAddress?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  }

  /**
   * Record several acceptances arising from one act of agreeing.
   *
   * **Ids that are not published versions are dropped.** The list arrives from
   * a browser, and an acknowledgement pointing at a draft — or at a version the
   * buyer was never shown — is worse than no record, because it looks like
   * evidence and is not. Dropped rather than thrown, because the realistic cause
   * is a stale tab across a republish, and refusing somebody's purchase over
   * that is a poor trade.
   *
   * Idempotent per subject and version. The verification gate makes
   * resubmission the normal path now, and recording the same agreement twice
   * would read as repeated consent that never happened.
   */
  async acknowledgeMany(input: {
    legalDocumentVersionIds: string[];
    source: string;
    leadId?: string | null;
    customerAccountId?: string | null;
    tenantId?: string | null;
    userId?: string | null;
    subjectEmail?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const requested = [...new Set(input.legalDocumentVersionIds)];
    if (!requested.length) return { recorded: 0, skipped: 0 };

    const published = await this.prisma.legalDocumentVersion.findMany({
      where: { id: { in: requested }, publishedAt: { not: null } },
      select: { id: true },
    });
    const publishable = published.map((row) => row.id);

    const already = await this.prisma.legalDocumentAcknowledgement.findMany({
      where: {
        legalDocumentVersionId: { in: publishable },
        ...(input.customerAccountId
          ? { customerAccountId: input.customerAccountId }
          : { subjectEmail: input.subjectEmail?.toLowerCase() ?? null }),
      },
      select: { legalDocumentVersionId: true },
    });
    const seen = new Set(already.map((row) => row.legalDocumentVersionId));
    const toRecord = publishable.filter((id) => !seen.has(id));

    for (const legalDocumentVersionId of toRecord) {
      await this.acknowledge({ ...input, legalDocumentVersionId });
    }

    if (requested.length !== publishable.length) {
      this.logger.warn(
        `Ignored ${requested.length - publishable.length} acknowledgement id(s) naming no published version.`,
      );
    }

    return {
      recorded: toRecord.length,
      skipped: requested.length - toRecord.length,
    };
  }
}

/**
 * The `{{PLACEHOLDER}}` markers a draft still carries, de-duplicated and in the
 * order a reader would meet them.
 *
 * Deliberately narrow: uppercase, digits and underscores only. A loose pattern
 * would catch Handlebars, Liquid or any other braces a lawyer's export format
 * happens to use, and refusing to publish a finished document because its
 * converter emitted `{{ }}` would be a worse failure than the one this prevents.
 */
export function findUnfilledPlaceholders(content: string): string[] {
  const found = content.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
  return [...new Set(found)];
}

/**
 * Phrases by which a draft declares itself a draft.
 *
 * On 2026-08-22 all ten legal documents were published to production, and every
 * one carried a banner in its own body beginning *"Draft — not published, and
 * not legal advice"*, going on to say it had not been reviewed by a lawyer and
 * that the liability and indemnity clauses were absent. The privacy policy of a
 * live product told its readers not to rely on it.
 *
 * Nothing refused. `findUnfilledPlaceholders` above was the only content gate,
 * and it asks whether the template was *filled in* — a different question from
 * whether the result is *fit to publish*. The document was complete prose with
 * no `{{PLACEHOLDER}}` left in it. It simply said it was a draft.
 *
 * ## Why phrases rather than a marker
 *
 * A convention like `<!-- DRAFT -->` would be cleaner and would not have worked:
 * the banner is prose a human wrote for other humans to read, and the next one
 * will be written the same way. Matching what a draft actually says is less
 * elegant and catches the real case.
 *
 * Each pattern is a statement a finished document would never make about itself.
 * The bare word "draft" is deliberately not one — a published terms of service
 * may legitimately discuss draft contracts, and refusing to publish over that
 * would be the false positive that gets this check deleted.
 */
const DRAFT_SELF_DECLARATIONS: Array<{ pattern: RegExp; says: string }> = [
  {
    pattern: /draft\s*[—–-]\s*not published/i,
    says: 'declares itself an unpublished draft',
  },
  {
    pattern: /(has )?not been reviewed by a lawyer/i,
    says: 'states it has not been reviewed by a lawyer',
  },
  {
    pattern: /this is (still )?a draft/i,
    says: 'calls itself a draft',
  },
  {
    pattern: /\bTODO\b|\bTBD\b|\bFIXME\b/,
    says: 'carries an unfinished-work marker',
  },
];

/**
 * The ways a document says it is not ready to be published, in the order a
 * reader would meet them. Empty means nothing in the text disqualifies it.
 *
 * This does not judge whether a document is *good* — no check can. It catches
 * the one case needing no judgement: a document that has already told you.
 */
export function findDraftSelfDeclarations(content: string): string[] {
  /*
   * Flattened before matching, and this is not a detail.
   *
   * The banner is markdown, hard-wrapped at about 78 columns inside a
   * blockquote, so the real production text reads:
   *
   *     > engineering team from the implementation. It has not been reviewed by a
   *     > lawyer. It is stored as a DRAFT version …
   *
   * "not been reviewed by a lawyer" is split across a line break with a `> `
   * in the middle of it. Matching the raw string finds nothing, which is
   * exactly the shape of failure this whole function exists to prevent — a
   * check that runs, reports clean, and is looking at the wrong thing.
   *
   * The first version of this did match the raw string, and its own spec caught
   * it on the first run.
   */
  const flattened = content
    .replace(/^\s*>\s?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const found: string[] = [];
  for (const { pattern, says } of DRAFT_SELF_DECLARATIONS) {
    if (pattern.test(flattened) && !found.includes(says)) found.push(says);
  }
  return found;
}
