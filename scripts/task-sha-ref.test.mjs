/*
 * BUG-1203 — MAIN_CHANGE_STATUS must not blame this task for another
 * session's merge.
 *
 * What happened: TASK-0022's final health check reported
 * `MAIN_CHANGE_STATUS = CHANGED_BY_THIS_TASK` and a FAIL, for a task whose
 * three commits were provably absent from `origin/main`. The identical run
 * with `--task-branch` said `UNTOUCHED`. The difference was the fallback: with
 * no explicit task ref it used `HEAD`, and the run was from the primary
 * checkout, which sits on `develop` — which a colleague's release had merged
 * into `main`, making HEAD an ancestor of `origin/main`.
 *
 * The containment test itself was already correct, and carried a long comment
 * explaining precisely this false positive. It had no test, so a fallback
 * added later walked straight back into it. That is what these cases exist to
 * stop, and why the decision was extracted to be testable at all.
 *
 * Mutation guide — each case fails if a specific guard is removed:
 *   drop the `head === integration` check → "the primary checkout on develop"
 *   drop the `head === target` check      → "a checkout standing on main"
 *   drop the `supplied` short-circuit     → "an explicit task ref always wins"
 *   return 'HEAD' for detached            → "a detached task checkout"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { taskShaRef } from './lib/task-sha-ref.mjs';

const shared = { target: 'main', integration: 'develop' };

test('the primary checkout on develop attributes nothing — the BUG-1203 case', () => {
  /*
   * The exact reproduction. Returning '' skips containment and lets the
   * baseline comparison report UNTOUCHED, which is the truth: main advanced,
   * but not because of this task.
   */
  assert.equal(taskShaRef({ head: 'develop', ...shared }), '');
});

test('a checkout standing on main attributes nothing either', () => {
  /*
   * Standing on the production branch is not evidence that this task put
   * anything there. If it did, the merge is visible some other way — and a
   * RELEASE task passes --task-sha explicitly.
   */
  assert.equal(taskShaRef({ head: 'main', ...shared }), '');
});

test('a task worktree still attributes HEAD', () => {
  /* The case the fallback exists for, and which must keep working. */
  assert.equal(taskShaRef({ head: 'agent/some-feature', ...shared }), 'HEAD');
});

test('an explicit task ref always wins, even on a shared branch', () => {
  /*
   * A RELEASE task legitimately puts work on main and says so. The explicit
   * value must survive both guards, or the one task type that is *supposed*
   * to report CHANGED_BY_THIS_TASK never could.
   */
  assert.equal(taskShaRef({ supplied: 'abc1234', head: 'main', ...shared }), 'abc1234');
  assert.equal(taskShaRef({ supplied: 'abc1234', head: 'develop', ...shared }), 'abc1234');
});

test('a detached task checkout still attributes HEAD', () => {
  /* Detached is not a shared branch; its commits are still worth testing. */
  assert.equal(taskShaRef({ head: 'HEAD', ...shared }), 'HEAD');
});

test('an unreadable branch name attributes nothing rather than guessing', () => {
  /* git failed. Unknown provenance must not become a production blocker. */
  assert.equal(taskShaRef({ head: '', ...shared }), '');
  assert.equal(taskShaRef({ ...shared }), '');
});

test('the guard follows the resolved branch names, not the literals', () => {
  /*
   * `TARGET` is read from origin/HEAD rather than hardcoded, so a repository
   * whose production branch is called something else must be protected the
   * same way. Hardcoding 'main' here would silently unprotect it.
   */
  assert.equal(taskShaRef({ head: 'trunk', target: 'trunk', integration: 'staging' }), '');
  assert.equal(taskShaRef({ head: 'staging', target: 'trunk', integration: 'staging' }), '');
  assert.equal(taskShaRef({ head: 'main', target: 'trunk', integration: 'staging' }), 'HEAD');
});
