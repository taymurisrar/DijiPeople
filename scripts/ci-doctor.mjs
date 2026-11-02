#!/usr/bin/env node
// CI doctor: READ-ONLY collection and classification of failed GitHub Actions
// runs (policy CI-001..CI-005). It never reruns, cancels, edits a workflow or
// weakens a gate; it tells a human or agent what failed and why, and keeps the
// FIRST failure's evidence so a retry cannot erase it.
//
//   node scripts/ci-doctor.mjs --limit 50                  trend + causes (needs `gh` auth)
//   node scripts/ci-doctor.mjs --run <id> [--summary]      one run; --summary emits Markdown
//   node scripts/ci-doctor.mjs --limit 50 --out <dir>      also write evidence files
//
// Relationship to scripts/ci-evidence.mjs: that tool decides whether a
// CANCELLED run still counts as evidence for a SHA. This one explains FAILURES.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Ordered: first match wins. `retryable` is true ONLY for verified-transient infrastructure. */
export const CAUSES = [
  { id: 'LOCKFILE_DRIFT', retryable: false, owner: 'dependencies', test: (t) => /npm error code EUSAGE|npm ci` can only install packages when|lock file.*(not in sync|out of sync)/i.test(t), fix: 'Regenerate package-lock.json with the repo npm (11.x), not the runner default, then commit it.' },
  { id: 'DEPENDENCY_ADVISORY', retryable: false, owner: 'dependencies', test: (t, f) => /check-production-advisories/.test(t) || /undocumented production advisories/i.test(f.step ?? ''), fix: 'Resolve the advisory (update/override) or document it in scripts/check-production-advisories.mjs with a reasoned record. Never widen the allowlist to go green.' },
  { id: 'TYPE_ERROR', retryable: false, owner: 'application', test: (t) => /error TS\d{4}:/.test(t), fix: 'Fix the type error in the named file; reproduce with the workspace check-types script.' },
  { id: 'LINT_OR_FORMAT', retryable: false, owner: 'application', test: (t) => /\[warn\] .*\n?.*Code style issues|eslint.*(error|✖)|--max-warnings/i.test(t), fix: 'Run eslint --fix / prettier --write locally before pushing; do not raise --max-warnings.' },
  { id: 'SHALLOW_CHECKOUT', retryable: false, owner: 'workflow-config', test: (t) => /could not be checked — origin\/main or origin\/develop is not fetched/.test(t) && !/ x /.test(t.replace(/.*could not be checked.*/g, '')), fix: 'The job checks out without origin/main and origin/develop; fetch them (fetch-depth: 0 or a targeted fetch) so repository-health checks are real.' },
  { id: 'FRAMEWORK_RECORD_DRIFT', retryable: false, owner: 'framework', test: (t, f) => /Framework validation FAILED/.test(t) || /Validate agent framework/.test(f.step ?? ''), fix: 'Run `npm run validate:framework` locally after rebasing on develop; stale generated indexes/records are the usual cause.' },
  { id: 'TEST_FAILURE', retryable: false, owner: 'application', test: (t) => /Tests:\s+.*\d+ failed|✕|FAIL\s+\S+\.spec\./.test(t), fix: 'Reproduce the first failing spec in isolation; a failure that passes on rerun is a flaky test to fix, not a pass.' },
  { id: 'RUNNER_TIMEOUT', retryable: true, owner: 'infrastructure', test: (t) => /The operation was canceled|exceeded the maximum execution time|timed out after/i.test(t), fix: 'Verify it is not a hang in the code under test (compare duration with prior runs) before attributing to the runner.' },
  { id: 'NETWORK_TRANSIENT', retryable: true, owner: 'infrastructure', test: (t) => /ECONNRESET|ETIMEDOUT|EAI_AGAIN|HTTP 50[234]|socket hang up|rate limit exceeded/i.test(t), fix: 'Eligible for ONE rerun, with the original evidence kept.' },
  { id: 'MISSING_SECRET_OR_ENV', retryable: false, owner: 'workflow-config', test: (t) => /(is required|not set|undefined).*(secret|env|DATABASE_URL|TOKEN)|Missing required environment/i.test(t), fix: 'Declare the variable in the workflow env / repository secrets and in packages/config validation; forks and Dependabot do not receive secrets.' },
];
const DERIVED_JOBS = new Set(['CI required gate']);

export function classify(entry) {
  if (DERIVED_JOBS.has(entry.job)) return { id: 'GATE_DERIVED', retryable: false, owner: 'n/a', fix: 'Aggregate job — fix the upstream failing job instead.' };
  const text = entry.log ?? '';
  for (const c of CAUSES) if (c.test(text, entry)) return { id: c.id, retryable: c.retryable, owner: c.owner, fix: c.fix };
  return { id: 'UNCLASSIFIED', retryable: false, owner: 'unknown', fix: 'Read the failing step log; add a rule here once the cause is understood.' };
}

/** Trunk branches are expected green; a red feature branch is a different signal from a red develop. */
export function branchClass(branch) {
  if (branch === 'main' || branch === 'develop') return 'trunk';
  if (/^dependabot\//.test(branch)) return 'dependabot';
  return 'feature';
}

export function summarise(rows) {
  const byCause = {};
  const byBranchClass = {};
  for (const r of rows) {
    if (r.cause.id === 'GATE_DERIVED') continue;
    byCause[r.cause.id] = (byCause[r.cause.id] ?? 0) + 1;
    byBranchClass[r.branchClass] = (byBranchClass[r.branchClass] ?? 0) + 1;
  }
  return { byCause, byBranchClass };
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

function runsFor(limit) {
  return JSON.parse(gh(['run', 'list', '--workflow', 'ci.yml', '--limit', String(limit), '--json', 'databaseId,conclusion,headBranch,headSha,event,createdAt']));
}

function failedJobs(runId) {
  const j = JSON.parse(gh(['run', 'view', String(runId), '--json', 'jobs']));
  return j.jobs.filter((x) => x.conclusion === 'failure').map((x) => ({ job: x.name, step: (x.steps ?? []).find((s) => s.conclusion === 'failure')?.name }));
}

function failedLog(runId) {
  try {
    return gh(['run', 'view', String(runId), '--log-failed']);
  } catch (e) {
    return String(e.message ?? '');
  }
}

function logFor(log, job) {
  // `gh --log-failed` prefixes each line with "<job>\t<step>\t…"
  return log.split('\n').filter((l) => l.startsWith(job + '\t')).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
}

export function analyse(run, withLogs = true) {
  const jobs = failedJobs(run.databaseId);
  const log = withLogs ? failedLog(run.databaseId) : '';
  return jobs.map((j) => {
    const text = logFor(log, j.job);
    return { runId: run.databaseId, sha: run.headSha, branch: run.headBranch, branchClass: branchClass(run.headBranch), createdAt: run.createdAt, ...j, log: text, cause: classify({ ...j, log: text }) };
  });
}

function markdown(rows, title) {
  const real = rows.filter((r) => r.cause.id !== 'GATE_DERIVED');
  const out = [`## ${title}`, ''];
  if (!real.length) out.push('No failing jobs.');
  for (const r of real) out.push(`- **${r.job}** › ${r.step ?? 'n/a'} — \`${r.cause.id}\` (owner: ${r.cause.owner}${r.cause.retryable ? ', transient-eligible' : ''})\n  - ${r.cause.fix}`);
  out.push('', '_Generated by scripts/ci-doctor.mjs. Classification is evidence for a human; it does not rerun, retry or alter any gate._');
  return out.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const outDir = opt('--out');
  if (opt('--run')) {
    const rows = analyse({ databaseId: opt('--run'), headBranch: opt('--branch') ?? '', headSha: '' });
    console.log(argv.includes('--summary') ? markdown(rows, `CI failure diagnosis — run ${opt('--run')}`) : JSON.stringify(rows.map(({ log, ...r }) => r), null, 2));
    if (outDir) saveEvidence(outDir, rows);
    return;
  }
  const runs = runsFor(Number(opt('--limit') ?? 30)).filter((r) => r.conclusion === 'failure');
  const all = runs.flatMap((r) => analyse(r));
  const total = runsFor(Number(opt('--limit') ?? 30)).length;
  console.log(`Failed runs: ${runs.length}/${total}`);
  console.log(JSON.stringify(summarise(all), null, 2));
  if (outDir) saveEvidence(outDir, all);
}

function saveEvidence(dir, rows) {
  fs.mkdirSync(dir, { recursive: true });
  for (const r of rows) {
    const file = path.join(dir, `${r.runId}-${r.job.replace(/[^\w]+/g, '_')}.json`);
    if (fs.existsSync(file)) continue; // first failure wins: never overwrite
    const excerpt = r.log.slice(-6000);
    fs.writeFileSync(file, JSON.stringify({ ...r, log: undefined, excerpt, sha256: crypto.createHash('sha256').update(excerpt).digest('hex') }, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
