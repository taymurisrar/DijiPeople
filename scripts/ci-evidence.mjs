#!/usr/bin/env node
/**
 * CI evidence resolver.
 *
 * Answers two questions that this repository previously had no mechanical answer
 * for, and which cost it roughly half of its CI compute plus three misread run
 * conclusions on 2026-08-18:
 *
 *   find      Has THIS EXACT SHA already had every required job conclude
 *             success in an earlier run of this workflow?
 *   classify  What actually happened to a run — and specifically, is a run whose
 *             conclusion says `cancelled` still valid evidence?
 *
 * WHY JOB-LEVEL, NEVER RUN-LEVEL
 * ------------------------------
 * A run's own `conclusion` is not a trustworthy verdict here. Runs 32167466971,
 * 32169868091 and 32173772663 each concluded `cancelled` while their
 * `CI required gate` job had already succeeded — the only job killed was the
 * report-only database e2e job, which had been left unbounded and was still
 * running when the next push superseded the run. Reading the run conclusion
 * would have discarded three complete, valid results.
 *
 * The inverse matters more. `find` must never accept a run that was itself a
 * reuse, or evidence would chain off a SHA nothing ever validated. Requiring
 * every required job to individually report `success` rules that out: a reused
 * run's jobs are `skipped`, not `success`.
 *
 * The required job list is NOT duplicated here. It is derived from
 * `.github/workflows/ci.yml` — from `ci-required.needs` and each job's `name:`
 * — so adding a job to the gate automatically widens what counts as evidence.
 * A hardcoded copy would silently accept a SHA that never ran the new job.
 *
 * Zero dependencies on purpose: the `resolve` job sparse-checks out `scripts`
 * and `.github` and never runs `npm ci`, so `node_modules` does not exist there.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const GATE_JOB_ID = 'ci-required';

/* ------------------------------------------------------------------ *
 * gh
 * ------------------------------------------------------------------ */

// gh is preinstalled on GitHub-hosted runners and on PATH there. On Windows it
// frequently is not — it installs to Program Files and nothing adds it — so the
// known location is tried before giving up, which is what lets the Integrator
// run this locally.
const GH_CANDIDATES = [
  process.env.GH_PATH,
  'gh',
  'C:\\Program Files\\GitHub CLI\\gh.exe',
].filter(Boolean);

let ghBinary = null;

