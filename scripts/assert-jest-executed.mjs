#!/usr/bin/env node
/**
 * BUG-3168. A required gate must not be able to pass while executing nothing.
 *
 * The database e2e suites use `describeWithDatabase()`, which becomes
 * `describe.skip` when DATABASE_URL is unset. Jest then exits 0 with every suite
 * skipped, and a job keyed only on the exit code reports success over zero
 * assertions. This reads jest's own summary and refuses that outcome.
 *
 *   node scripts/assert-jest-executed.mjs <report.txt>
 *
 * Exit 0  : at least one test passed and nothing was skipped.
 * Exit 1  : zero passed, or any suite or test skipped, or no summary found.
 *
 * Skips are refused outright rather than baselined: the last green CI run had 78
 * of 78 suites and 1200 of 1200 tests passing with none skipped, so any skip is
 * new and needs a person to decide it is intended. A deliberate skip belongs in
 * an `ALLOWED_SKIPPED_TESTS` count passed as the second argument, with the
 * reason in the commit that raises it.
 */
import { readFileSync } from 'node:fs';

/** Parse the numbers out of a jest `Tests:` / `Test Suites:` summary line. */
export function parseSummaryLine(line) {
  const counts = { passed: 0, failed: 0, skipped: 0, todo: 0, total: 0 };
  const body = line.replace(/^\s*(Tests|Test Suites):\s*/, '');
  for (const part of body.split(',')) {
    const m = part.trim().match(/^(\d+)\s+(passed|failed|skipped|todo|total)\b/);
    if (m) counts[m[2]] = Number(m[1]);
  }
  return counts;
}

export function evaluate(reportText, allowedSkippedTests = 0) {
  const lines = reportText.split(/\r?\n/);
  const testsLine = lines.find((l) => /^\s*Tests:/.test(l));
  const suitesLine = lines.find((l) => /^\s*Test Suites:/.test(l));
  if (!testsLine || !suitesLine) {
    return { ok: false, reason: 'no jest summary found in the report' };
  }
  const tests = parseSummaryLine(testsLine);
  const suites = parseSummaryLine(suitesLine);
  if (tests.passed === 0) {
    return { ok: false, reason: `0 tests passed (${testsLine.trim()})` };
  }
  if (suites.skipped > 0) {
    return {
      ok: false,
      reason: `${suites.skipped} suite(s) skipped (${suitesLine.trim()})`,
    };
  }
  if (tests.skipped > allowedSkippedTests) {
    return {
      ok: false,
      reason: `${tests.skipped} test(s) skipped, ${allowedSkippedTests} allowed (${testsLine.trim()})`,
    };
  }
  return { ok: true, reason: `${tests.passed} passed, ${tests.skipped} skipped` };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('assert-jest-executed.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: assert-jest-executed.mjs <report.txt> [allowedSkippedTests]');
    process.exit(2);
  }
  const allowed = Number(process.argv[3] ?? 0);
  const result = evaluate(readFileSync(file, 'utf8'), allowed);
  if (!result.ok) {
    console.error(`::error title=Gate executed nothing::${result.reason}`);
    process.exit(1);
  }
  console.log(`jest executed: ${result.reason}`);
}
