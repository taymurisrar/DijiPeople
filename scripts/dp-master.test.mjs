import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blockers, readySlices, validateProgram } from './lib/dp-master.mjs';

const slice = (id, status, deps = [], extra = {}) => ({ id, wp: 'WP-01', title: id, release: 'R1', deps, workstream: 'A', status, ...extra });
const base = (slices, extra = {}) => ({
  decisions: [], openDecisions: [], slices, ...extra,
});

test('only ACCEPTED or INTEGRATED satisfy a dependency', () => {
  for (const status of ['NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DEFERRED_APPROVED']) {
    const state = base([slice('A', status), slice('B', 'READY', ['A'])]);
    assert.deepEqual(readySlices(state).map((s) => s.id), status === 'READY' ? ['A'] : status === 'NOT_STARTED' ? ['A'] : [], status);
    assert.match(blockers(state, state.slices[1])[0], /not ACCEPTED\/INTEGRATED/);
  }
  const done = base([slice('A', 'ACCEPTED'), slice('B', 'READY', ['A'])]);
  assert.deepEqual(readySlices(done).map((s) => s.id), ['B']);
});

test('an unapproved decision blocks a slice', () => {
  const state = base([slice('A', 'READY', [], { decision: 'OD-X' })], { openDecisions: [{ id: 'OD-X', status: 'OPEN' }] });
  assert.equal(readySlices(state).length, 0);
  state.openDecisions[0].status = 'APPROVED';
  assert.equal(readySlices(state).length, 1);
});

function program(slices) {
  const plan = '**WP-01 — x** (deps: none).\n';
  return { state: { masterSha256: 'x', wps: [], decisions: [], openDecisions: [], slices }, trace: { requirements: [] }, plan };
}

test('completion needs evidence, an integrated sha, and satisfied dependencies', () => {
  const errors = validateProgram(program([
    slice('A', 'BLOCKED'),
    slice('B', 'ACCEPTED', ['A']),
    slice('C', 'INTEGRATED', [], { evidence: 'tests green on CI run 123' }),
    slice('D', 'DEFERRED_APPROVED'),
  ])).join('\n');
  assert.match(errors, /B is ACCEPTED without recorded evidence/);
  assert.match(errors, /B is ACCEPTED but A is BLOCKED/);
  assert.match(errors, /C is INTEGRATED without an integratedSha/);
  assert.match(errors, /D is DEFERRED_APPROVED without a deferralDecision/);
  assert.match(errors, /A is BLOCKED without blockedBy/);
});

test('a slice dependency cycle is rejected', () => {
  const errors = validateProgram(program([slice('A', 'READY', ['B']), slice('B', 'READY', ['A'])])).join('\n');
  assert.match(errors, /slice dependency cycle/);
});

test('no requirement may stay PENDING_AUDIT once G0 has passed', () => {
  const input = program([]);
  input.state.gates = { G0: { status: 'PASS' } };
  input.trace.requirements = [{ id: 'U01', classification: 'PENDING_AUDIT' }];
  assert.match(validateProgram(input).join('\n'), /U01 is still PENDING_AUDIT after G0 PASS/);
  input.state.gates.G0.status = 'PASS_WITH_NOTES';
  assert.doesNotMatch(validateProgram(input).join('\n'), /PENDING_AUDIT/);
});
