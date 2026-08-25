/*
 * Which ref stands for "this task's commits" in a repository health check.
 *
 * Extracted from `repo-health.mjs` so it can be tested. That is not
 * bookkeeping: BUG-1203 existed *because* this decision was four lines of
 * inline fallback sitting under a long, correct comment explaining the very
 * false positive it went on to cause. The comment was right, unenforced, and
 * therefore no defence at all.
 *
 * MAIN_CHANGE_STATUS asks "did **this task** move production", which is not
 * "has production moved". Several sessions run at once here, and a colleague
 * merging a release advances `main` through no fault of the task being
 * audited. The answer is containment — does `origin/main` contain this task's
 * commits — so everything depends on naming the right commits.
 *
 * `HEAD` is a good stand-in in a task worktree, where HEAD *is* the task
 * branch. It is a bad one in the primary checkout, which sits on `develop`:
 * a release merges `develop` into `main`, so HEAD becomes an ancestor of
 * `origin/main` and every task audited from there is blamed for it. That fires
 * at the end of a task, after the task branch is deleted — precisely when the
 * field is read, and when a false blocker costs the most.
 */

/**
 * @param {object} input
 * @param {string} [input.supplied]     an explicit --task-sha or --task-branch, if given
 * @param {string} [input.head]         the current branch name, or 'HEAD' when detached
 * @param {string} input.target         the production branch (usually 'main')
 * @param {string} input.integration    the integration branch ('develop')
 * @returns {string} the ref to resolve, or '' for "no basis to attribute"
 */
export function taskShaRef({ supplied, head, target, integration }) {
  /* An explicit answer always wins — the caller knows what the task was. */
  if (supplied) return supplied;

  /*
   * Standing on a shared branch is not evidence that this task put anything
   * on it. Returning '' skips the containment test and leaves the baseline
   * comparison to decide, which reports UNTOUCHED when `main` merely advanced.
   * An unproven-but-correct reading beats a confidently wrong blocker.
   */
  if (!head || head === target || head === integration) return '';

  /*
   * Detached HEAD is deliberately allowed through. A detached checkout is not
   * a shared branch, and a task that ends detached still has commits worth
   * testing for containment.
   */
  return 'HEAD';
}
