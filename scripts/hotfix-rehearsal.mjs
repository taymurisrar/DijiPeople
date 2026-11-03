#!/usr/bin/env node
// End-to-end hotfix REHEARSAL (policy HOT-001..HOT-006), entirely non-production.
//
//   node scripts/hotfix-rehearsal.mjs [--simulate-owner-approval] [--out report.json] [--keep]
//
// It builds a throwaway git repo and a local fake "production" health endpoint,
// then runs the real emergency path against them with the real scripts/hotfix.mjs:
//
//   simulated P1 bug in a RELEASED version -> baseline taken from the health
//   endpoint (not from the branch tip) -> hotfix branch from the release SHA ->
//   minimal patch -> regression test red-then-green -> build (twice, same hash) ->
//   release evidence -> APPROVAL CHECKPOINT -> [simulated deploy, health/smoke,
//   rollback] -> backport onto a diverged develop and re-run the regression there.
//
// WITHOUT --simulate-owner-approval it stops at the checkpoint and nothing is
// "deployed" (status AWAITING_OWNER_APPROVAL). The flag exists so the post-approval
// half of the runbook can be rehearsed against the FAKE target; it does nothing in
// the real repository, and no real deploy command exists anywhere in this file.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOTFIX = path.join(HERE, 'hotfix.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const node = (cwd, ...args) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

/** The released code carries a tenant-isolation bug: it returns every tenant's leave. */
const BUGGY = `export function listLeave(db, user) {\n  return db.filter((row) => row.status !== 'deleted');\n}\n`;
const FIXED = `export function listLeave(db, user) {\n  return db.filter((row) => row.status !== 'deleted' && row.tenantId === user.tenantId);\n}\n`;
const TEST = `import assert from 'node:assert/strict';\nimport { listLeave } from '../src/leave.js';\nconst db = [\n  { id: 1, tenantId: 'a', status: 'open' },\n  { id: 2, tenantId: 'b', status: 'open' },\n];\nconst rows = listLeave(db, { tenantId: 'a' });\nassert.deepEqual(rows.map((r) => r.id), [1], 'a user must only see their own tenant\\'s leave');\nconsole.log('regression ok');\n`;
const BUILD = `import fs from 'node:fs';\nimport crypto from 'node:crypto';\nconst src = fs.readFileSync('src/leave.js', 'utf8');\nfs.mkdirSync('dist', { recursive: true });\nfs.writeFileSync('dist/leave.js', src);\nfs.writeFileSync('dist/manifest.json', JSON.stringify({ sha256: crypto.createHash('sha256').update(src).digest('hex') }));\nconsole.log('build ok');\n`;

function startFakeProduction(initialSha) {
  const state = { commit: initialSha, deployed: [] };
  const server = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', commit: state.commit }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}/api/health` })));
}

