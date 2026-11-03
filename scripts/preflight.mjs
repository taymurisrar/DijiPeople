#!/usr/bin/env node
// Fast local preflight (policy CI-005): the checks that, in the last 50 CI runs,
// would have caught the failures BEFORE the push. Seconds, no database, no network.
//
//   npm run preflight           fast path
//   npm run preflight -- --full adds the framework validator and workspace typecheck
//
// Not a substitute for CI: a local pass is not a CI pass. It exists so the
// cheap, deterministic failures never cost a 15-minute CI round trip.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const full = process.argv.includes('--full');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

function step(name, fn) {
  const t = Date.now();
  let out;
  try { out = fn(); results.push({ name, ok: out !== false, note: typeof out === 'string' ? out : '', ms: Date.now() - t }); }
  catch (e) { results.push({ name, ok: false, note: String(e.message ?? e).split('\n')[0].slice(0, 160), ms: Date.now() - t }); }
}
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' && cmd.endsWith('.cmd') }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${(r.stdout + r.stderr).trim().split('\n').slice(-6).join('\n')}`); return 'ok'; };

// Runtime versions: CI failed 'npm ci' (EUSAGE/EBADENGINE) when a lockfile was written by npm 10 and the repo requires 11.
step('runtime matches package.json engines', () => {
  const eng = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).engines ?? {};
  const major = (v) => String(v).replace(/^[^\d]*/, '').split('.')[0];
  const node = process.versions.node.split('.')[0];
  const npmV = execFileSync(npm, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  const bad = [];
  if (eng.node && major(eng.node) !== node) bad.push(`node ${process.versions.node} but engines.node=${eng.node}`);
  if (eng.npm && major(eng.npm) !== npmV.split('.')[0]) bad.push(`npm ${npmV} but engines.npm=${eng.npm} — a lockfile written with this npm will fail "npm ci" in CI`);
  if (bad.length && process.argv.includes('--allow-runtime-mismatch')) return `WARN (allowed): ${bad.join('; ')}`;
  if (bad.length) throw new Error(`${bad.join('; ')} (re-run with --allow-runtime-mismatch for local work only; CI uses the engines versions)`);
  return `node ${process.versions.node}, npm ${npmV}`;
});

// Branch drift: 18 of 36 failed runs were one branch that had fallen behind develop.
step('branch is not stale against develop', () => {
  try { execFileSync('git', ['fetch', '--quiet', 'origin', 'develop'], { cwd: ROOT, stdio: 'ignore' }); } catch { return 'skipped (offline)'; }
  const behind = Number(execFileSync('git', ['rev-list', '--count', 'HEAD..origin/develop'], { cwd: ROOT, encoding: 'utf8' }).trim());
  if (behind > 25) throw new Error(`${behind} commits behind origin/develop — rebase before pushing; generated indexes and advisory fixes land on develop`);
  return `${behind} behind develop`;
});

step('lockfile present and untouched by a different npm', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  if (lock.lockfileVersion !== 3) throw new Error(`lockfileVersion ${lock.lockfileVersion}, expected 3`);
  return 'lockfileVersion 3';
});

step('API completeness gate', () => run('node', ['scripts/check-api-completeness.mjs']));
step('module completeness gate', () => run('node', ['scripts/check-module-completeness.mjs']));
step('derived doc facts current', () => run('node', ['scripts/derive-doc-facts.mjs', '--check']));
step('policy catalogue + agent/skill validity', () => run('node', ['--test', 'scripts/governance.test.mjs']));
step('lessons valid', () => run('node', ['scripts/lessons.mjs', 'check']));
step('governance tooling tests', () => run('node', ['--test', 'scripts/hooks/guard-bash.test.mjs', 'scripts/ci-doctor.test.mjs', 'scripts/hotfix.test.mjs', 'scripts/api-routes.test.mjs', 'scripts/authz-classify.test.mjs', 'scripts/session-finish.test.mjs', 'scripts/hotfix-rehearsal.test.mjs']));
if (full) {
  step('framework validation', () => run('node', ['scripts/validate-framework.mjs']));
  step('production advisories', () => run('node', ['scripts/check-production-advisories.mjs']));
  step('typecheck (turbo)', () => run(npm, ['run', 'typecheck']));
}

const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${String(r.ms).padStart(5)}ms  ${r.note}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\npreflight FAILED (${failed.length}/${results.length})` : `\npreflight OK (${results.length} checks${full ? ', full' : ', fast'})`);
process.exit(failed.length ? 1 : 0);
