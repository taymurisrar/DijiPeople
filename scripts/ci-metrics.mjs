#!/usr/bin/env node
/**
 * Rolling CI metrics and regression detection.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 2026-08-18 the framework read exactly one bit out of CI: did the
 * `CI required gate` pass. Nothing read a duration, a queue time, a cancellation
 * or a critical path. So four things could go wrong indefinitely without any
 * agent noticing, and all four had:
 *
 *   - the database e2e step went from 1m28s to 36 minutes unbounded (e9cad20);
 *   - every integrated SHA ran the whole pipeline twice, because ref-push
 *     integration reproduces the agent/* SHA on develop;
 *   - three consecutive develop runs reported `cancelled` while their gate had
 *     actually passed;
 *   - `build` sat behind `typecheck` on the critical path for no artifact.
 *
 * A human noticed from the GitHub UI. That is the failure this closes.
 *
 * DELIBERATELY SMALL. This is a generated record, not an observability system.
 * It writes one Markdown table and one baseline JSON, and it is NOT a CI gate —
 * metrics change on every run, so a `--check` in the pipeline would fail
 * constantly and teach everyone to ignore it. Release/DevOps runs it.
 *
 * WHAT IT DOES NOT MEASURE, AND WILL NOT PRETEND TO
 * -------------------------------------------------
 * Cache hit rate is not in the Actions REST API — it is only in raw step logs.
 * Rather than infer it from step durations and call the guess a metric, this
 * reports it as NOT_OBSERVABLE. See ITEM-0056.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

import {
  ghJson,
  jobsForRun,
  loadRequiredJobNames,
  classifyRun,
} from './ci-evidence.mjs';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const METRICS_DIR = join(REPO_ROOT, 'docs', 'ci', 'metrics');
const BASELINE_PATH = join(METRICS_DIR, 'baseline.json');
const REPORT_PATH = join(METRICS_DIR, 'ci-metrics.md');

/* ------------------------------------------------------------------ *
 * Regression thresholds — the policy, in one place
 * ------------------------------------------------------------------ */

const THRESHOLDS = {
  // A job whose median grew by more than this AND by more than the absolute
  // floor below. Both, so a 12s job doubling to 25s does not raise an alarm.
  jobDurationIncreaseRatio: 1.3,
  jobDurationIncreaseFloorSeconds: 60,
  // Queue time is a runner-availability signal, not a repository one. It is
  // reported so an external cause can be distinguished from our own changes.
  queueMedianSeconds: 60,
  // Unexpected cancellations only — a superseded agent/* run whose gate had not
  // finished is the concurrency policy working, not a problem.
  unexpectedCancellationRate: 0.2,
  // More than one FULL (non-reused) run for the same SHA.
  duplicateFullRunsPerSha: 1,
  // A STEP inside a job, under the same ratio-and-floor rule. Tracked
  // separately because a job median can absorb a step blowing up and hide it:
  // `Install the browser` went 27s -> 6m41s -> 25m55s while `Browser e2e`
  // stayed inside its 30-minute cap, so no job-level trigger ever fired and the
  // regression was found by a person reading the GitHub UI. The floor is lower
  // than the job floor because a step is a smaller unit.
  stepDurationIncreaseRatio: 1.5,
  stepDurationIncreaseFloorSeconds: 45,
  // A job that consumed essentially its whole declared `timeout-minutes` did
  // not get cancelled by a superseding push — it ran out of time. Those two
  // outcomes are both reported as `cancelled` by the API and mean opposite
  // things, and conflating them is how three consecutive 30-minute database
  // e2e timeouts read as ordinary supersede-cancels.
  timeoutConsumedRatio: 0.95,
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const seconds = (from, to) =>
  from && to ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000)) : null;

/**
 * The `timeout-minutes` each job declares, read from the workflow itself.
 *
 * The Actions API does not report a job's timeout, and a job that hit its cap
 * is indistinguishable from one a superseding push killed — both are
 * `cancelled`. Reading the declared cap is what lets the two be told apart, and
 * reading it from `ci.yml` rather than hardcoding it means raising a timeout
 * cannot silently disable the detection.
 *
 * A deliberately small scan, not a YAML parser: job blocks are two-space
 * indented, their `name:` and `timeout-minutes:` four-space, and this file is
 * ours. If the shape ever changes this returns null and the check goes quiet
 * rather than reporting something invented.
 */
