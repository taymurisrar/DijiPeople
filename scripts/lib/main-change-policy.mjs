/*
 * Whether `MAIN_CHANGE_STATUS` is a blocker, given what kind of task ran.
 *
 * ITEM-0091. `repo-health.mjs` raised a hard blocker whenever the status was
 * `CHANGED_BY_THIS_TASK`, and the message it raised names the three task types
 * that are *permitted* to do it — then blocks anyway, because the check had no
 * way to know which type it was running under.
 *
 * So a RELEASE task reported `Repository health — FAIL` for having done the one
 * thing that defines it. The completion contract requires
 * `POST_TASK_REPO_HEALTH = PASS`, so every successful release ended on a gate
 * that could not pass. A gate that cannot pass on a legitimate task teaches the
 * operator to read past it, which is exactly how a real blocker gets through
 * unnoticed — the same reasoning that makes the CI warning ceiling a ratchet
 * rather than a large number.
 *
 * The narrowness is the point. Only `CHANGED_BY_THIS_TASK` is conditional, and
 * only for the three types that are allowed to move production. `REWRITTEN`
 * stays blocking for every task type without exception, because rewriting the
 * production branch is not something a release does either — nothing in this
 * framework does it.
 */

/** The task types permitted to put commits on the production branch. */
export const PRODUCTION_TASK_TYPES = ['RELEASE', 'DEPLOY', 'HOTFIX_PRODUCTION'];

/**
 * @param {string} status      the computed MAIN_CHANGE_STATUS
 * @param {string} [taskType]  the task's type, if known
 * @returns {'BLOCK'|'EXPECTED'|'OK'}
 *   BLOCK    — raise the blocker
 *   EXPECTED — the status is the defining outcome of this task type; report it,
 *              do not block
 *   OK       — nothing to say
 */
export function mainChangeVerdict(status, taskType) {
  if (status === 'REWRITTEN') return 'BLOCK';
  if (status !== 'CHANGED_BY_THIS_TASK') return 'OK';

  /*
   * Unknown type blocks. An unrecognised or absent `--task-type` must not be a
   * way to silence the production-safety field: the whole value of this check
   * is that an ordinary task cannot quietly move `main`, and defaulting to
   * "probably fine" would hand that away to a typo.
   */
  const normalised = String(taskType ?? '').trim().toUpperCase();
  return PRODUCTION_TASK_TYPES.includes(normalised) ? 'EXPECTED' : 'BLOCK';
}
