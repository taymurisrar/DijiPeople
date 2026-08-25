/*
 * Comparing a generated index against its committed copy.
 *
 * Two differences must be ignored, and both are properties of the checkout
 * rather than of the content:
 *
 *   - **Line endings.** The generator writes `\n`; Git checks the file out as
 *     `\r\n` on Windows. A byte comparison therefore reported drift on every
 *     line of an untouched file in every Windows worktree — while passing in
 *     CI, which runs on Linux. BUG-1208.
 *   - **The provenance stamp.** `Last verified` and `Verified against commit`
 *     change on every commit, so comparing them would make the check fail on
 *     any commit that touched no component at all.
 *
 * The shared failure mode is what makes this worth a module of its own: a
 * drift check that fires when nothing drifted trains people to regenerate
 * reflexively and to disbelieve the signal, so the one time it reports real
 * drift the report is ignored. That defeats the entire reason the index is
 * generated and verified rather than written by hand.
 *
 * Everything else is content, and content differences are exactly what
 * `--check` exists to catch.
 */

/** Strip a generated index down to what a drift comparison should consider. */
export function comparableIndex(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/^> \*\*Last verified:\*\*.*$/m, '')
    .replace(/^> \*\*Verified against commit:\*\*.*$/m, '');
}

/** True when a committed index still matches what the generator produces. */
export function indexIsCurrent(committed, generated) {
  return comparableIndex(committed) === comparableIndex(generated);
}
