import test from 'node:test';
import assert from 'node:assert/strict';
import { branchClass, classify, summarise, CAUSES } from './ci-doctor.mjs';

// Fixtures are excerpts of REAL failures observed in CI runs 41472410252 and 40198343104.
test('lockfile drift from a Dependabot npm-10 lockfile', () => {
  const c = classify({ job: 'API tests', step: 'Run npm ci', log: 'npm warn EBADENGINE\nnpm error code EUSAGE\nnpm error `npm ci` can only install packages when your package.json and package-lock.json are in sync' });
  assert.equal(c.id, 'LOCKFILE_DRIFT');
  assert.equal(c.retryable, false);
});
test('advisory gate', () => {
  const c = classify({ job: 'Runtime schema tests', step: 'No undocumented production advisories', log: 'check-production-advisories: a CRITICAL advisory is present' });
  assert.equal(c.id, 'DEPENDENCY_ADVISORY');
});
test('type error in e2e workspace', () => {
  assert.equal(classify({ job: 'Typecheck', step: 'Run npm run typecheck', log: "golive/tests/21.spec.ts(124,179): error TS2551: Property 'X' does not exist" }).id, 'TYPE_ERROR');
});
test('framework validation drift', () => {
  assert.equal(classify({ job: 'Framework validation', step: 'Validate agent framework', log: 'Framework validation FAILED — 3 of 6528 checks:\n  x simulation 61' }).id, 'FRAMEWORK_RECORD_DRIFT');
});
test('the aggregate gate is never reported as a cause', () => {
  assert.equal(classify({ job: 'CI required gate', step: 'Verify all required jobs passed', log: '' }).id, 'GATE_DERIVED');
});
test('only verified-transient infrastructure causes are retryable', () => {
  const retryable = CAUSES.filter((c) => c.retryable).map((c) => c.id).sort();
  assert.deepEqual(retryable, ['NETWORK_TRANSIENT', 'RUNNER_TIMEOUT']);
  assert.equal(classify({ job: 'x', step: 'y', log: 'FAIL src/a.spec.ts\nTests: 2 failed' }).retryable, false, 'a failing test is never retried into green');
});
test('unknown failures are surfaced, not guessed', () => {
  assert.equal(classify({ job: 'x', step: 'y', log: 'something novel' }).id, 'UNCLASSIFIED');
});
test('branch classes and summary exclude gate noise', () => {
  assert.equal(branchClass('develop'), 'trunk');
  assert.equal(branchClass('dependabot/npm_and_yarn/x'), 'dependabot');
  assert.equal(branchClass('agent/x'), 'feature');
  const s = summarise([
    { cause: { id: 'GATE_DERIVED' }, branchClass: 'feature' },
    { cause: { id: 'TYPE_ERROR' }, branchClass: 'feature' },
  ]);
  assert.deepEqual(s.byCause, { TYPE_ERROR: 1 });
});
