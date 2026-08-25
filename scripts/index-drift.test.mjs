/*
 * BUG-1208 — a drift check must not fire when nothing drifted.
 *
 * `generate-component-index.mjs --check` compared bytes. The generator writes
 * `\n`; Git checks the file out as `\r\n` on Windows. So it reported the index
 * as drifted on every line of an untouched file in every Windows worktree,
 * while passing in CI, which runs on Linux.
 *
 * A check that fails only on developer machines and passes on the runner is
 * worse than no check: it trains people to regenerate reflexively and to
 * disbelieve the signal, so the one time it reports real drift the report is
 * ignored — which defeats the reason the index is generated and verified
 * rather than written by hand.
 *
 * Mutation guide:
 *   drop the \r\n normalisation      → "the same content in two line endings"
 *   drop either stamp replacement    → "a new commit is not a drift"
 *   normalise anything else          → "a changed summary IS a drift"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { comparableIndex, indexIsCurrent } from './lib/index-drift.mjs';

/** A generated index, in the shape the generator actually emits. */
const index = ({ sha = 'abc1234', date = '2026-08-25', summary = 'The command bar.' } = {}) =>
  [
    '# Component Index',
    '',
    `> **Last verified:** ${date}`,
    `> **Verified against commit:** ${sha}`,
    '>',
    '> **This file is generated. Do not hand-edit it.**',
    '',
    '| Export | Kind | Used by | Where | What it is |',
    '|---|---|---|---|---|',
    `| \`ModuleActionBar\` | component | 8 | \`x.tsx\`:71 | ${summary} |`,
    '',
  ].join('\n');

test('the same content in two line endings is not a drift — the BUG-1208 case', () => {
  const lf = index();
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.ok(indexIsCurrent(crlf, lf), 'a CRLF checkout must match an LF generation');
  assert.ok(indexIsCurrent(lf, crlf), 'and the comparison must be symmetric');
});

test('a new commit is not a drift', () => {
  /*
   * The stamp changes on every commit. Comparing it would fail --check on any
   * commit that touched no component at all, which is the same cry-wolf
   * failure by a different route.
   */
  assert.ok(indexIsCurrent(index({ sha: 'aaaaaaa', date: '2026-01-01' }), index({ sha: 'fffffff' })));
});

test('both together — a CRLF checkout from an older commit', () => {
  /* The realistic case: a fresh Windows worktree at a commit made days ago. */
  const committed = index({ sha: 'aaaaaaa', date: '2026-08-01' }).replace(/\n/g, '\r\n');
  assert.ok(indexIsCurrent(committed, index({ sha: 'bbbbbbb', date: '2026-08-25' })));
});

test('a changed summary IS a drift', () => {
  /*
   * The whole point. Normalising too much would produce a check that passes
   * always, which is indistinguishable from having no check while looking
   * like one.
   */
  assert.ok(!indexIsCurrent(index({ summary: 'The command bar.' }), index({ summary: 'Something else.' })));
});

test('a changed row is a drift even across line endings', () => {
  /* Normalisation must not become a way for real drift to hide. */
  const committed = index({ summary: 'Old text.' }).replace(/\n/g, '\r\n');
  assert.ok(!indexIsCurrent(committed, index({ summary: 'New text.' })));
});

test('a missing committed file is a drift, not a match', () => {
  /* The generator passes '' when the target does not exist yet. */
  assert.ok(!indexIsCurrent('', index()));
});

test('comparableIndex leaves the body alone', () => {
  /*
   * Guards against a future "tidy" normalisation — trimming, collapsing blank
   * lines, sorting — quietly widening what counts as equal.
   */
  const out = comparableIndex(index());
  assert.match(out, /ModuleActionBar/);
  assert.match(out, /\| Export \| Kind \|/);
  assert.doesNotMatch(out, /Last verified/);
  assert.doesNotMatch(out, /Verified against commit/);
});
