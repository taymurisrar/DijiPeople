/*
 * Term normalisation for knowledge retrieval.
 *
 * THE DEFECT THIS EXISTS FOR
 *
 * `retrieve-knowledge.mjs` scored literal substrings, so the same concept
 * spelled two ways scored as two unrelated words. Measured at `2d609724`:
 *
 *   node scripts/retrieve-knowledge.mjs "command bar"   → returns
 *     .agent/context/runtime-module-system.md — the file that answers it
 *   node scripts/retrieve-knowledge.mjs command-bar     → does not,
 *     and reports "(9 passing mentions filtered out …)"
 *
 * One hyphen, opposite outcomes, and no way for the caller to know which
 * spelling this repository happened to use. That is a bad failure mode for a
 * retrieval step whose whole job is to stop an agent writing a defect somebody
 * already documented: it fails silently, and its silence reads as "there is no
 * prior knowledge here" — which is precisely the conclusion that produces the
 * repeat.
 *
 * Component names make it routine rather than rare. A component is written
 * `ModuleActionBar` in code, `module-action-bar.tsx` on disk, and "command
 * bar" in prose, and an agent may reasonably type any of the three.
 *
 * WHY NOT STEMMING OR FUZZY MATCHING
 *
 * Both would also match things that are not the term. This repository's terms
 * are identifiers — module names, component names, permission keys — where the
 * variance is punctuation and case, not morphology. Expanding punctuation is
 * exact and predictable; edit-distance matching would surface `partners` for
 * `partner-experience` and quietly widen every query.
 */

/*
 * Split an identifier into its words, whichever convention wrote it.
 * Handles camelCase, PascalCase, kebab-case, snake_case, dotted keys, spaces,
 * and the acronym runs this codebase uses (`RBACMatrix` → rbac, matrix).
 */
export function tokenize(term) {
  return String(term)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s\-_.\/]+/)
    .map((word) => word.toLowerCase().trim())
    .filter(Boolean);
}

/*
 * Every spelling of a term worth searching for.
 *
 * A single-word term expands to itself and nothing else — the point is joining
 * words, and a term with one word has no joins to make. `.tsx` and `.ts` are
 * stripped first so a filename pasted from an error message behaves like the
 * component name it contains.
 */
export function spellings(term) {
  const cleaned = String(term).replace(/\.(tsx?|jsx?|mjs)$/i, '');
  const words = tokenize(cleaned);
  if (words.length <= 1) return [cleaned.toLowerCase()].filter(Boolean);
  return [...new Set([words.join('-'), words.join(' '), words.join(''), cleaned.toLowerCase()])];
}

/*
 * Score one term against one document, counting its best spelling rather than
 * the sum of all of them.
 *
 * Max, not sum, is the load-bearing choice. A document that happens to use two
 * spellings of the same word is not twice as relevant as one that consistently
 * uses one, and summing would rank a passing mention in a document with mixed
 * conventions above a heading in a document with tidy ones.
 *
 * Weights are unchanged from the original implementation — filename 10,
 * heading 5, occurrences capped at 5 — because they were not the defect and
 * changing them would move every existing result for no stated reason.
 */
export function scoreTerm(term, { name, headings, body }) {
  let best = 0;
  for (const spelling of spellings(term)) {
    if (!spelling) continue;
    let value = 0;
    if (name.includes(spelling)) value += 10;
    if (headings.includes(spelling)) value += 5;
    const occurrences = body.split(spelling).length - 1;
    if (occurrences) value += Math.min(occurrences, 5);
    if (value > best) best = value;
  }
  return best;
}
