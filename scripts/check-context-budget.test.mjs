import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from './check-context-budget.mjs';

const base = { alwaysLoaded: { bytes: 1000 } };
const cur = (n) => ({ alwaysLoaded: { bytes: n } });

test('unchanged and shrinking pass', () => {
  assert.equal(verdict(cur(1000), base).ok, true);
  assert.equal(verdict(cur(700), base).ok, true);
});
test('growth inside the allowance passes, beyond it fails', () => {
  assert.equal(verdict(cur(1030), base).ok, true);
  assert.equal(verdict(cur(1031), base).ok, false);
});
test('the limit is derived from the baseline, not hard-coded', () => {
  assert.equal(verdict(cur(2060), { alwaysLoaded: { bytes: 2000 } }).ok, true);
  assert.equal(verdict(cur(2061), { alwaysLoaded: { bytes: 2000 } }).ok, false);
});
