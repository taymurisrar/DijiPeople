import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyProgram } from './lib/program-completion.mjs';
import { decide } from './hooks/stop-completion.mjs';

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(manifest, { reviews = [], commitReviews = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dp-program-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'core.autocrlf', 'false');
  mkdirSync(join(root, 'docs/engineering/reviews'), { recursive: true });
  mkdirSync(join(root, 'docs/bugs'), { recursive: true });
  writeFileSync(join(root, 'src.txt'), 'one' + String.fromCharCode(10));
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  const reviewed = git(root, 'rev-parse', 'HEAD');
  for (const review of reviews) {
    writeFileSync(
      join(root, `docs/engineering/reviews/${review.name}.json`),
      JSON.stringify({ sha: reviewed, reviewer: 'dp-qa', implementer: 'dp-api', paths: ['src.txt'], ...review.body }),
    );
  }
  if (commitReviews && reviews.length > 0) {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'reviews');
  }
  const sha = git(root, 'rev-parse', 'HEAD');
  const full = { programId: 'T', candidate: { sha }, ...manifest };
  writeFileSync(join(root, 'docs/engineering/program-completion.json'), JSON.stringify(full));
  return { root, sha };
}

const green = () => ({ state: 'SUCCESS' });
const gateWithReview = { id: 'G', checks: [{ type: 'review', gate: 'G', role: 'qa' }, { type: 'ci', sha: 'CANDIDATE' }] };

test('premature completion: an open required gate keeps the program IN_PROGRESS', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const result = verifyProgram(root, { ci: green });
  assert.equal(result.verdict, 'IN_PROGRESS');
  assert.equal(result.nextGate.id, 'G');
});

test('all-green fixture reaches READY_TO_MERGE_MAIN', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }] },
  );
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'READY_TO_MERGE_MAIN');
});

test('red CI on the candidate is VALIDATION_FAILED, not progress', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }] },
  );
  assert.equal(verifyProgram(root, { ci: () => ({ state: 'FAILED' }) }).verdict, 'VALIDATION_FAILED');
});

test('CI that cannot be read is never a pass', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }] },
  );
  assert.notEqual(verifyProgram(root, { ci: () => ({ state: 'UNKNOWN' }) }).verdict, 'READY_TO_MERGE_MAIN');
});

test('a self-review (reviewer == implementer) does not satisfy the gate', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE', reviewer: 'dp-api' } }] },
  );
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'IN_PROGRESS');
});

test('a review goes stale when a later commit touches the reviewed paths', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }] },
  );
  writeFileSync(join(root, 'src.txt'), 'two\n');
  git(root, 'commit', '-qam', 'later');
  const later = git(root, 'rev-parse', 'HEAD');
  const manifest = JSON.parse(
    execFileSync('node', ['-e', "console.log(require('fs').readFileSync('docs/engineering/program-completion.json','utf8'))"], { cwd: root, encoding: 'utf8' }),
  );
  manifest.candidate.sha = later;
  writeFileSync(join(root, 'docs/engineering/program-completion.json'), JSON.stringify(manifest));
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'IN_PROGRESS');
});

test('a gate with no checks, or a self-reported status, is a manifest error', () => {
  const { root } = fixture({ gates: [{ id: 'EMPTY', checks: [] }, { id: 'LIAR', status: 'DONE', checks: [{ type: 'ci', sha: 'CANDIDATE' }] }] });
  const result = verifyProgram(root, { ci: green });
  assert.equal(result.verdict, 'VALIDATION_FAILED');
  assert.ok(result.problems.some((p) => p.includes('vacuously')));
  assert.ok(result.problems.some((p) => p.includes('self-reported')));
});

test('only an open owner decision on EVERY remaining gate yields BLOCKED_OWNER_ACTION', () => {
  const owner = { id: 'O', waitsOnOwnerDecisions: ['D1'], checks: [{ type: 'review', gate: 'O', role: 'security' }] };
  const { root } = fixture({ gates: [owner], ownerDecisions: [{ id: 'D1', status: 'OPEN' }] });
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'BLOCKED_OWNER_ACTION');
  const mixed = fixture({ gates: [owner, gateWithReview], ownerDecisions: [{ id: 'D1', status: 'OPEN' }] });
  assert.equal(verifyProgram(mixed.root, { ci: green }).verdict, 'IN_PROGRESS');
});

test('open P0 record blocks the backlog gate; terminal status clears it', () => {
  const gate = { id: 'B', checks: [{ type: 'no-open-records', priorities: ['P0'] }] };
  const { root } = fixture({ gates: [gate] });
  const record = (status) => `---\nID: BUG-9001\nTitle: t\nStatus: ${status}\nSeverity: HIGH\nPriority: P0\nType: LOGIC\nSource: QA\nDetectedDate: 2026-01-01\nDetectedInSha: abc\nAffectedModules: [x]\nOwnerAgent: a\nArchitectDisposition: FIX_NOW\nCreatedAt: 2026-01-01\nUpdatedAt: 2026-01-01\n---\n\n# BUG-9001\n`;
  writeFileSync(join(root, 'docs/bugs/BUG-9001-t.md'), record('OPEN'));
  assert.equal(verifyProgram(root, {}).verdict, 'IN_PROGRESS');
  writeFileSync(join(root, 'docs/bugs/BUG-9001-t.md'), record('CLOSED'));
  assert.equal(verifyProgram(root, {}).verdict, 'READY_TO_MERGE_MAIN');
});

