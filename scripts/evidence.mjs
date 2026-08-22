#!/usr/bin/env node
/*
 * Record expensive evidence, and ask whether it is still worth trusting.
 *
 *   node scripts/evidence.mjs record DB-E2E-001 \
 *     --command "npm --workspace api run test:e2e" \
 *     --scope services/api/test,services/api/prisma \
 *     --result PASS --detail "304/304"
 *
 *   node scripts/evidence.mjs check DB-E2E-001      # may I reuse it?
 *   node scripts/evidence.mjs list
 *   node scripts/evidence.mjs invalidate DB-E2E-001 --reason MANUAL --note "flaky runner"
 *
 * `check` exits 0 when the evidence is reusable and 1 when it is not, so it can
 * gate a suite:
 *
 *   node scripts/evidence.mjs check DB-E2E-001 || npm --workspace api run test:e2e
 *
 * The whole design rests on one asymmetry. Re-running a suite that nothing
 * invalidated costs minutes; reusing a result after the code beneath it changed
 * costs a false PASS with a real command behind it. So every ambiguity —
 * unresolvable SHA, missing scope, non-PASS result — resolves to "run it again".
 *
 * Exit codes: 0 valid / done · 1 not reusable or refused · 2 usage error
 *
 * No dependencies.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_RESULTS,
  INVALIDATION_REASONS,
  LEDGER_FILE,
  evaluate,
  loadLedger,
  record as recordEntry,
  saveLedger,
} from './lib/evidence-ledger.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const command = argv[0];
const id = argv[1] && !argv[1].startsWith('--') ? argv[1] : '';

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

const ROOT = option('root') ? resolve(option('root')) : DEFAULT_ROOT;
const asJson = argv.includes('--json');

function usage(message = '') {
  if (message) console.error(`${message}\n`);
  console.error('Usage: node scripts/evidence.mjs <record|check|list|invalidate> [id] [options]');
  console.error('');
  console.error('  record <id>   --command <cmd> --scope <a,b> --result PASS [--detail <text>] [--sha <sha>]');
  console.error('  check  <id>   [--at <sha>]');
  console.error('  list          [--json]');
  console.error('  invalidate <id> --reason SCOPE_CHANGED|SUPERSEDED|MANUAL [--note <text>]');
  process.exit(2);
}

if (!command || argv.includes('--help')) usage();

const headSha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
})();

const ledger = loadLedger(ROOT);

if (command === 'record') {
  if (!id) usage('record needs an id.');

  const result = option('result', 'PASS').trim().toUpperCase();
  if (!EVIDENCE_RESULTS.includes(result)) {
    usage(`--result "${result}" is not one of ${EVIDENCE_RESULTS.join(' | ')}`);
  }

  const cmd = option('command').trim();
  if (!cmd) usage('record needs --command: evidence with no command behind it is an assertion.');

  const scope = option('scope')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!scope.length) {
    usage(
      'record needs --scope: a record with no scope can never be invalidated, ' +
        'which would make the laziest evidence the most durable.',
    );
  }

  recordEntry(ledger, {
    id,
    command: cmd,
    scope,
    result,
    detail: option('detail').trim(),
    sha: option('sha').trim() || headSha,
    session: option('session').trim(),
    recordedAt: new Date().toISOString(),
  });

  saveLedger(ROOT, ledger);
  console.log(`Recorded ${id} at ${option('sha').trim() || headSha} — ${result}`);
  console.log(`  scope: ${scope.join(', ')}`);
  console.log(`  ${LEDGER_FILE}`);
  process.exit(0);
}

if (command === 'check') {
  if (!id) usage('check needs an id.');

  const entry = ledger.records.find((candidate) => candidate.id === id);
  if (!entry) {
    if (asJson) console.log(JSON.stringify({ id, valid: false, reason: 'no such evidence record' }));
    else console.log(`${id} — NOT_RECORDED. Run the suite.`);
    process.exit(1);
  }

  const verdict = evaluate(ROOT, entry, option('at', 'HEAD'));

  if (asJson) {
    console.log(JSON.stringify({ id, ...verdict, record: entry }, null, 2));
    process.exit(verdict.valid ? 0 : 1);
  }

  console.log(`${id} — ${verdict.valid ? 'REUSABLE' : 'INVALIDATED'}`);
  console.log(`  command  ${entry.command}`);
  console.log(`  recorded ${entry.sha} — ${entry.result}${entry.detail ? ` (${entry.detail})` : ''}`);
  console.log(`  scope    ${(entry.scope ?? []).join(', ')}`);
  console.log(`  reason   ${verdict.reason}`);
  if (verdict.changed.length) {
    console.log('  changed:');
    for (const path of verdict.changed.slice(0, 15)) console.log(`    ${path}`);
    if (verdict.changed.length > 15) console.log(`    … and ${verdict.changed.length - 15} more`);
  }
  process.exit(verdict.valid ? 0 : 1);
}

if (command === 'invalidate') {
  if (!id) usage('invalidate needs an id.');

  const reason = option('reason', 'MANUAL').trim().toUpperCase();
  if (!INVALIDATION_REASONS.includes(reason)) {
    usage(`--reason "${reason}" is not one of ${INVALIDATION_REASONS.join(' | ')}`);
  }

  const entry = ledger.records.find((candidate) => candidate.id === id);
  if (!entry) {
    console.error(`No evidence record ${id}.`);
    process.exit(1);
  }

  /*
   * Marked, never deleted. A removed row leaves no trace that the result was
   * once claimed, and "why did we re-run that?" is a question somebody asks
   * weeks later.
   */
  entry.invalidatedBy = `${reason}${option('note').trim() ? ` — ${option('note').trim()}` : ''}`;
  entry.invalidatedAt = new Date().toISOString();
  saveLedger(ROOT, ledger);

  console.log(`${id} invalidated — ${entry.invalidatedBy}`);
  process.exit(0);
}

if (command === 'list') {
  const rows = ledger.records.map((entry) => ({
    id: entry.id,
    result: entry.result,
    sha: entry.sha,
    scope: entry.scope ?? [],
    ...evaluate(ROOT, entry),
  }));

  if (asJson) {
    console.log(JSON.stringify({ records: rows }, null, 2));
    process.exit(0);
  }

  if (!rows.length) {
    console.log('No evidence recorded yet.');
    process.exit(0);
  }

  console.log('');
  console.log(`Evidence ledger — ${rows.length} record(s), evaluated at ${headSha || 'HEAD'}`);
  console.log('');
  for (const row of rows) {
    console.log(`  ${row.valid ? 'REUSABLE   ' : 'INVALIDATED'}  ${row.id.padEnd(20)} ${row.sha}  ${row.result}`);
    console.log(`                 ${row.reason}`);
  }
  console.log('');
  process.exit(0);
}

usage(`Unknown command "${command}".`);