export async function rehearse({ simulateApproval = false, keep = false } = {}) {
  const steps = [];
  const record = (id, status, detail = {}) => steps.push({ id, status, ...detail });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-rehearsal-'));

  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'rehearsal@example.invalid');
  git(root, 'config', 'user.name', 'Rehearsal');
  write(root, 'package.json', JSON.stringify({ name: 'rehearsal', type: 'module' }));
  write(root, 'src/leave.js', BUGGY);
  write(root, 'test/leave.test.js', TEST);
  write(root, 'build.js', BUILD);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'release 1.0.0 (contains the bug)');
  const releaseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'tag', 'release-1.0.0');

  // development moves on: the tip is NOT what production runs
  write(root, 'src/feature.js', 'export const newFeature = () => 42;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: unrelated work already on develop');
  const tipSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'branch', 'develop-sim');

  const prod = await startFakeProduction(releaseSha);
  try {
    record('SIMULATED_BUG', 'DONE', { detail: 'released listLeave() ignores tenantId (cross-tenant read)', severity: 'P1' });

    // 1. baseline from release metadata, via the real tool and the real HTTP path
    const plan = await new Promise((resolve) => {
      const child = spawn(process.execPath, [HOTFIX, 'dry-run', '--severity', 'P1', '--title', 'Cross-tenant leave read', '--prod-url', prod.url, '--paths', 'src/leave.js'], { cwd: root });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', (code) => resolve({ code, plan: JSON.parse(out || '{}') }));
    });
    const baselineOk = plan.plan.baseline?.baseSha === releaseSha && plan.plan.baseline?.baseSha !== tipSha;
    record('BASELINE_FROM_RELEASE_METADATA', baselineOk ? 'PASS' : 'FAIL', { baseSha: plan.plan.baseline?.baseSha, tipSha, note: 'baseline is the deployed SHA, not the branch tip' });
    record('PLAN_AND_GATES', plan.code === 0 && plan.plan.approval?.status === 'PENDING_OWNER' ? 'PASS' : 'FAIL', { gates: (plan.plan.gates ?? []).map((g) => g.id), approval: plan.plan.approval?.status });

    // 2. hotfix branch from the release SHA, regression RED on the baseline
    git(root, 'checkout', '-q', '-b', plan.plan.branch, releaseSha);
    const red = node(root, 'test/leave.test.js');
    record('REGRESSION_RED_BEFORE_PATCH', !red.ok ? 'PASS' : 'FAIL', { note: 'the regression test must fail on the released code, or it proves nothing' });

    // 3. minimal patch, regression GREEN, build twice for determinism
    write(root, 'src/leave.js', FIXED);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'fix: scope leave listing to the caller\'s tenant');
    const hotfixSha = git(root, 'rev-parse', 'HEAD');
    const diffFiles = git(root, 'diff', '--name-only', `${releaseSha}..${hotfixSha}`).split('\n').filter(Boolean);
    record('MINIMAL_PATCH', diffFiles.length === 1 ? 'PASS' : 'FAIL', { files: diffFiles, hotfixSha });
    const green = node(root, 'test/leave.test.js');
    record('REGRESSION_GREEN_AFTER_PATCH', green.ok ? 'PASS' : 'FAIL');
    const b1 = node(root, 'build.js');
    const h1 = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8')).sha256;
    fs.rmSync(path.join(root, 'dist'), { recursive: true });
    const b2 = node(root, 'build.js');
    const h2 = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8')).sha256;
    record('BUILD_REPRODUCIBLE', b1.ok && b2.ok && h1 === h2 ? 'PASS' : 'FAIL', { artifactSha256: h1 });

    const changelog = git(root, 'log', '--format=- %h %s', `${releaseSha}..${hotfixSha}`);
    const evidence = { incident: plan.plan.incident, baseline: releaseSha, hotfix: hotfixSha, files: diffFiles, artifactSha256: h1, changelog, rollbackTo: releaseSha };
    record('RELEASE_EVIDENCE', 'PASS', { evidenceSha256: crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex') });

    // 4. APPROVAL CHECKPOINT
    if (!simulateApproval) {
      record('OWNER_APPROVAL', 'AWAITING_OWNER_APPROVAL', { note: 'stopped here: only a person can approve; nothing was deployed' });
    } else {
      record('OWNER_APPROVAL', 'SIMULATED', { note: 'rehearsal flag; in reality a human approves outside this tool' });
      // 5. SIMULATED deploy to the FAKE target, health, smoke
      prod.state.commit = hotfixSha;
      prod.state.deployed.push({ sha: hotfixSha, simulated: true });
      const health = await (await fetch(prod.url)).json();
      record('SIMULATED_DEPLOY_AND_HEALTH', health.commit === hotfixSha ? 'PASS' : 'FAIL', { healthCommit: health.commit, note: 'FAKE target' });
      const smoke = node(root, 'test/leave.test.js');
      record('SMOKE_ON_DEPLOYED_SHA', smoke.ok ? 'PASS' : 'FAIL');
      // 6. rollback rehearsal
      prod.state.commit = releaseSha;
      const back = await (await fetch(prod.url)).json();
      record('ROLLBACK_REHEARSAL', back.commit === releaseSha ? 'PASS' : 'FAIL', { rolledBackTo: back.commit });
    }

    // 7. backport onto the diverged develop and re-run the regression there
    git(root, 'checkout', '-q', 'develop-sim');
    let backportOk = true;
    try {
      git(root, 'cherry-pick', hotfixSha);
    } catch {
      backportOk = false;
      try { git(root, 'cherry-pick', '--abort'); } catch { /* nothing to abort */ }
    }
    const onDevelop = backportOk ? node(root, 'test/leave.test.js') : { ok: false };
    record('BACKPORT_TO_DEVELOP', backportOk && onDevelop.ok ? 'PASS' : 'FAIL', { cleanCherryPick: backportOk, regressionOnDevelop: onDevelop.ok });
  } finally {
    prod.server.close();
  }

  const failed = steps.filter((s) => s.status === 'FAIL');
  const report = {
    mode: 'REHEARSAL_NON_PRODUCTION',
    outcome: failed.length ? 'FAILED' : simulateApproval ? 'REHEARSED_END_TO_END' : 'STOPPED_AT_APPROVAL',
    deployedAnywhere: false,
    steps,
    automationMap: AUTOMATION_MAP,
    workdir: keep ? root : '(removed)',
  };
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
  return report;
}

/** Which real-world steps are automated, which need external configuration, which need the owner. */
export const AUTOMATION_MAP = [
  { step: 'Incident record, severity gate (P0/P1 only)', kind: 'AUTOMATED', by: 'hotfix.mjs plan' },
  { step: 'Deployed-SHA discovery from release metadata', kind: 'AUTOMATED_NEEDS_URL', by: 'hotfix.mjs --prod-url (production /api/health must expose the commit)' },
  { step: 'Hotfix branch from the release SHA, minimal patch', kind: 'AGENT_OR_HUMAN', by: 'git' },
  { step: 'Red-then-green regression, lint, build, authorization gates', kind: 'AUTOMATED', by: 'plan lists gates by changed path; CI runs them' },
  { step: 'Reproducible build and release evidence', kind: 'AUTOMATED', by: 'this rehearsal proves the pattern; CI artifact upload is the real thing' },
  { step: 'Staging / preview validation', kind: 'REQUIRES_EXTERNAL_CONFIGURATION', by: 'Vercel preview exists per branch; Render has no verified staging or canary — do not assume one' },
  { step: 'Rollback instructions', kind: 'AUTOMATED_TEXT', by: 'plan.rollback; executing a rollback is a platform action' },
  { step: 'Production deployment approval', kind: 'REQUIRES_OWNER_APPROVAL', by: 'a person; no tool can grant it' },
  { step: 'Production deploy (merge to main -> Render/Vercel)', kind: 'REQUIRES_OWNER_APPROVAL', by: 'existing pipeline; main is protected (PR + exact-SHA CI gate)' },
  { step: 'Post-deploy health, smoke, monitoring', kind: 'PARTLY_AUTOMATED', by: 'smoke:deployment script; monitoring review is human' },
  { step: 'Backport to develop and close the incident', kind: 'AGENT_OR_HUMAN', by: 'cherry-pick verified here; HOT-006 has no automatic observer' },
];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const report = await rehearse({ simulateApproval: argv.includes('--simulate-owner-approval'), keep: argv.includes('--keep') });
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined;
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.outcome === 'FAILED' ? 1 : 0);
}
