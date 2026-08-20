/**
 * Publish the seeded legal drafts, deliberately.
 *
 * `LegalService.publish()` has existed since the legal module was written and
 * **nothing has ever called it**. There is no admin controller for legal — only
 * `public-legal.controller.ts`, which serves published versions and 404s
 * otherwise. So the ten documents could be drafted, reviewed and corrected, and
 * never reach a customer, because the last step had no door.
 *
 * That is the `declared-but-unwired-step` pattern, and its consequence here was
 * quiet rather than loud: the subscribe wizard requires only agreements
 * carrying a published version, so with none published it required none, and
 * every purchase recorded **no consent at all**. A checkout that silently
 * captures nothing is worse than one that refuses, because it looks like it
 * worked.
 *
 * This script is the door. It is a script rather than an endpoint because
 * publishing is a rare, deliberate, environment-specific act by whoever holds
 * the database credentials — and because an operator UI for it is real work
 * (controller, permissions, review screen, diff against the live version) that
 * should not be improvised to unblock one publication. That UI is [[ITEM-0068]].
 *
 *   npm --workspace api run legal:publish -- --dry-run
 *   npm --workspace api run legal:publish -- --confirm
 *
 * `--dry-run` is the default. Nothing publishes without `--confirm`, because
 * publishing is not reversible in the way that matters: a published version is
 * immutable, acknowledgements point at it, and withdrawing it means publishing
 * a replacement rather than deleting a row.
 */
import { PrismaClient, LegalDocumentVersionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LegalService, findUnfilledPlaceholders } from '../src/modules/legal/legal.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * The documents a customer is asked to accept at checkout, plus the ones the
 * public site links to. Deliberately an explicit list rather than "everything
 * that is a draft": a future draft added for review must not be published by
 * somebody re-running this to publish a correction.
 */
const PUBLISHABLE_SLUGS = [
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

type Outcome =
  | { slug: string; action: 'PUBLISHED'; version: number }
  | { slug: string; action: 'ALREADY_PUBLISHED'; version: number }
  | { slug: string; action: 'SKIPPED'; reason: string };

async function main() {
  const argv = process.argv.slice(2);
  const confirmed = argv.includes('--confirm');

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Refusing to continue.');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const legal = new LegalService(prisma as unknown as PrismaService);

  try {
    /*
     * Publication is attributed to a real platform user, not to "system".
     * `LegalDocumentVersion.publishedByPlatformUser` is the audit answer to
     * "who decided this text becomes binding", and a constant would make every
     * publication in the platform's history indistinguishable.
     */
    const operator = await prisma.platformUser.findFirst({
      where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    if (!operator) {
      console.error(
        'No ACTIVE SUPER_ADMIN platform user exists. Run `npm --workspace api run seed:admin` first —\n' +
          'publication has to be attributable to somebody.',
      );
      process.exit(1);
    }

    const documents = await prisma.legalDocument.findMany({
      where: { slug: { in: PUBLISHABLE_SLUGS } },
      select: {
        slug: true,
        title: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            contentMarkdown: true,
          },
        },
      },
    });

    const missing = PUBLISHABLE_SLUGS.filter(
      (slug) => !documents.some((d) => d.slug === slug),
    );

    const outcomes: Outcome[] = missing.map((slug) => ({
      slug,
      action: 'SKIPPED',
      reason: 'no document with this slug — run seed:legal first',
    }));

    for (const document of documents) {
      const live = document.versions.find(
        (v) => v.status === LegalDocumentVersionStatus.PUBLISHED,
      );
      if (live) {
        outcomes.push({
          slug: document.slug,
          action: 'ALREADY_PUBLISHED',
          version: live.version,
        });
        continue;
      }

      // Highest-numbered draft. `versions` is already sorted descending, so the
      // first draft found is the newest — the one an operator has been editing.
      const draft = document.versions.find(
        (v) => v.status === LegalDocumentVersionStatus.DRAFT,
      );
      if (!draft) {
        outcomes.push({
          slug: document.slug,
          action: 'SKIPPED',
          reason: 'no draft version to publish',
        });
        continue;
      }

      /*
       * Checked here as well as inside `publish()`. Not redundant: a dry run
       * must be able to report what *would* fail without opening a transaction,
       * and an operator who learns about an unfilled placeholder only when the
       * ninth of ten documents throws has been told too late.
       */
      const unfilled = findUnfilledPlaceholders(draft.contentMarkdown);
      if (unfilled.length) {
        outcomes.push({
          slug: document.slug,
          action: 'SKIPPED',
          reason: `unfilled placeholders: ${unfilled.join(', ')}`,
        });
        continue;
      }

      if (!confirmed) {
        outcomes.push({
          slug: document.slug,
          action: 'PUBLISHED',
          version: draft.version,
        });
        continue;
      }

      await legal.publish(draft.id, operator.id);
      outcomes.push({
        slug: document.slug,
        action: 'PUBLISHED',
        version: draft.version,
      });
    }

    outcomes.sort((a, b) => a.slug.localeCompare(b.slug));

    const published = outcomes.filter((o) => o.action === 'PUBLISHED').length;
    const skipped = outcomes.filter((o) => o.action === 'SKIPPED');

    console.log(
      JSON.stringify(
        {
          mode: confirmed ? 'CONFIRMED' : 'DRY_RUN',
          attributedTo: operator.email,
          published,
          alreadyPublished: outcomes.filter(
            (o) => o.action === 'ALREADY_PUBLISHED',
          ).length,
          skipped: skipped.length,
          outcomes,
          note: confirmed
            ? 'Published versions are immutable. A correction is a new draft, published as a new version.'
            : 'Nothing was written. Re-run with --confirm to publish.',
        },
        null,
        2,
      ),
    );

    /*
     * A skip is not a failure — an already-published document is the expected
     * state on a re-run. But a skip for any *other* reason means an operator
     * asked for ten documents and got fewer, and a zero exit code would let
     * that pass unnoticed in a deploy log.
     */
    if (skipped.length) process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
