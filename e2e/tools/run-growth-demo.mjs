#!/usr/bin/env node
/**
 * Replays the ahk. enterprises Growth demo, in script order, against a running
 * local stack and prints one result table.
 *
 * The segments are the browser suites that already prove each part of the demo
 * (docs/qa/demo-scripts/ahk-growth-30-minute-demo.md). Running them back to back
 * in one invocation, in the order a presenter would, with one clock, is what
 * "the whole demo, continuously" means here; it is not a new test and it adds no
 * coverage of its own.
 *
 *   buy Growth by bank transfer -> approve -> provision -> activate -> sign in   (Flow Q)
 *   recruit -> hire -> onboard -> convert                                         (Flow O)
 *   leave -> approvals -> notifications -> timesheets -> attendance -> projects
 *   -> documents -> settings                                                      (Flow P)
 *
 * Preconditions are the same as the suites' own: a disposable `*_test` database
 * seeded with seed:config, seed:demo, seed:admin and prepare-growth-tenant.mjs,
 * the API, landing, admin and tenant web running, and the E2E_* variables set.
 * Every suite refuses to write anywhere else.
 *
 * Exit code is non-zero if any segment fails or is skipped, so a skip cannot pass
 * as readiness.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(here, '..');

const SEGMENTS = [
  ['Buy Growth by bank transfer, approve, provision, activate, sign in', 'tests/flow-q-growth-bank-transfer-browser.spec.ts'],
  ['Recruit, hire, onboard, convert to employee', 'tests/flow-o-growth-hiring-browser.spec.ts'],
  ['Leave, approvals, notifications, timesheets, attendance, projects, documents, settings', 'tests/flow-p-growth-hr-browser.spec.ts'],
];

const outDir = path.join(e2eDir, 'demo-run-output');
mkdirSync(outDir, { recursive: true });

const started = Date.now();
const results = [];
for (const [name, file] of SEGMENTS) {
  const jsonPath = path.join(outDir, `${path.basename(file)}.json`);
  const t0 = Date.now();
  const run = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['playwright', 'test', file, '--workers=1', '--reporter=json'],
    {
      cwd: e2eDir,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath },
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 1024 * 1024 * 256,
    },
  );
  const seconds = Math.round((Date.now() - t0) / 1000);
  let stats = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
  const failures = [];
  try {
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    stats = { ...stats, ...report.stats };
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          if (t.status === 'unexpected') {
            const err = (t.results ?? []).map((r) => r.error?.message).find(Boolean) ?? '';
            // eslint-disable-next-line no-control-regex
            failures.push(`${spec.title}: ${err.replace(/[[0-9;]*m/g, '').slice(0, 500)}`);
          }
          if (t.status === 'skipped') failures.push(`SKIPPED: ${spec.title}`);
        }
      }
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites ?? []) walk(suite);
  } catch {
    failures.push(`no readable report (exit ${run.status}); ${String(run.stderr).slice(0, 300)}`);
  }
  results.push({ name, file, seconds, ...stats, failures, exit: run.status });
  console.log(`done ${file}: ${stats.expected} passed, ${stats.unexpected} failed, ${stats.skipped} skipped, ${stats.flaky} flaky, ${seconds}s`);
}

const total = Math.round((Date.now() - started) / 1000);
const sum = (k) => results.reduce((n, r) => n + (r[k] ?? 0), 0);
const lines = [
  '| Segment | Passed | Failed | Skipped | Flaky | Seconds |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.expected} | ${r.unexpected} | ${r.skipped} | ${r.flaky} | ${r.seconds} |`),
  `| **Total** | **${sum('expected')}** | **${sum('unexpected')}** | **${sum('skipped')}** | **${sum('flaky')}** | **${total}** |`,
];
const bad = results.flatMap((r) => r.failures.map((f) => `- ${r.file}: ${f}`));
const verdict = sum('unexpected') === 0 && sum('skipped') === 0 && results.every((r) => r.exit === 0) ? 'PASS' : 'FAIL';
const text = [`# Growth demo run: ${verdict}`, '', ...lines, '', ...(bad.length ? ['## Failures and skips', ...bad] : [])].join('\n');
writeFileSync(path.join(outDir, 'summary.md'), text + '\n');
console.log('\n' + text);
process.exit(verdict === 'PASS' ? 0 : 1);
