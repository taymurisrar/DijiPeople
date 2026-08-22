/**
 * Withdraw published legal versions back to DRAFT.
 *
 * WHY THIS EXISTS.
 *
 * On 2026-08-22 all ten legal documents were published to production, and every
 * one of them carried a banner in its own body reading:
 *
 *   > **Draft — not published, and not legal advice.**
 *   > … It has not been reviewed by a lawyer. … liability, indemnity,
 *   > warranties and the dispute clauses are absent rather than drafted, and
 *   > their absence is the reason this is still a draft.
 *
 * A privacy policy that disclaims itself is worse than an absent one. The page
 * that was there before said so in as many words: "we do not put legal text on
 * this page before it has been reviewed, and we do not fill the gap with a
 * placeholder — a document you cannot rely on is worse than one that is
 * honestly absent."
 *
 * `publish-legal.ts` is deliberately one-way, and its reasoning is sound: a
 * published version is immutable, acknowledgements point at it, and the normal
 * way to withdraw one is to publish a replacement. That reasoning holds when
 * somebody has *relied* on the version. It does not hold when nothing has, and
 * the published text is self-evidently not fit to be public.
 *
 * So this exists for exactly that case, and refuses outside it.
 *
 * ## What it refuses to do
 *
 * - It refuses if **any acknowledgement references any version**. That is the
 *   line between "withdraw a mistake" and "erase evidence somebody agreed to
 *   something", and the second is not this script's to do at any time.
 * - It refuses without `--confirm`. `--dry-run` is the default.
 * - It leaves the draft content alone. Withdrawing publication is not deleting
 *   the document; the drafts stay, exactly as `seed-legal.ts` wrote them.
 *
 * ## Usage
 *
 *   npm --workspace api run legal:unpublish -- --dry-run
 *   npm --workspace api run legal:unpublish -- --confirm
 *
 * After running it, `/api/public/legal` returns `{"documents":[]}` and the
 * public pages return to their honest "Not published yet" state.
 */
import { PrismaClient, LegalDocumentVersionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const confirm = process.argv.includes('--confirm');

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const published = await prisma.legalDocumentVersion.findMany({
      where: { status: LegalDocumentVersionStatus.PUBLISHED },
      select: {
        id: true,
        version: true,
        publishedAt: true,
        document: { select: { slug: true, title: true } },
      },
      orderBy: { id: 'asc' },
    });

    /*
     * The refusal that matters. An acknowledgement is somebody's record that
     * they agreed to a specific version, and withdrawing that version out from
     * under it would leave the agreement pointing at nothing. Publishing a
     * corrected replacement is the right move in that case, not this.
     */
    const acknowledgements = await prisma.legalDocumentAcknowledgement.count();
    if (acknowledgements > 0) {
      console.log(
        JSON.stringify(
          {
            mode: 'REFUSED',
            reason:
              'Acknowledgements reference published versions. Withdrawing would strand them. Publish a corrected replacement instead.',
            acknowledgements,
            published: published.length,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    const outcomes = published.map((version) => ({
      slug: version.document.slug,
      title: version.document.title,
      version: version.version,
      publishedAt: version.publishedAt,
      action: confirm ? 'WITHDRAWN' : 'WOULD_WITHDRAW',
    }));

    if (confirm && published.length > 0) {
      await prisma.legalDocumentVersion.updateMany({
        where: { status: LegalDocumentVersionStatus.PUBLISHED },
        data: { status: LegalDocumentVersionStatus.DRAFT, publishedAt: null },
      });
    }

    const remaining = await prisma.legalDocumentVersion.count({
      where: { status: LegalDocumentVersionStatus.PUBLISHED },
    });

    console.log(
      JSON.stringify(
        {
          mode: confirm ? 'CONFIRMED' : 'DRY_RUN',
          acknowledgements,
          withdrawn: confirm ? published.length : 0,
          stillPublished: remaining,
          outcomes,
          note: confirm
            ? 'The drafts are untouched. The public pages now show their unpublished state again.'
            : 'Nothing was written. Re-run with --confirm to withdraw.',
        },
        null,
        2,
      ),
    );

    if (confirm && remaining !== 0) {
      throw new Error(
        `Expected nothing published after withdrawal, found ${remaining}.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
