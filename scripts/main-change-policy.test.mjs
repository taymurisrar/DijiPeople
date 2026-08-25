/*
 * ITEM-0091 — a RELEASE must not fail its own health check for doing the one
 * thing that defines it.
 *
 * `repo-health.mjs` blocked unconditionally on `CHANGED_BY_THIS_TASK`, while
 * the message it raised named the three task types permitted to do exactly
 * that. So every successful release ended on `Repository health — FAIL`, and
 * the completion contract requires `POST_TASK_REPO_HEALTH = PASS`.
 *
 * A gate that cannot pass on a legitimate task teaches the operator to read
 * past it, which is how a real blocker gets through unnoticed.
 *
 * The risk in fixing it is obvious and is what most of these cases guard: this
 * is the field that reports an unauthorised mutation of the production branch,
 * so widening it by one type too many is far worse than the bug. Every case
 * below that asserts BLOCK is protecting that, not padding the count.
 *
 * Mutation guide:
 *   allow an unknown type            → "an unknown task type blocks"
 *   allow REWRITTEN for RELEASE      → "REWRITTEN blocks for every task type"
 *   drop the case normalisation      → "the type is matched case-insensitively"
 *   block CHANGED for RELEASE        → "a RELEASE reports rather than blocks"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mainChangeVerdict, PRODUCTION_TASK_TYPES } from './lib/main-change-policy.mjs';

test('a RELEASE reports rather than blocks — the ITEM-0091 case', () => {
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', 'RELEASE'), 'EXPECTED');
});

test('every production task type is permitted, and only those three', () => {
  /*
   * Driven off the exported list so the two cannot drift apart: adding a type
   * to the constant without meaning to would be visible here as a new
   * permitted type, rather than silently widening the gate.
   */
  assert.deepEqual(PRODUCTION_TASK_TYPES, ['RELEASE', 'DEPLOY', 'HOTFIX_PRODUCTION']);
  for (const type of PRODUCTION_TASK_TYPES) {
    assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', type), 'EXPECTED', type);
  }
});

test('an ordinary task with commits on main still blocks', () => {
  /* The behaviour the field exists for. Losing this loses the whole check. */
  for (const type of ['FEATURE', 'BUG', 'QA', 'FRAMEWORK', 'ARCHITECTURE']) {
    assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', type), 'BLOCK', type);
  }
});

test('an unknown task type blocks', () => {
  /*
   * The safe default, and the reason `--task-type` cannot be used to silence
   * the field by accident. A typo — `RELESE`, `release-candidate` — must not
   * read as permission.
   */
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', 'RELESE'), 'BLOCK');
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', 'RELEASE_CANDIDATE'), 'BLOCK');
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', ''), 'BLOCK');
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', undefined), 'BLOCK');
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK'), 'BLOCK');
});

test('REWRITTEN blocks for every task type, without exception', () => {
  /*
   * Nothing in this framework rewrites the production branch — not a release
   * either. This is the case that must survive any future widening of the
   * permitted-type list.
   */
  for (const type of [...PRODUCTION_TASK_TYPES, 'FEATURE', '', undefined]) {
    assert.equal(mainChangeVerdict('REWRITTEN', type), 'BLOCK', String(type));
  }
});

test('the type is matched case-insensitively and tolerates surrounding space', () => {
  /* It arrives from a CLI flag and from session records; both vary. */
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', 'release'), 'EXPECTED');
  assert.equal(mainChangeVerdict('CHANGED_BY_THIS_TASK', ' Release '), 'EXPECTED');
});

test('an untouched or unknown main says nothing, whatever the task type', () => {
  for (const type of ['RELEASE', 'FEATURE', undefined]) {
    assert.equal(mainChangeVerdict('UNTOUCHED', type), 'OK', String(type));
    assert.equal(mainChangeVerdict('UNKNOWN', type), 'OK', String(type));
  }
});