let timeoutsByJobName = null;
function timeoutSeconds(jobName) {
  if (timeoutsByJobName === null) {
    timeoutsByJobName = new Map();
    try {
      const workflow = readFileSync(
        join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
        'utf8',
      );
      let displayName = null;
      let timeout = null;
      for (const line of workflow.split(/\r?\n/)) {
        if (/^  [A-Za-z0-9_-]+:\s*$/.test(line)) {
          // A new job block: whatever the previous one collected is complete.
          if (displayName && timeout !== null) timeoutsByJobName.set(displayName, timeout);
          displayName = null;
          timeout = null;
          continue;
        }
        const named = /^    name:\s*(.+?)\s*$/.exec(line);
        if (named) displayName = named[1].replace(/^['"]|['"]$/g, '');
        const capped = /^    timeout-minutes:\s*(\d+)\s*$/.exec(line);
        if (capped) timeout = Number(capped[1]) * 60;
      }
      if (displayName && timeout !== null) timeoutsByJobName.set(displayName, timeout);
    } catch {
      // Unreadable workflow: no timeout detection, and no guesses.
    }
  }
  return timeoutsByJobName.get(jobName) ?? null;
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

const fmt = (s) =>
  s === null || s === undefined ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;

/* ------------------------------------------------------------------ *
 * Collection
 * ------------------------------------------------------------------ */

/**
 * A run is FULL when it actually executed its required jobs. A run that reused
 * exact-SHA evidence has them `skipped`, and must not be counted as duplicate
 * work — skipping is the fix, not the problem.
 */
function isFullRun(jobs, requiredNames) {
  return jobs.some(
    (job) => requiredNames.includes(job.name) && job.conclusion !== 'skipped',
  );
}

/**
 * Counts SHAs that ran the full pipeline more than once, across every branch.
 *
 * Two API passes on purpose: one cheap listing to find SHAs that appear more
 * than once at all, then a jobs lookup for only those. Fetching jobs for every
 * run in the window would be dozens of calls to answer a question most SHAs
 * settle in one.
 */
function countDuplicateFullRuns(repo, requiredNames, limit) {
  const runs =
    ghJson(`repos/${repo}/actions/workflows/ci.yml/runs?per_page=${Math.min(limit, 100)}`)
      .workflow_runs ?? [];

  const candidates = new Map();
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    if (!candidates.has(run.head_sha)) candidates.set(run.head_sha, []);
    candidates.get(run.head_sha).push(run);
  }

  const duplicates = [];
  for (const [sha, group] of candidates) {
    if (group.length <= 1) continue;
    const full = group.filter((run) => isFullRun(jobsForRun(repo, run.id), requiredNames));
    if (full.length > THRESHOLDS.duplicateFullRunsPerSha) {
      duplicates.push([sha, full.length, full.map((r) => r.head_branch)]);
    }
  }
  return duplicates;
}

function collect(repo, branch, limit) {
  const requiredNames = loadRequiredJobNames();
  const runs =
    ghJson(
      `repos/${repo}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(
        branch,
      )}&per_page=${limit}`,
    ).workflow_runs ?? [];

  const completed = runs.filter((run) => run.status === 'completed');
  const jobStats = new Map();
  const stepStats = new Map();
  const timedOut = [];
  const classes = new Map();
  const runRecords = [];

  // Successor lookup is purely positional within this window: runs are returned
  // newest first, so the run created immediately after this one on the same
  // branch is its superseder if one exists.
  const ordered = [...completed].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );

  for (let i = 0; i < ordered.length; i += 1) {
    const run = ordered[i];
    const successor = ordered[i + 1] ?? null;
    const jobs = jobsForRun(repo, run.id);
    const { klass, verdict } = classifyRun({ run, jobs, requiredNames, successor });

    classes.set(klass, (classes.get(klass) ?? 0) + 1);

    const isFull = isFullRun(jobs, requiredNames);

    const total = seconds(run.run_started_at ?? run.created_at, run.updated_at);
    runRecords.push({
      id: run.id,
      sha: run.head_sha.slice(0, 8),
      klass,
      total,
      isFull,
      evidence: verdict.ok,
    });

    for (const job of jobs) {
      if (job.conclusion === 'skipped') continue;
      if (!jobStats.has(job.name)) {
        jobStats.set(job.name, { durations: [], queues: [], outcomes: [] });
      }
      const stat = jobStats.get(job.name);
      const duration = seconds(job.started_at, job.completed_at);
      const queue = seconds(job.created_at, job.started_at);
      if (duration !== null) stat.durations.push(duration);
      if (queue !== null) stat.queues.push(queue);
      stat.outcomes.push({ sha: run.head_sha, conclusion: job.conclusion });

      // Timeouts, told apart from supersede-cancellations. Both arrive as
      // `cancelled`; only one is a problem.
      const cap = timeoutSeconds(job.name);
      if (
        job.conclusion === 'cancelled' &&
        cap !== null &&
        duration !== null &&
        duration >= cap * THRESHOLDS.timeoutConsumedRatio
      ) {
        timedOut.push({ name: job.name, sha: run.head_sha.slice(0, 8), duration, cap });
      }

      // Steps. The API already returns them with the job, so this costs no
      // extra request — it is only a matter of not throwing them away.
      for (const step of job.steps ?? []) {
        const stepDuration = seconds(step.started_at, step.completed_at);
        if (stepDuration === null || step.conclusion === 'skipped') continue;
        const key = `${job.name} › ${step.name}`;
        if (!stepStats.has(key)) stepStats.set(key, []);
        stepStats.get(key).push(stepDuration);
      }
    }
  }

  const jobs = [...jobStats.entries()]
    .map(([name, stat]) => {
      const failures = stat.outcomes.filter((o) => o.conclusion === 'failure').length;
      const cancels = stat.outcomes.filter((o) => o.conclusion === 'cancelled').length;
      // Flaky = the same job both passed and failed on the SAME commit. Two
      // different commits disagreeing is a code change, not flakiness.
      const perSha = new Map();
      for (const o of stat.outcomes) {
        if (!perSha.has(o.sha)) perSha.set(o.sha, new Set());
        perSha.get(o.sha).add(o.conclusion);
      }
      const flaky = [...perSha.values()].some(
        (set) => set.has('success') && (set.has('failure') || set.has('timed_out')),
      );
      return {
        name,
        runs: stat.outcomes.length,
        median: quantile(stat.durations, 0.5),
        p95: quantile(stat.durations, 0.95),
        queueMedian: quantile(stat.queues, 0.5),
        failureRate: stat.outcomes.length ? failures / stat.outcomes.length : 0,
        cancelRate: stat.outcomes.length ? cancels / stat.outcomes.length : 0,
        flaky,
      };
    })
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));

  const totals = runRecords.map((r) => r.total).filter((t) => t !== null);

  // Duplication is a CROSS-BRANCH property and is invisible from one branch.
  // The pattern this exists to catch is ref-push integration: agent/<task> and
  // develop end up pointing at the SAME SHA, so GitHub fires two complete
  // pipelines for one tree. Counting runs per SHA within `develop` alone would
  // report zero every time, which is exactly how this went unnoticed.
  const duplicateShas = countDuplicateFullRuns(repo, requiredNames, limit * 2);
  const unexpected =
    (classes.get('CANCELLED_MANUAL_OR_TIMEOUT') ?? 0) +
    (classes.get('SUPERSEDED_GATE_INCOMPLETE') ?? 0);

  return {
    branch,
    repo,
    window: runRecords.length,
    generatedFromRun: runRecords.at(-1)?.id ?? null,
    runMedian: quantile(totals, 0.5),
    runP95: quantile(totals, 0.95),
    classes: Object.fromEntries(classes),
    unexpectedCancellationRate: runRecords.length ? unexpected / runRecords.length : 0,
    duplicateFullRunShas: duplicateShas.length,
    // Median only. A step baseline is for comparison, not for a report table —
    // there are ~150 of them and printing them all would bury the jobs.
    steps: Object.fromEntries(
      [...stepStats.entries()].map(([name, durations]) => [
        name,
        quantile(durations, 0.5),
      ]),
    ),
    timedOut,
    duplicateShaSamples: duplicateShas
      .slice(0, 5)
      .map(([sha, n, branches]) => `${sha.slice(0, 8)}×${n} (${[...new Set(branches)].join(' + ')})`),
    jobs,
    runs: runRecords,
  };
}