function gh(args) {
  if (!ghBinary) {
    for (const candidate of GH_CANDIDATES) {
      try {
        execFileSync(candidate, ['--version'], { stdio: 'ignore' });
        ghBinary = candidate;
        break;
      } catch {
        /* try the next one */
      }
    }
    if (!ghBinary) {
      throw new Error(
        'GitHub CLI not found. Tried: ' +
          GH_CANDIDATES.join(', ') +
          '. Set GH_PATH to its location.',
      );
    }
  }
  return execFileSync(ghBinary, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function ghJson(path) {
  return JSON.parse(gh(['api', '-H', 'Accept: application/vnd.github+json', path]));
}

/* ------------------------------------------------------------------ *
 * The required job set, read from the workflow itself
 * ------------------------------------------------------------------ */

/**
 * Extracts the top-level job ids under `jobs:` and their display `name:`.
 *
 * A real YAML parser is not available in the resolve job (no node_modules), so
 * this reads the two shapes it needs and throws rather than guessing. The
 * workflow uses two-space job ids and four-space keys throughout; anything else
 * is a structural change that should fail loudly here instead of silently
 * shrinking the evidence requirement.
 */
export function parseWorkflowJobs(source) {
  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex === -1) throw new Error('ci.yml: no top-level `jobs:` key');

  const jobs = new Map();
  let current = null;

  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\S/.test(line) && line.trim() !== '') break; // left the jobs: block

    const jobId = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobId) {
      current = jobId[1];
      jobs.set(current, { id: current, name: current, needs: [] });
      continue;
    }
    if (!current) continue;

    const name = line.match(/^ {4}name:\s*(.+?)\s*$/);
    if (name) {
      jobs.get(current).name = name[1].replace(/^['"]|['"]$/g, '');
      continue;
    }

    // needs: either inline `[a, b]`, or opened on this line and closed below.
    const needs = line.match(/^ {4}needs:\s*(.*)$/);
    if (needs) {
      let raw = needs[1];
      if (!raw.includes(']') || raw.trim() === '') {
        for (let j = i + 1; j < lines.length; j += 1) {
          raw += ' ' + lines[j];
          if (lines[j].includes(']')) break;
        }
      }
      jobs.get(current).needs = raw
        .replace(/[[\]]/g, ' ')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  if (jobs.size === 0) throw new Error('ci.yml: parsed zero jobs');
  return jobs;
}

/**
 * The display names of the jobs `ci-required` depends on, excluding the
 * evidence resolver itself — it is a precondition of the gate, not evidence
 * that the tree is sound.
 */
export function requiredJobNames(source) {
  const jobs = parseWorkflowJobs(source);
  const gate = jobs.get(GATE_JOB_ID);
  if (!gate) throw new Error(`ci.yml: no \`${GATE_JOB_ID}\` job`);
  if (gate.needs.length === 0) {
    throw new Error(`ci.yml: \`${GATE_JOB_ID}\` declares no \`needs\``);
  }

  const names = [];
  for (const id of gate.needs) {
    if (id === 'resolve') continue;
    const job = jobs.get(id);
    if (!job) throw new Error(`ci.yml: \`${GATE_JOB_ID}\` needs unknown job \`${id}\``);
    names.push(job.name);
  }
  if (names.length === 0) {
    throw new Error(`ci.yml: \`${GATE_JOB_ID}\` needs nothing but the resolver`);
  }
  return names;
}

export function loadRequiredJobNames() {
  if (!existsSync(WORKFLOW_PATH)) {
    throw new Error(`Workflow not found at ${WORKFLOW_PATH}`);
  }
  return requiredJobNames(readFileSync(WORKFLOW_PATH, 'utf8'));
}

/* ------------------------------------------------------------------ *
 * Run inspection
 * ------------------------------------------------------------------ */

export function jobsForRun(repo, runId) {
  const collected = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = ghJson(
      `repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}&filter=latest`,
    );
    collected.push(...(body.jobs ?? []));
    if (collected.length >= (body.total_count ?? collected.length)) break;
  }
  return collected;
}

/**
 * True only when every required job individually concluded `success`.
 *
 * `skipped` is deliberately NOT accepted. That is what stops evidence chaining:
 * a run that reused someone else's evidence has skipped jobs, and must never
 * become the source of a further reuse.
 */
export function evaluateRun(requiredNames, jobs) {
  const byName = new Map(jobs.map((job) => [job.name, job]));
  const missing = [];
  const notSuccess = [];

  for (const name of requiredNames) {
    const job = byName.get(name);
    if (!job) {
      missing.push(name);
      continue;
    }
    if (job.conclusion !== 'success') {
      notSuccess.push(`${name}=${job.conclusion ?? job.status}`);
    }
  }

  return { ok: missing.length === 0 && notSuccess.length === 0, missing, notSuccess };
}

/* ------------------------------------------------------------------ *
 * find
 * ------------------------------------------------------------------ */

function commandFind(options) {
  const { repo, sha, excludeRun, githubOutput } = options;
  const requiredNames = loadRequiredJobNames();

  const emit = (reuse, run, reason) => {
    const payload = {
      reuse: reuse ? 'true' : 'false',
      evidence_run_id: run ? String(run.id) : '',
      evidence_run_url: run ? run.html_url : '',
      evidence_reason: reason,
    };
    if (githubOutput && process.env.GITHUB_OUTPUT) {
      for (const [key, value] of Object.entries(payload)) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
    }
    console.log(`reuse=${payload.reuse}`);
    console.log(`evidence_run_id=${payload.evidence_run_id}`);
    console.log(`evidence_run_url=${payload.evidence_run_url}`);
    console.log(`reason: ${reason}`);
    return 0;
  };

  const body = ghJson(
    `repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`,
  );
  const candidates = (body.workflow_runs ?? [])
    .filter((run) => String(run.id) !== String(excludeRun ?? ''))
    .filter((run) => run.path === '.github/workflows/ci.yml')
    .filter((run) => run.status === 'completed')
    .filter((run) => run.head_sha === sha)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (candidates.length === 0) {
    return emit(false, null, `no completed CI run found for ${sha.slice(0, 8)}`);
  }

  for (const run of candidates) {
    const verdict = evaluateRun(requiredNames, jobsForRun(repo, run.id));
    if (verdict.ok) {
      return emit(
        true,
        run,
        `run ${run.id} (${run.head_branch}) shows all ${requiredNames.length} required jobs green on this exact SHA`,
      );
    }
    console.log(
      `  run ${run.id}: not evidence — ` +
        [
          verdict.missing.length ? `missing ${verdict.missing.join(', ')}` : '',
          verdict.notSuccess.length ? `not green ${verdict.notSuccess.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('; '),
    );
  }

  return emit(
    false,
    null,
    `${candidates.length} completed run(s) on this SHA, none with every required job green`,
  );
}

/* ------------------------------------------------------------------ *
 * classify
 * ------------------------------------------------------------------ */

const CLASSES = {
  PASS: 'Every required job succeeded. This run is valid evidence.',
  FAILED: 'A required job did not succeed.',
  RUNNING: 'Still in progress.',
  SUPERSEDED_GATE_PASSED:
    'The run was cancelled by a newer push, but every required job had ALREADY ' +
    'succeeded. Valid evidence — the cancellation only killed non-gating work.',
  SUPERSEDED_GATE_INCOMPLETE:
    'The run was cancelled by a newer push before the required gate completed. ' +
    'NOT evidence. Follow the superseding run.',
  CANCELLED_MANUAL_OR_TIMEOUT:
    'Cancelled with no superseding run on this ref. Manual cancellation, a job ' +
    'timeout, or an infrastructure event. NOT evidence.',
};

/**
 * Pure classification, so `classify` and `ci-metrics.mjs` cannot drift apart.
 *
 * `successor` is the next run on the same ref, or null. It is what separates a
 * supersede from a manual cancellation or a job timeout — the two look identical
 * on the run object itself.
 */
export function classifyRun({ run, jobs, requiredNames, successor }) {
  const verdict = evaluateRun(requiredNames, jobs);
  let klass;
  if (run.status !== 'completed') klass = 'RUNNING';
  else if (run.conclusion === 'cancelled') {
    if (verdict.ok) klass = 'SUPERSEDED_GATE_PASSED';
    else if (successor) klass = 'SUPERSEDED_GATE_INCOMPLETE';
    else klass = 'CANCELLED_MANUAL_OR_TIMEOUT';
  } else klass = verdict.ok ? 'PASS' : 'FAILED';
  return { klass, verdict };
}

export function findSuccessor(repo, run) {
  const siblings =
    ghJson(
      `repos/${repo}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(
        run.head_branch,
      )}&per_page=50`,
    ).workflow_runs ?? [];
  return (
    siblings
      .filter((s) => s.id !== run.id && new Date(s.created_at) > new Date(run.created_at))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0] ?? null
  );
}

function commandClassify(options) {
  const { repo, runId } = options;
  const requiredNames = loadRequiredJobNames();
  const run = ghJson(`repos/${repo}/actions/runs/${runId}`);
  const jobs = jobsForRun(repo, runId);

  const successor = run.conclusion === 'cancelled' ? findSuccessor(repo, run) : null;
  const { klass, verdict } = classifyRun({ run, jobs, requiredNames, successor });

  const cancelledJobs = jobs
    .filter((job) => job.conclusion === 'cancelled')
    .map((job) => job.name);

  console.log(`RUN            ${run.id}`);
  console.log(`SHA            ${run.head_sha}`);
  console.log(`BRANCH         ${run.head_branch}`);
  console.log(`EVENT          ${run.event}`);
  console.log(`RUN_CONCLUSION ${run.conclusion ?? run.status}`);
  console.log(`CLASS          ${klass}`);
  console.log(`IS_EVIDENCE    ${verdict.ok ? 'YES' : 'NO'}`);
  if (cancelledJobs.length) console.log(`CANCELLED_JOBS ${cancelledJobs.join(', ')}`);
  if (verdict.notSuccess.length) console.log(`NOT_GREEN      ${verdict.notSuccess.join(', ')}`);
  if (verdict.missing.length) console.log(`MISSING        ${verdict.missing.join(', ')}`);
  if (successor) console.log(`SUPERSEDED_BY  ${successor.id} (${successor.head_sha.slice(0, 8)})`);
  console.log(`MEANING        ${CLASSES[klass]}`);

  // Exit non-zero when the run is not usable evidence, so a shell can branch on
  // it without parsing. RUNNING is 2 so "not yet" is distinguishable from "no".
  if (klass === 'RUNNING') return 2;
  return verdict.ok ? 0 : 1;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

const USAGE = `Usage:
  node scripts/ci-evidence.mjs find     --repo <owner/name> --sha <sha> [--exclude-run <id>] [--github-output]
  node scripts/ci-evidence.mjs classify --repo <owner/name> --run <run-id>

find      exit 0 always; reads reuse=true|false from stdout or $GITHUB_OUTPUT
classify  exit 0 = valid evidence, 1 = not evidence, 2 = still running`;

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const repo = options.repo || process.env.GITHUB_REPOSITORY;

  if (!command || options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!repo) {
    console.error('--repo <owner/name> is required (or set GITHUB_REPOSITORY).');
    return 1;
  }

  if (command === 'find') {
    if (!options.sha) {
      console.error('--sha <sha> is required.');
      return 1;
    }
    return commandFind({
      repo,
      sha: options.sha,
      excludeRun: options.excludeRun,
      githubOutput: Boolean(options.githubOutput),
    });
  }

  if (command === 'classify') {
    if (!options.run) {
      console.error('--run <run-id> is required.');
      return 1;
    }
    return commandClassify({ repo, runId: options.run });
  }

  console.error(`Unknown command \`${command}\`.\n\n${USAGE}`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('ci-evidence.mjs')) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`ci-evidence: ${error.message}`);
    process.exit(1);
  }
}
