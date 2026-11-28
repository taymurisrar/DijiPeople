import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluate, parseSummaryLine } from './assert-jest-executed.mjs';

const report = (suites, tests) =>
  `Test Suites: ${suites}\nTests:       ${tests}\nSnapshots:   0 total\n`;

test('parses a jest summary line', () => {
  assert.deepEqual(parseSummaryLine('Tests:       3 skipped, 1200 passed, 1203 total'), {
    passed: 1200,
    failed: 0,
    skipped: 3,
    todo: 0,
    total: 1203,
  });
});

test('accepts a run that executed everything', () => {
  assert.equal(evaluate(report('78 passed, 78 total', '1200 passed, 1200 total')).ok, true);
});

test('refuses a run where every suite was skipped (DATABASE_URL unset)', () => {
  const result = evaluate(report('78 skipped, 78 total', '1200 skipped, 1200 total'));
  assert.equal(result.ok, false);
  assert.match(result.reason, /0 tests passed/);
});

test('refuses a run with zero tests', () => {
  assert.equal(evaluate(report('0 total', '0 total')).ok, false);
});

test('refuses when some suites were skipped even though others passed', () => {
  const result = evaluate(report('3 skipped, 75 passed, 78 total', '900 passed, 900 total'));
  assert.equal(result.ok, false);
  assert.match(result.reason, /suite\(s\) skipped/);
});

test('refuses skipped tests unless a count is explicitly allowed', () => {
  const text = report('78 passed, 78 total', '2 skipped, 1198 passed, 1200 total');
  assert.equal(evaluate(text).ok, false);
  assert.equal(evaluate(text, 2).ok, true);
  assert.equal(evaluate(text, 1).ok, false);
});

test('refuses a report with no summary', () => {
  const result = evaluate('something unrelated\n');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no jest summary/);
});
