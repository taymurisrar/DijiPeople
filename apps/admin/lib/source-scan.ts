/**
 * Read source for assertions, without reading its comments.
 *
 * `apps/admin` jest has no jsdom, so a good deal of what can be asserted about
 * this app is asserted over its source. That works, and it has one recurring
 * failure mode which has now caught four separate specs:
 *
 *   A comment explaining what the code *used to* do contains the very string
 *   the spec asserts is absent — so the scan reports the fix as the bug.
 *
 * It is not a hypothetical. `z-layers.spec.ts` met it first ("this used to be
 * z-30"), `notification-count.spec.ts` met it second (`take: limit * 20`), and
 * the theme and monitoring specs met it on the same afternoon: one asserted
 * `bg-slate-100` was gone from a file whose comment says the body used to be
 * `bg-slate-100`, and the other asserted the word "placeholder" was absent from
 * a component whose comment promises no placeholder cards.
 *
 * The house style is substantial explanatory comments, so this will keep
 * happening. One helper, used by every source-scanning spec, is the fix.
 */

/** Strips block and line comments. Not a parser — it does not need to be. */
export function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * A file's code with its comments removed, and its JSX comment braces with it.
 *
 * `{/* … *\/}` leaves a stray `{}` once the block inside is stripped, which is
 * harmless for a `toContain` and confusing to read in a failure diff.
 */
export function codeOnly(source: string) {
  return stripComments(source).replace(/\{\s*\}/g, "");
}