// ------------------------------------------------------------------ the hook

const active = (root) => ({ active: true, worktrees: [root], blocks: 0, stagnant: 0, maxStagnant: 3, maxBlocks: 60 });

test('hook blocks a premature stop while a required gate is open', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const out = decide({ root, input: { cwd: root }, state: active(root), verify: (r) => verifyProgram(r, { ci: green }) });
  assert.equal(out.action, 'block');
  assert.match(out.reason, /Next required gate: G/);
});

test('hook allows the stop on the all-green fixture', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }] },
  );
  const out = decide({ root, input: { cwd: root }, state: active(root), verify: (r) => verifyProgram(r, { ci: green }) });
  assert.equal(out.action, 'allow');
  assert.equal(out.result.verdict, 'READY_TO_MERGE_MAIN');
});

test('hook never touches an inactive program or a session outside its worktrees', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const verify = (r) => verifyProgram(r, { ci: green });
  assert.equal(decide({ root, input: { cwd: root }, state: null, verify }).action, 'allow');
  assert.equal(decide({ root, input: { cwd: root }, state: { ...active(root), active: false }, verify }).action, 'allow');
  assert.equal(decide({ root, input: { cwd: tmpdir() }, state: active(root), verify }).action, 'allow');
});

test('hook releases after three consecutive blocks with no progress, and says so', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const verify = (r) => verifyProgram(r, { ci: green });
  let state = active(root);
  let out;
  for (let i = 0; i < 6; i += 1) {
    out = decide({ root, input: { cwd: root, stop_hook_active: i > 0 }, state, verify });
    if (out.action === 'allow') break;
    state = out.state;
  }
  assert.equal(out.action, 'allow');
  assert.match(out.why, /NOT complete/);
});

test('hook respects the total block budget', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const verify = (r) => verifyProgram(r, { ci: green });
  const out = decide({ root, input: { cwd: root }, state: { ...active(root), blocks: 60 }, verify });
  assert.equal(out.action, 'allow');
  assert.match(out.why, /budget/);
});

test('a review that names no paths can never go stale, so it is not evidence', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE', paths: [] } }] },
  );
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'IN_PROGRESS');
});

test('a review file that is not part of the candidate commit is not evidence', () => {
  const { root } = fixture(
    { gates: [gateWithReview] },
    { reviews: [{ name: 'g-qa', body: { gate: 'G', role: 'qa', verdict: 'APPROVE' } }], commitReviews: false },
  );
  assert.equal(verifyProgram(root, { ci: green }).verdict, 'IN_PROGRESS');
});

test('record exemptions need an owner decision covering them; the old free-form list is refused', () => {
  const gate = { id: 'B', checks: [{ type: 'no-open-records', priorities: ['P0'] }] };
  const open = `---
ID: BUG-9002
Title: t
Status: OPEN
Severity: HIGH
Priority: P0
Type: LOGIC
Source: QA
DetectedDate: 2026-01-01
DetectedInSha: abc
AffectedModules: [x]
OwnerAgent: a
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-01-01
UpdatedAt: 2026-01-01
---

# BUG-9002
`;
  const a = fixture({ gates: [gate], acceptedOrOwnerGated: ['BUG-9002'] });
  writeFileSync(join(a.root, 'docs/bugs/BUG-9002-t.md'), open);
  assert.equal(verifyProgram(a.root, {}).verdict, 'VALIDATION_FAILED');
  const b = fixture({ gates: [gate], ownerDecisions: [{ id: 'D', status: 'OPEN', covers: ['BUG-9002'] }] });
  writeFileSync(join(b.root, 'docs/bugs/BUG-9002-t.md'), open);
  assert.equal(verifyProgram(b.root, {}).verdict, 'READY_TO_MERGE_MAIN');
  const c = fixture({ gates: [gate] });
  writeFileSync(join(c.root, 'docs/bugs/BUG-9002-t.md'), open);
  assert.equal(verifyProgram(c.root, {}).verdict, 'IN_PROGRESS');
});

test('an empty commit is not progress, and a fresh turn does not reset the stagnation count', () => {
  const { root } = fixture({ gates: [gateWithReview] });
  const verify = (r) => verifyProgram(r, { ci: green });
  let state = active(root);
  let out;
  for (let i = 0; i < 6; i += 1) {
    git(root, 'commit', '--allow-empty', '-qm', `empty ${i}`);
    out = decide({ root, input: { cwd: root, stop_hook_active: false }, state, verify });
    if (out.action === 'allow') break;
    state = out.state;
  }
  assert.equal(out.action, 'allow');
  assert.match(out.why, /NOT complete/);
});
