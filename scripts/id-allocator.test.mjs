/*
 * BUG-2413 — the allocator must see every directory a prefix lives in.
 *
 * `PLAN-` numbers are held by two record families: QA test plans in
 * `docs/qa/test-plans`, named `PLAN-nnn-*.md`, and ExecPlans in `docs/plans`,
 * which carry `ID: PLAN-nnn` in frontmatter under an `EXECPLAN-nnnn-*.md`
 * filename. The kind pointed at the first only, so allocation returned a number
 * an ExecPlan already held — the allocator issuing the collision it exists to
 * prevent, and the third such collision this repository has reconciled.
 *
 * These cases run against a temporary tree rather than the repository, so they
 * keep failing for the right reason once the real records move on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { highestAllocated, ID_KINDS } from './lib/id-allocator.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'id-allocator-'));
  mkdirSync(join(root, 'docs/qa/test-plans'), { recursive: true });
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  return root;
}

test('the plan kind scans both directories that hold PLAN- numbers', () => {
  assert.deepEqual(
    ID_KINDS.plan.dir,
    ['docs/qa/test-plans', 'docs/plans'],
    'ExecPlans in docs/plans must be visible to the plan allocator',
  );
});

test('an ExecPlan id in frontmatter raises the ceiling', () => {
  const root = fixture();
  try {
    /* A QA test plan, numbered in its filename. */
    writeFileSync(join(root, 'docs/qa/test-plans/PLAN-003-billing.md'), '# Billing\n');

    /*
     * An ExecPlan: the FILENAME says 0027, the ID says 027. Only reading the
     * file finds the number that actually matters.
     */
    writeFileSync(
      join(root, 'docs/plans/EXECPLAN-0027-attendance.md'),
      '---\nID: PLAN-027\naliases: [PLAN-027, EXECPLAN-0027]\n---\n\n# ExecPlan\n',
    );

    assert.equal(
      highestAllocated(root, 'plan'),
      27,
      'the ceiling must include an ExecPlan id declared in frontmatter',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a QA test plan alone still sets the ceiling', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'docs/qa/test-plans/PLAN-019-platform-admin.md'), '# Admin\n');
    assert.equal(highestAllocated(root, 'plan'), 19);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kinds with a single directory are unaffected', () => {
  const root = fixture();
  try {
    mkdirSync(join(root, 'docs/bugs'), { recursive: true });
    writeFileSync(join(root, 'docs/bugs/BUG-0042-something.md'), '# Bug\n');
    assert.equal(highestAllocated(root, 'bug'), 42, 'a string `dir` must keep working');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