/* ------------------------------------------------------------------ *
 * Regression detection
 * ------------------------------------------------------------------ */

function detectRegressions(current, baseline) {
  const triggers = [];

  if (baseline) {
    const previous = new Map((baseline.jobs ?? []).map((job) => [job.name, job]));
    for (const job of current.jobs) {
      const before = previous.get(job.name);
      if (!before || before.median === null || job.median === null) continue;
      const grew = job.median - before.median;
      if (
        job.median > before.median * THRESHOLDS.jobDurationIncreaseRatio &&
        grew > THRESHOLDS.jobDurationIncreaseFloorSeconds
      ) {
        triggers.push({
          type: 'JOB_DURATION_REGRESSION',
          detail: `${job.name}: median ${fmt(before.median)} → ${fmt(job.median)} (+${fmt(grew)})`,
        });
      }
    }
  }

  for (const job of current.jobs) {
    if (job.flaky) {
      triggers.push({
        type: 'FLAKY_JOB',
        detail: `${job.name} both passed and failed on the same commit`,
      });
    }
    if (job.queueMedian !== null && job.queueMedian > THRESHOLDS.queueMedianSeconds) {
      triggers.push({
        type: 'QUEUE_REGRESSION',
        detail: `${job.name}: median queue ${fmt(job.queueMedian)} — runner availability, likely external`,
      });
    }
  }

  if (current.unexpectedCancellationRate > THRESHOLDS.unexpectedCancellationRate) {
    triggers.push({
      type: 'CANCELLATION_SPIKE',
      detail: `${Math.round(current.unexpectedCancellationRate * 100)}% of runs cancelled without a completed gate`,
    });
  }

  if (baseline?.steps) {
    for (const [name, median] of Object.entries(current.steps ?? {})) {
      const before = baseline.steps[name];
      if (before == null || median == null) continue;
      const grew = median - before;
      if (
        median > before * THRESHOLDS.stepDurationIncreaseRatio &&
        grew > THRESHOLDS.stepDurationIncreaseFloorSeconds
      ) {
        triggers.push({
          type: 'STEP_DURATION_REGRESSION',
          detail: `${name}: median ${fmt(before)} → ${fmt(median)} (+${fmt(grew)})`,
        });
      }
    }
  }

  for (const job of current.timedOut ?? []) {
    triggers.push({
      type: 'JOB_TIMEOUT',
      detail:
        `${job.name} ran ${fmt(job.duration)} against a ${fmt(job.cap)} cap at ${job.sha} — ` +
        'consumed its timeout rather than being superseded',
    });
  }

  if (current.duplicateFullRunShas > 0) {
    triggers.push({
      type: 'DUPLICATE_RUN_STORM',
      detail: `${current.duplicateFullRunShas} SHA(s) ran the full pipeline more than once: ${current.duplicateShaSamples.join(', ')}`,
    });
  }

  return triggers;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function render(current, triggers, baseline) {
  const lines = [];
  lines.push('# CI metrics');
  lines.push('');
  lines.push('> **Generated — do not edit by hand.**');
  lines.push('> `node scripts/ci-metrics.mjs collect --branch ' + current.branch + '`');
  lines.push('>');
  lines.push(
    `> Window: the last ${current.window} completed runs of \`.github/workflows/ci.yml\` on \`${current.branch}\`.`,
  );
  lines.push('');
  lines.push('## Run level');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Median total duration | ${fmt(current.runMedian)} |`);
  lines.push(`| p95 total duration | ${fmt(current.runP95)} |`);
  lines.push(
    `| Unexpected cancellation rate | ${Math.round(current.unexpectedCancellationRate * 100)}% |`,
  );
  lines.push(`| SHAs that ran the full pipeline more than once | ${current.duplicateFullRunShas} |`);
  lines.push('| Cache hit rate | NOT_OBSERVABLE — not exposed by the Actions REST API (ITEM-0056) |');
  lines.push('');
  lines.push('### Run outcome classes');
  lines.push('');
  lines.push('| Class | Count | Meaning |');
  lines.push('|---|---|---|');
  const meanings = {
    PASS: 'Every required job succeeded.',
    FAILED: 'A required job did not succeed.',
    SUPERSEDED_GATE_PASSED:
      'Cancelled by a newer push, but the gate had already passed. **Expected** — still valid evidence.',
    SUPERSEDED_GATE_INCOMPLETE:
      'Cancelled by a newer push before the gate finished. Expected on `agent/*`, unexpected on a shared branch.',
    CANCELLED_MANUAL_OR_TIMEOUT:
      'Cancelled with no superseding run — manual, a job timeout, or infrastructure. **Unexpected.**',
    RUNNING: 'Still in progress.',
  };
  for (const [klass, count] of Object.entries(current.classes)) {
    lines.push(`| \`${klass}\` | ${count} | ${meanings[klass] ?? ''} |`);
  }
  lines.push('');
  lines.push('## Job level');
  lines.push('');
  lines.push('Sorted by median duration — the top rows are where wall-clock actually goes.');
  lines.push('');
  lines.push('| Job | Runs | Median | p95 | Queue (median) | Failure rate | Flaky |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const job of current.jobs) {
    lines.push(
      `| ${job.name} | ${job.runs} | ${fmt(job.median)} | ${fmt(job.p95)} | ${fmt(job.queueMedian)} | ${Math.round(job.failureRate * 100)}% | ${job.flaky ? '⚠️ yes' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push('## Regression triggers');
  lines.push('');
  if (baseline) {
    lines.push(
      `Compared against the baseline captured from run ${baseline.generatedFromRun ?? 'unknown'}.`,
    );
  } else {
    lines.push('No previous baseline existed, so duration comparisons are not available yet.');
  }
  lines.push('');
  if (triggers.length === 0) {
    lines.push('None. No trigger in `scripts/ci-metrics.mjs` fired against this window.');
  } else {
    lines.push('| Trigger | Detail |');
    lines.push('|---|---|');
    for (const trigger of triggers) {
      lines.push(`| \`${trigger.type}\` | ${trigger.detail} |`);
    }
    lines.push('');
    lines.push(
      'Each firing trigger is the Architect\'s to triage, exactly like a QA finding: ' +
        '`FIX_NOW`, `PLAN_REQUIRED`, `DEFER`, `PRODUCT_DECISION`, `BLOCKED_EXTERNAL` or ' +
        '`ACCEPTED_RISK`. See [`.agent/context/ci-operations.md`](../../../.agent/context/ci-operations.md).',
    );
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'collect';
  const flag = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
  };
  const check = args.includes('--check');
  const repo = flag('repo', process.env.GITHUB_REPOSITORY ?? 'taymurisrar/DijiPeople');
  const branch = flag('branch', 'develop');
  const limit = Number(flag('limit', '30'));

  if (command !== 'collect') {
    console.log(
      'Usage: node scripts/ci-metrics.mjs collect [--repo owner/name] [--branch develop] [--limit 30] [--check]',
    );
    return 1;
  }

  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : null;

  console.log(`Collecting the last ${limit} CI runs on ${branch}…`);
  const current = collect(repo, branch, limit);
  const triggers = detectRegressions(current, baseline);

  console.log('');
  console.log(`RUNS_ANALYSED   ${current.window}`);
  console.log(`RUN_MEDIAN      ${fmt(current.runMedian)}`);
  console.log(`RUN_P95         ${fmt(current.runP95)}`);
  console.log(`CLASSES         ${JSON.stringify(current.classes)}`);
  console.log(`DUPLICATE_SHAS  ${current.duplicateFullRunShas}`);
  console.log('');
  console.log('SLOWEST JOBS BY MEDIAN');
  for (const job of current.jobs.slice(0, 5)) {
    console.log(`  ${job.name.padEnd(40)} ${fmt(job.median).padStart(8)}  p95 ${fmt(job.p95)}`);
  }
  console.log('');
  if (triggers.length === 0) {
    console.log('TRIGGERS        none');
  } else {
    console.log(`TRIGGERS        ${triggers.length}`);
    for (const trigger of triggers) console.log(`  ${trigger.type}: ${trigger.detail}`);
  }

  if (!check) {
    mkdirSync(METRICS_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, render(current, triggers, baseline));
    // The baseline stores only what the comparison needs. Keeping the full run
    // list out of it stops the file growing without bound.
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          branch: current.branch,
          window: current.window,
          generatedFromRun: current.generatedFromRun,
          runMedian: current.runMedian,
          runP95: current.runP95,
          jobs: current.jobs.map(({ name, median, p95, queueMedian }) => ({
            name,
            median,
            p95,
            queueMedian,
          })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log('');
    console.log(`Wrote ${REPORT_PATH}`);
    console.log(`Wrote ${BASELINE_PATH}`);
  }

  // Non-zero on a firing trigger so Release/DevOps can branch on it. This is
  // deliberately NOT wired into ci.yml — see the header.
  return triggers.length > 0 ? 1 : 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`ci-metrics: ${error.message}`);
  process.exit(2);
}
