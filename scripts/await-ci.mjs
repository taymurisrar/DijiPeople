#!/usr/bin/env node
/*
 * Block until the CI run for a commit reaches a terminal state, then report it.
 *
 * WHY THIS EXISTS.
 *
 * The task completion contract requires REMOTE_CI_STATUS to be a fact, and the
 * only way an agent had to obtain it was `gh run list` — a snapshot. So the
 * pattern was: push, check, see `in_progress`, tell the user "CI is running",
 * and then either forget or check again some arbitrary number of turns later.
 * The user's words for it were that the agent "is unable to listen [for the] CI
 * response when it has responded", and they were right twice in one session:
 * a run had been green for minutes while I was still reporting it as pending.
 *
 * A snapshot cannot notify. This blocks, so the caller can run it in the
 * background and be told the moment there is a verdict.
 *
 * WHAT IT REPORTS.
 *
 * Every terminal state, not just success. A watcher that only recognises
 * `success` is silent on failure, cancellation and timeout — and silence is
 * indistinguishable from "still running", which is the exact failure this
 * replaces.
 *
 * Exit codes:  0 the gate passed · 1 it did not · 2 usage or lookup failure
 *
 * Usage:
 *   node scripts/await-ci.mjs                    # the current HEAD
 *   node scripts/await-ci.mjs --sha <sha>
 *   node scripts/await-ci.mjs --timeout 1800     # seconds, default 2700
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/*
 * `gh` is not on PATH in this environment. Resolving it here rather than at
 * every call site is the difference between this script working from a fresh
 * worktree and failing with ENOENT that reads like the run does not exist.
 */
const GH_CANDIDATES = [
  'C:/Program Files/GitHub CLI/gh.exe',
  'C:/Program Files (x86)/GitHub CLI/gh.exe',
  '/usr/bin/gh',
  '/usr/local/bin/gh',
];

function resolveGh() {
  for (const candidate of GH_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return 'gh';
}

const GH = resolveGh();

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

const sha = arg('sha') ?? run('git', ['rev-parse', 'HEAD']);
const timeoutSeconds = Number(arg('timeout', '2700'));
const intervalSeconds = Number(arg('interval', '20'));

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function runsForSha() {
  try {
    const raw = run(GH, [
      'run',
      'list',
      '--limit',
      '30',
      '--json',
      'databaseId,headSha,status,conclusion,workflowName',
    ]);
    /*
     * Prefix match, because `--sha` is usually pasted from `git log --oneline`
     * or a commit message and is seven characters, while `headSha` is forty.
     * An equality test silently matches nothing and reports BLOCKED_TIMEOUT —
     * which reads as "CI is slow" rather than "you compared two different
     * strings", and cost the first run of this script forty-five seconds of
     * looking in the wrong place.
     */
    return JSON.parse(raw).filter(
      (entry) => entry.headSha === sha || entry.headSha.startsWith(sha),
    );
  } catch (error) {
    // A transient API failure must not end the wait. One bad poll is not a
    // verdict, and treating it as one is how a green run gets reported as lost.
    console.error(`  (poll failed, retrying) ${error.message.split('\n')[0]}`);
    return null;
  }
}

function jobsFor(databaseId) {
  try {
    const raw = run(GH, ['run', 'view', String(databaseId), '--json', 'jobs']);
    return JSON.parse(raw).jobs ?? [];
  } catch {
    return [];
  }
}

const started = Date.now();
console.log(`Awaiting CI for ${sha.slice(0, 7)} (timeout ${timeoutSeconds}s)`);

let announcedPending = false;

for (;;) {
  const runs = runsForSha();

  if (runs && runs.length === 0) {
    /*
     * No run yet. GitHub takes a few seconds to register a push, so an empty
     * result early is normal — but an empty result that never fills means the
     * commit was never pushed, and saying so beats waiting 45 minutes for it.
     */
    if ((Date.now() - started) / 1000 > 120) {
      console.error(
        `No CI run found for ${sha.slice(0, 7)} after two minutes. Was it pushed?`,
      );
      process.exit(2);
    }
    if (!announcedPending) {
      console.log('  no run registered yet…');
      announcedPending = true;
    }
  }

  if (runs && runs.length > 0) {
    const pending = runs.filter((entry) => entry.status !== 'completed');

    if (pending.length === 0) {
      const failed = runs.filter((entry) => entry.conclusion !== 'success');

      for (const entry of runs) {
        console.log(`${entry.conclusion.toUpperCase()}  ${entry.workflowName}  (${entry.databaseId})`);
      }

      if (failed.length === 0) {
        console.log(`REMOTE_CI_STATUS = PASS for ${sha.slice(0, 7)}`);
        process.exit(0);
      }

      /*
       * Name the jobs, not just the run. "CI failed" sends the reader to the
       * web UI; "Database e2e failed" sends them to the right log.
       */
      for (const entry of failed) {
        for (const job of jobsFor(entry.databaseId)) {
          if (job.conclusion && job.conclusion !== 'success') {
            console.log(`  x ${job.conclusion}  ${job.name}`);
          }
        }
      }
      console.log(`REMOTE_CI_STATUS = FAILED for ${sha.slice(0, 7)}`);
      process.exit(1);
    }
  }

  if ((Date.now() - started) / 1000 > timeoutSeconds) {
    console.log(`REMOTE_CI_STATUS = BLOCKED_TIMEOUT after ${timeoutSeconds}s`);
    process.exit(1);
  }

  await sleep(intervalSeconds);
}
