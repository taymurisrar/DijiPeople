import { DOCUMENTS } from '../../../prisma/seed-legal';
import {
  findDraftSelfDeclarations,
  findUnfilledPlaceholders,
} from './legal.service';

/**
 * REG — every seeded legal document must be publishable.
 *
 * Render's pre-deploy command is `npm --workspace api run release`, which ends
 * in `legal:publish --confirm`. That step refuses to publish a document whose
 * own text says it is an unreviewed draft, or that still carries a
 * `{{PLACEHOLDER}}` — and it is right to refuse.
 *
 * The consequence was that this content rule was enforced at *deploy* time.
 * Two consecutive production deploys ended `pre_deploy_failed`, and the
 * production API sat on a commit from the previous day while `main` moved twice
 * without reaching it. Nothing was broken; a seed file simply still described
 * itself as a draft, and the only place that was ever going to be discovered
 * was a failed release.
 *
 * So the guard is asked here too, against exactly the text the seed will write.
 * The two run the same functions, so they cannot disagree, and this one costs a
 * second in CI rather than a deploy.
 *
 * Note what this does NOT do. It cannot judge whether these documents are
 * adequate, complete, or fit to put in front of a customer — no test can, and
 * a green run here is not legal review. It checks the one thing that needs no
 * judgement: whether the document has already told us it is not ready.
 */
describe('seeded legal documents', () => {
  it('seeds a document for every slug exactly once', () => {
    const slugs = DOCUMENTS.map((document) => document.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThan(0);
  });

  describe.each(
    DOCUMENTS.map((document) => [document.slug, document] as const),
  )('%s', (_slug, document) => {
    it('carries no unfilled placeholder', () => {
      expect(findUnfilledPlaceholders(document.content)).toEqual([]);
    });

    it('does not declare itself an unreviewed draft', () => {
      /*
       * The failure message matters more than usual here. Whoever hits this
       * is mid-release, so it should name the phrase to remove rather than
       * report a length mismatch.
       */
      const declarations = findDraftSelfDeclarations(document.content);
      expect(declarations).toEqual([]);
    });

    it('has a title and a body worth publishing', () => {
      expect(document.title.trim().length).toBeGreaterThan(0);
      expect(document.content.trim().length).toBeGreaterThan(200);
    });
  });
});
