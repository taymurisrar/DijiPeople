import { listDataSources } from './data-sources';
import { listMetrics } from '../metrics/metric.registry';

/**
 * The same note must not be written twice in two different ways.
 *
 * A metric carries its own copy of a caveat so the note appears beside the tile
 * that holds the number, and the source carries it so it appears in the page's
 * "How to read these numbers" panel. That panel renders the union of the two,
 * deduplicated with a `Set` — which deduplicates by exact string and nothing
 * else.
 *
 * On the deployed Desktop Activity surface that produced a panel listing five
 * caveats twice each, because the source said "the contaminated rows are the
 * ones whose..." while the metric said "...are those whose...". Both sentences
 * are correct and neither is the same string, so the `Set` kept both and the
 * reader got a wall of text that repeated itself.
 *
 * The fix is one authoritative wording that both import. This test is what
 * stops the next author restating a caveat instead of importing it.
 */

/**
 * Two caveats are "the same note" when they share most of their vocabulary.
 *
 * A prefix comparison was tried first and does not work: the pair that shipped
 * diverges at the fourth word ("nominal, not measured" against "nominal rather
 * than measured"), so any prefix long enough to avoid false positives is
 * already past the point where the two sentences differ. Word-set overlap
 * catches the real shape — one sentence said twice with small edits.
 */
const SIMILARITY_THRESHOLD = 0.6;

function words(caveat: string): Set<string> {
  return new Set(
    caveat
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function allCaveats(): { text: string; owner: string }[] {
  const collected: { text: string; owner: string }[] = [];

  for (const source of listDataSources()) {
    for (const caveat of source.caveats ?? []) {
      collected.push({ text: caveat, owner: 'source:' + source.key });
    }
  }

  for (const metric of listMetrics()) {
    for (const caveat of metric.caveats ?? []) {
      collected.push({ text: caveat, owner: 'metric:' + metric.key });
    }
  }

  return collected;
}

describe('reporting caveats are written once', () => {
  it('collects enough caveats for this test to mean anything', () => {
    // A uniqueness test over an empty set passes for the wrong reason.
    expect(allCaveats().length).toBeGreaterThan(20);
  });

  it('has no two caveats that say the same thing in different words', () => {
    const all = allCaveats().map((entry) => ({
      ...entry,
      bag: words(entry.text),
    }));
    const collisions: string[] = [];

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        // The identical string on both a source and its metric is the intended
        // arrangement: `collectCaveats` folds those into one with a `Set`. Only
        // a differing wording survives that fold and reaches the reader twice,
        // so only a differing wording is the defect.
        if (all[i].text === all[j].text) continue;

        const score = similarity(all[i].bag, all[j].bag);
        if (score >= SIMILARITY_THRESHOLD) {
          collisions.push(
            [
              '',
              '  ' + all[i].owner + ' :: ' + all[i].text,
              '  ' + all[j].owner + ' :: ' + all[j].text,
              '  -> ' +
                String(Math.round(score * 100)) +
                '% shared vocabulary; import one constant rather than restating it',
            ].join('\n'),
          );
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});
