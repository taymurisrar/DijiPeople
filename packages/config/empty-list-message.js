/*
 * What an empty list should say.
 *
 * Two defects, one sentence. The Platform Admin default read
 * "Create a <thing> or adjust the current view and filters" for every empty
 * list, which is wrong twice over:
 *
 *   - It blames filters that are not set, so a brand-new workspace tells its
 *     first operator that a search they never ran is hiding data that does not
 *     exist (BUG-1752 — and BUG-1654 before it, fixed in `apps/web` only).
 *   - It instructs the operator to create a record on screens that offer no
 *     create control at all. Invoices, payments and commissions arrive from
 *     elsewhere; the instruction cannot be followed from where it is given
 *     (BUG-1559).
 *
 * `apps/web` fixed the first half for itself and `apps/admin` kept the defect,
 * which is why this lives here rather than in either app: one implementation,
 * so the next correction does not have to be made twice.
 *
 * The filtering decision is the caller's, never recomputed here. The table
 * already tracks it — including operators that filter without a value, like
 * "is empty" — and a second definition would disagree with the first the moment
 * either changed. It cannot come from row counts either: in server mode the
 * rows are already the filtered page, so "fewer rows than we have" cannot
 * separate an empty module from an over-filtered one.
 */

/**
 * "a" or "an", chosen from the word rather than assumed.
 *
 * "Create a invoice" was on production screens an operator used daily
 * (BUG-1558). Sound, not spelling, is what decides this — so the handful of
 * words where the two disagree are listed rather than left to the vowel rule,
 * which would otherwise say "an user" and "a hour".
 */
const VOWEL_SOUND_EXCEPTIONS = /^(hour|honest|honou?r|heir)/i;
const CONSONANT_SOUND_EXCEPTIONS =
  /^(user|unit|union|europe|one|once|uniform|universal|usage)/i;

function indefiniteArticle(word) {
  const value = String(word ?? "").trim();
  if (!value) return "a";
  if (VOWEL_SOUND_EXCEPTIONS.test(value)) return "an";
  if (CONSONANT_SOUND_EXCEPTIONS.test(value)) return "a";
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

/**
 * The body text for an empty list.
 *
 * @param {object} input
 * @param {boolean} input.filtered  Whether a search or filter is active.
 * @param {boolean} [input.canCreate]  Whether this screen offers a create
 *   control. Only consulted when nothing is filtered — "no matches" never
 *   suggests creating, because the operator is looking for something specific.
 * @param {string} [input.singular]  Used in the create suggestion.
 * @param {string} [input.origin]  Where records come from, for a screen that
 *   cannot create them. Rendered instead of a suggestion the operator cannot
 *   act on.
 */
function emptyListDescription(input) {
  const { filtered, canCreate = false, singular, origin } = input ?? {};

  if (filtered) {
    return "No records match the selected search or filters. Clear them to see everything.";
  }
  if (canCreate && singular) {
    const noun = singular.toLowerCase();
    return `Nothing here yet. Create ${indefiniteArticle(noun)} ${noun} to get started.`;
  }
  if (origin) {
    return `Nothing here yet. ${origin}`;
  }
  return "Nothing here yet.";
}

/**
 * The heading for an empty list.
 *
 * Distinguishes the two states in the title as well as the body, because the
 * title is what a scanning eye reads: "No matching X" and "No X yet" are
 * different situations and should not share a heading.
 */
function emptyListTitle(input) {
  const { filtered, plural } = input ?? {};
  const label = (plural ?? "records").toLowerCase();
  return filtered ? `No matching ${label}` : `No ${label} yet`;
}

module.exports = { emptyListDescription, emptyListTitle, indefiniteArticle };
