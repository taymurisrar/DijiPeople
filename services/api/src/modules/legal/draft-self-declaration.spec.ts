import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  findDraftSelfDeclarations,
  findUnfilledPlaceholders,
} from './legal.service';

/**
 * REG-229 — the guard that was missing on 2026-08-22.
 *
 * All ten legal documents were published to production carrying a banner in
 * their own body:
 *
 *   > **Draft — not published, and not legal advice.**
 *   > … It has not been reviewed by a lawyer. … liability, indemnity,
 *   > warranties and the dispute clauses are absent rather than drafted, and
 *   > their absence is the reason this is still a draft.
 *
 * The privacy policy of a live product told its readers not to rely on it.
 *
 * **Nothing refused, and the reason is worth stating precisely.**
 * `findUnfilledPlaceholders` was the only content gate, and it asks whether the
 * template was *filled in*. That is a different question from whether the
 * result is *fit to publish*, and the documents answered the first one
 * perfectly: complete prose, no `{{PLACEHOLDER}}` anywhere. They simply said
 * they were drafts.
 *
 * A gate that asks the wrong question passes confidently. That is the failure
 * mode here, not a missing gate.
 *
 * ## Why this reads the real seed file
 *
 * A fixture string containing the banner would prove the regex matches itself.
 * The claim worth testing is that the guard refuses **the exact text that was
 * actually published**, so the spec reads `prisma/seed-legal.ts` and asserts
 * against its real content.
 *
 * That also makes the test self-retiring in the right way: when the banners are
 * removed and the copy is genuinely ready, the first test fails and says so —
 * at which point the documents can be published and the assertion inverted.
 */
describe('REG-229 — a document that calls itself a draft is not publishable', () => {
  const seedSource = readFileSync(
    join(__dirname, '..', '..', '..', 'prisma', 'seed-legal.ts'),
    'utf8',
  );

  it('refuses the banner the seeded documents actually carry', () => {
    /*
     * The literal text from production, not a paraphrase. If somebody rewords
     * the banner, this test failing is the correct outcome — it means the guard
     * needs to learn the new wording before that document can be trusted.
     */
    const published = [
      '# Privacy Policy',
      '',
      '> **Draft — not published, and not legal advice.**',
      '>',
      '> This text describes what the DijiPeople platform actually does, written',
      '> by the engineering team from the implementation. It has not been',
      '> reviewed by a lawyer.',
      '',
      '## What this platform holds',
    ].join('\n');

    const found = findDraftSelfDeclarations(published);

    expect(found).toContain('declares itself an unpublished draft');
    expect(found).toContain('states it has not been reviewed by a lawyer');
  });

  it('shows why the existing placeholder gate let it through', () => {
    /*
     * Not a redundant assertion — it is the diagnosis. The old gate was working
     * exactly as designed; it was answering a question nobody had noticed was
     * the wrong one.
     */
    const published =
      '> **Draft — not published, and not legal advice.** It has not been reviewed by a lawyer.';

    expect(findUnfilledPlaceholders(published)).toEqual([]);
    expect(findDraftSelfDeclarations(published).length).toBeGreaterThan(0);
  });

  it('no longer flags the seed file, because the copy has been written', () => {
    /*
     * This assertion used to be `toBeGreaterThan(0)`, with the comment "the
     * live state as of this commit: the seeded copy is not publishable. When
     * this fails, the copy has been cleaned and can be published."
     *
     * It failed on 2026-08-23, which is the outcome it was watching for: the
     * business supplied real Liability, Indemnity, Governing law, Tax, transfer,
     * breach-notification and audit clauses, and the review banner came off all
     * ten documents. So the assertion flips rather than being deleted — the
     * pending state it recorded is now the state it asserts, and the file is
     * still watched.
     *
     * Note this reads the seed file as *source*, so it sees comments as well as
     * document text. That is deliberately the coarser check. Per-document
     * verification against exactly the content the seed writes lives in
     * `seed-legal-publishable.spec.ts`, which is what the release actually
     * depends on.
     */
    expect(findDraftSelfDeclarations(seedSource)).toEqual([]);
  });

  it('passes a document that is genuinely ready', () => {
    /*
     * The paired assertion, and the one that keeps the guard usable. A check
     * that refuses everything is not a safeguard, it is an outage — and it
     * would be removed the first time somebody had real copy to publish.
     */
    const ready = [
      '# Privacy Policy',
      '',
      'DijiPeople Technologies FZ-LLC is the controller of the personal data',
      'described below. This notice takes effect on 1 September 2026.',
      '',
      '## What we hold',
      '',
      'Names, work e-mail addresses and company details submitted through our',
      'contact and subscription forms.',
    ].join('\n');

    expect(findDraftSelfDeclarations(ready)).toEqual([]);
    expect(findUnfilledPlaceholders(ready)).toEqual([]);
  });

  it('does not refuse a document that merely discusses drafts', () => {
    /*
     * The false positive that would get this check deleted. A terms of service
     * may legitimately talk about draft contracts and draft statements of work,
     * and refusing to publish over the bare word would be worse than the defect
     * — a noisy guard gets bypassed, and then it protects nothing.
     */
    const legitimate = [
      '# Terms of Service',
      '',
      'Where an order form is issued in draft, the draft has no contractual',
      'effect until both parties execute it. A draft statement of work may be',
      'revised without notice.',
    ].join('\n');

    expect(findDraftSelfDeclarations(legitimate)).toEqual([]);
  });

  it('flags unfinished-work markers', () => {
    // Cheap, and the one class of leftover most likely to survive a read-through.
    expect(findDraftSelfDeclarations('Liability: TODO')).toContain(
      'carries an unfinished-work marker',
    );
    expect(findDraftSelfDeclarations('Governing law: TBD')).toContain(
      'carries an unfinished-work marker',
    );
  });
});
