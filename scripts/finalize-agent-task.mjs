#!/usr/bin/env node
/*
 * Reports the Git and documentation state a task's finalization decisions
 * depend on, and emits the `## Task Finalization` block required by
 * docs/development/final-report-template.md.
 *
 * It exists because the framework's worst failure so far was not a wrong
 * decision — it was a task that never asked the question. Implementation
 * finished, the report read as complete, and a new API module, a migration and
 * ten deleted components sat uncommitted in a working tree. Every fact needed
 * to notice that was one `git` call away.
 *
 * Deliberately NOT in this script:
 *   - merging, pushing, deleting branches, removing worktrees
 *   - any conflict resolution
 *   - any judgement about whether knowledge is "durable"
 *
 * Those are the Integrator's decisions (.agent/agents/integrator.md). A script
 * that merges on a green checklist is a script that merges on a wrong
 * checklist. This one reports; the Integrator acts.
 *
 * The single exception is Obsidian sync, which is mechanical, idempotent and
 * explicitly automated by the completion contract.
 *
 *   node scripts/finalize-agent-task.mjs [options]
 *
 *     --task-branch <name>   default: current branch
 *     --target <name>        default: main
 *     --base <sha>           default: merge-base(task, target)
 *     --no-sync              do not run Obsidian sync
 *     --json                 machine-readable output instead of the report block
 *
 * Exit codes: 0 all resolved · 1 something unresolved · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveObsidianConfig } from './lib/obsidian-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`${name} requires a value`);
    process.exit(2);
  }
  return value;
}

const VALUE_FLAGS = ['--task-branch', '--target', '--base', '--ci-status', '--ci-sha'];
const BOOLEAN_FLAGS = ['--no-sync', '--json'];

const NO_SYNC = argv.includes('--no-sync');
const AS_JSON = argv.includes('--json');

// Walk the argv rather than scanning it, so a value is never mistaken for a
// flag and an unknown flag is never silently ignored.
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (VALUE_FLAGS.includes(arg)) {
    i += 1; // skip the value; flagValue() already validated it exists
  } else if (!BOOLEAN_FLAGS.includes(arg)) {
    console.error(`unknown option: ${arg}`);
    process.exit(2);
  }
}

// ----------------------------------------------------------------- git helpers

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function shaOf(ref) {
  return git(['rev-parse', '--verify', '--quiet', ref], { allowFailure: true });
}

function short(sha) {
  return sha ? sha.slice(0, 7) : null;
}

/** Is `ancestor` fully contained in `descendant`? */
function isMerged(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------- gathering

const TASK_BRANCH = flagValue('--task-branch') ?? git(['rev-parse', '--abbrev-ref', 'HEAD']);
const TARGET_BRANCH = flagValue('--target') ?? 'main';

const report = {};
const unresolved = [];

function unresolvedIf(condition, field, detail) {
  if (condition) unresolved.push(`${field} — ${detail}`);
}

// --- working tree

const porcelain = git(['status', '--porcelain']);
const dirtyPaths = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
report.WORKING_TREE = dirtyPaths.length === 0 ? 'CLEAN' : `DIRTY (${dirtyPaths.length} paths)`;
report.UNCOMMITTED_PATHS = dirtyPaths.slice(0, 20);

/*
 * A dirty tree at finalization is the exact signature of the failure this
 * framework was hardened against, so it is unresolved rather than a warning.
 */
unresolvedIf(
  dirtyPaths.length > 0,
  'WORKING_TREE',
  `${dirtyPaths.length} uncommitted path(s) — task output may be unsaved`,
);

// --- SHAs

const taskSha = shaOf(TASK_BRANCH);
const targetSha = shaOf(TARGET_BRANCH);
const baseSha =
  flagValue('--base') ??
  (taskSha && targetSha ? git(['merge-base', TASK_BRANCH, TARGET_BRANCH], { allowFailure: true }) : null);

report.TASK_BRANCH = TASK_BRANCH;
report.TARGET_BRANCH = TARGET_BRANCH;
report.BASE_SHA = short(baseSha);
report.FINAL_TASK_SHA = short(taskSha);
report.FINAL_TARGET_SHA = short(targetSha);

if (!taskSha) unresolved.push(`TASK_BRANCH — "${TASK_BRANCH}" does not resolve`);
if (!targetSha) unresolved.push(`TARGET_BRANCH — "${TARGET_BRANCH}" does not resolve`);

// --- merge state

const merged = isMerged(taskSha, targetSha);
const isSameRef = taskSha && taskSha === targetSha;
report.MERGE_STATUS = isSameRef
  ? 'NOT_REQUIRED — task branch and target are the same commit'
  : merged
    ? 'DONE'
    : 'UNMERGED';

if (!merged && !isSameRef) {
  const ahead = git(['rev-list', '--count', `${TARGET_BRANCH}..${TASK_BRANCH}`], {
    allowFailure: true,
  });
  unresolved.push(
    `MERGE_STATUS — ${TASK_BRANCH} has ${ahead ?? '?'} commit(s) not in ${TARGET_BRANCH}`,
  );
}

// --- remote

const remotes = git(['remote'], { allowFailure: true });
const hasRemote = Boolean(remotes);
report.REMOTE = hasRemote ? remotes.split(/\r?\n/)[0] : 'NONE';

if (!hasRemote) {
  /*
   * The only legitimate route to local-only completion. A remote that exists
   * but was never pushed to is a framework failure, not a local-only task.
   */
  report.REMOTE_PUSH = 'NOT_REQUIRED — no remote configured (local-only repository)';
} else {
  const remote = report.REMOTE;
  const remoteTask = shaOf(`${remote}/${TASK_BRANCH}`);
  const remoteTarget = shaOf(`${remote}/${TARGET_BRANCH}`);

  report.REMOTE_TASK_SHA = short(remoteTask);
  report.REMOTE_TARGET_SHA = short(remoteTarget);

  // Verified by comparing refs, never by trusting push output.
  const taskPushed = Boolean(remoteTask) && remoteTask === taskSha;
  const targetPushed = Boolean(remoteTarget) && remoteTarget === targetSha;

  report.REMOTE_PUSH = [
    `task=${taskPushed ? 'VERIFIED' : remoteTask ? 'STALE' : 'ABSENT'}`,
    `target=${targetPushed ? 'VERIFIED' : remoteTarget ? 'STALE' : 'ABSENT'}`,
  ].join(' ');

  unresolvedIf(!taskPushed, 'REMOTE_PUSH', `${remote}/${TASK_BRANCH} does not match the local SHA`);
  unresolvedIf(
    !targetPushed,
    'REMOTE_PUSH',
    `${remote}/${TARGET_BRANCH} does not match the local SHA`,
  );

  report.REMOTE_NOTE =
    'local ref comparison only — this script never runs fetch, so refresh with `git fetch` first';
}

// --- CI observability

const ciConfigured = existsSync(join(ROOT, '.github/workflows/ci.yml'));
let ghAvailable = false;
try {
  execFileSync('gh', ['--version'], { stdio: 'ignore' });
  ghAvailable = true;
} catch {
  ghAvailable = false;
}

/*
 * Two different questions, deliberately kept apart:
 *   - can a verdict be read from here?      (detected)
 *   - what did the verdict say?             (supplied via --ci-status)
 *
 * The script can answer the first and never the second. Only the Integrator,
 * having actually read the `CI required gate` check, supplies the verdict — and
 * for PASS it must also name the SHA it read, which is verified against the
 * branch head. A pass on an earlier commit is a pass about different code.
 */
const CI_VALUES = [
  'PASS',
  'FAILED',
  'PENDING',
  'UNKNOWN',
  'BLOCKED_BY_ACCESS',
  'UNAVAILABLE',
  'NOT_REQUIRED',
];

const suppliedCi = flagValue('--ci-status');
if (suppliedCi && !CI_VALUES.includes(suppliedCi)) {
  console.error(`--ci-status must be one of: ${CI_VALUES.join(', ')}`);
  if (/ASSUMED/i.test(suppliedCi)) {
    console.error('ASSUMED_PASS is not a value. An unread verdict is BLOCKED_BY_ACCESS.');
  }
  process.exit(2);
}

const detectedCi = !ciConfigured || !hasRemote
  ? 'UNAVAILABLE'
  : ghAvailable
    ? 'OBSERVABLE'
    : 'BLOCKED_BY_ACCESS';

let ciState = suppliedCi ?? detectedCi;
let ciNote = suppliedCi ? 'supplied by the Integrator' : 'detected';

// A supplied PASS is only meaningful for the SHA actually being merged.
if (suppliedCi === 'PASS') {
  const ciSha = flagValue('--ci-sha');
  if (!ciSha) {
    console.error('--ci-status PASS requires --ci-sha <sha> — the commit whose check was read');
    process.exit(2);
  }
  const resolved = shaOf(ciSha);
  if (!resolved || resolved !== taskSha) {
    ciState = 'UNKNOWN';
    ciNote = `PASS rejected — --ci-sha ${ciSha} does not resolve to the task branch head ${short(taskSha)}`;
  }
}

report.REMOTE_CI = {
  UNAVAILABLE: ciConfigured ? 'UNAVAILABLE — no remote' : 'UNAVAILABLE — no .github/workflows/ci.yml',
  OBSERVABLE: 'OBSERVABLE — a verdict can be read, but none was supplied (--ci-status)',
  BLOCKED_BY_ACCESS: 'BLOCKED_BY_ACCESS — no `gh` CLI; a verdict cannot be read from here',
  PASS: `PASS — ${ciNote}`,
  FAILED: `FAILED — ${ciNote}`,
  PENDING: `PENDING — ${ciNote}`,
  UNKNOWN: `UNKNOWN — ${ciNote}`,
  NOT_REQUIRED: `NOT_REQUIRED — ${ciNote}`,
}[ciState];

// ----------------------------------------------------- shared-target CI gate

/*
 * A task merged and pushed `main` while its CI verdict was unreadable. Local
 * gates were green and nothing broke, but the merge was authorised by
 * inference — on a branch other people pull from.
 *
 * Unknown branch names default to SHARED. Wrongly treating a private branch as
 * shared costs one blocked merge; the reverse puts unverified code on a branch
 * a team builds from.
 */
const PRIVATE_BRANCH = /^(agent|chore)\//;
const EXPLICITLY_SHARED = /^(main|master|develop|production|staging|release\/)/;

const sharedTarget = EXPLICITLY_SHARED.test(TARGET_BRANCH) || !PRIVATE_BRANCH.test(TARGET_BRANCH);
report.SHARED_TARGET = sharedTarget;

if (ciState === 'UNAVAILABLE') {
  report.MERGE_AUTHORIZATION = 'LOCAL_POLICY — no remote CI configured; local gates govern';
} else if (!sharedTarget) {
  report.MERGE_AUTHORIZATION = `LOCAL_POLICY — ${TARGET_BRANCH} is not a shared target; still record the CI status honestly`;
} else if (ciState === 'PASS') {
  report.MERGE_AUTHORIZATION = `AUTHORIZED — verified CI PASS on ${short(taskSha)} for shared target ${TARGET_BRANCH}`;
} else {
  /*
   * Everything that is not a verified PASS lands here: FAILED, PENDING,
   * UNKNOWN, BLOCKED_BY_ACCESS, and the OBSERVABLE-but-unsupplied case. One
   * branch, so no future value can quietly acquire permission by omission.
   */
  report.MERGE_AUTHORIZATION = `BLOCKED_CI_UNVERIFIED — ${TARGET_BRANCH} is shared and CI is ${ciState}. Push the task branch; do NOT merge or push the target`;
  unresolved.push(
    `MERGE_AUTHORIZATION — ${TARGET_BRANCH} is a shared target and CI is ${ciState}, not PASS; merge is not authorised`,
  );
}

// --- QA, knowledge, Obsidian

function countFiles(relativeDir, filter = () => true) {
  const listing = git(['ls-files', relativeDir], { allowFailure: true });
  if (!listing) return 0;
  return listing.split(/\r?\n/).filter(Boolean).filter(filter).length;
}

const qaRuns = countFiles('docs/qa/runs', (f) => !f.endsWith('README.md'));
const knowledgeRecords = countFiles('docs/knowledge/implementations', (f) => !f.endsWith('README.md'));

report.QA_RUNS_TRACKED = qaRuns;
report.KNOWLEDGE_RECORDS_TRACKED = knowledgeRecords;
report.QA_REPORT =
  qaRuns > 0
    ? 'present — confirm one exists for THIS task'
    : 'NONE TRACKED — required if this task touched DB, API, roles, migrations, UI or negative paths';
report.KNOWLEDGE_CAPTURE =
  knowledgeRecords > 0
    ? 'records present — confirm one exists for THIS task'
    : 'NONE TRACKED — run the knowledge-capture Skill, or record NOT_REQUIRED with a reason';

/*
 * Resolve the vault the way the sync itself does, rather than looking beside
 * this script.
 *
 * The config lives in the user's primary checkout. A task runs in its own
 * worktree, where that file does not exist — so this reported
 * SKIPPED_NO_LOCAL_CONFIG from every task worktree, while `sync-obsidian.mjs`
 * found the vault perfectly well and published 511 notes into it. The finalizer
 * was telling the completion contract there was nothing to sync: exactly the
 * false "nothing to do here" the contract exists to refuse.
 *
 * `retrieve-knowledge.mjs` already carried this defect and had it fixed, and
 * the validator records the reason — planning happens in a task worktree, which
 * is precisely where the vault was invisible. Sharing the resolver is what
 * stops a third script repeating it.
 */
let obsidianVault = '';
try {
  obsidianVault = resolveObsidianConfig(ROOT)?.vaultPath ?? '';
} catch {
  obsidianVault = '';
}

if (!obsidianVault) {
  report.OBSIDIAN_SYNC = 'SKIPPED_NO_LOCAL_CONFIG';
} else if (NO_SYNC) {
  report.OBSIDIAN_SYNC = 'NOT_RUN — --no-sync requested';
  unresolved.push('OBSIDIAN_SYNC — config exists but sync was suppressed');
} else {
  try {
    const output = execFileSync('node', [join(ROOT, 'scripts/sync-obsidian.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const summary = output.split(/\r?\n/).find((line) => /Wrote \d+ file/.test(line));
    report.OBSIDIAN_SYNC = `PASS — ${summary ? summary.trim() : 'completed'}`;
  } catch (error) {
    // Non-blocking by contract: caps the task at COMPLETE_WITH_DOCUMENTATION_WARNING.
    report.OBSIDIAN_SYNC = `FAILED — ${String(error.message).split(/\r?\n/)[0]}`;
  }
}

// --- cleanup candidates

const worktrees = (git(['worktree', 'list'], { allowFailure: true }) ?? '')
  .split(/\r?\n/)
  .filter(Boolean);
report.WORKTREES = worktrees.length;

const attachedBranches = new Set(
  worktrees.map((line) => line.match(/\[([^\]]+)\]$/)?.[1]).filter(Boolean),
);

/*
 * A branch is only a deletion CANDIDATE here, and only if the framework itself
 * created it. `develop`, `release/*` and anyone's `feature/*` are merged into
 * main all the time; offering them for deletion is how someone's work gets
 * destroyed by a checklist. Restricting to the agent/ and chore/ conventions
 * means the script can only ever propose branches this framework owns — the
 * Integrator still confirms before deleting anything.
 */
const AGENT_BRANCH = /^(agent|chore)\//;

const allMerged = (git(['branch', '--merged', TARGET_BRANCH, '--format=%(refname:short)'], {
  allowFailure: true,
}) ?? '')
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((b) => b !== TARGET_BRANCH && !attachedBranches.has(b));

const mergedBranches = allMerged.filter((b) => AGENT_BRANCH.test(b));
const notOffered = allMerged.filter((b) => !AGENT_BRANCH.test(b));

report.BRANCH_CLEANUP_CANDIDATES = mergedBranches;
report.BRANCH_CLEANUP_NOT_OFFERED = notOffered;
report.WORKTREE_CLEANUP =
  worktrees.length > 1
    ? `${worktrees.length - 1} non-primary worktree(s) — remove clean, merged temporary ones`
    : 'none beyond the primary checkout';

// ---------------------------------------------------------------------- output

report.UNRESOLVED = unresolved;
report.FINALIZATION = unresolved.length === 0 ? 'RESOLVED' : 'UNRESOLVED';

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (k, v) => console.log(`${k}: ${v}`);
  console.log('## Task Finalization\n');
  line('TASK_STATUS', unresolved.length === 0 ? '<evaluate against the completion contract>' : 'BLOCKED_FINALIZATION');
  line('TARGET_BRANCH', report.TARGET_BRANCH);
  line('TASK_BRANCH', report.TASK_BRANCH);
  line('BASE_SHA', report.BASE_SHA ?? 'unresolved');
  line('FINAL_TASK_SHA', report.FINAL_TASK_SHA ?? 'unresolved');
  // Distinguish "not merged" from "no merge was needed" — reporting the second
  // as the first is exactly the kind of misleading finalization line this tool
  // exists to prevent.
  line(
    'MERGE_SHA',
    report.MERGE_STATUS === 'DONE'
      ? report.FINAL_TARGET_SHA
      : report.MERGE_STATUS.startsWith('NOT_REQUIRED')
        ? report.MERGE_STATUS
        : 'not merged',
  );
  line('FINAL_TARGET_SHA', report.FINAL_TARGET_SHA ?? 'unresolved');
  line('REMOTE_PUSH', report.REMOTE_PUSH);
  line('REMOTE_CI', report.REMOTE_CI);
  line('SHARED_TARGET', String(report.SHARED_TARGET));
  line('MERGE_AUTHORIZATION', report.MERGE_AUTHORIZATION);
  line('POST_MERGE_VALIDATION', '<record the commands actually run against the merged SHA>');
  line('QA_REPORT', report.QA_REPORT);
  line('KNOWLEDGE_CAPTURE', report.KNOWLEDGE_CAPTURE);
  line('OBSIDIAN_SYNC', report.OBSIDIAN_SYNC);
  line('WORKTREE_CLEANUP', report.WORKTREE_CLEANUP);
  const notOfferedNote = notOffered.length
    ? ` (${notOffered.length} other merged branch(es) not offered — not agent-created)`
    : '';
  line(
    'BRANCH_CLEANUP',
    (mergedBranches.length ? `candidates: ${mergedBranches.join(', ')}` : 'no candidates') +
      notOfferedNote,
  );

  if (dirtyPaths.length) {
    console.log('\nUncommitted paths:');
    for (const path of report.UNCOMMITTED_PATHS) console.log(`  ${path}`);
    if (dirtyPaths.length > report.UNCOMMITTED_PATHS.length) {
      console.log(`  … and ${dirtyPaths.length - report.UNCOMMITTED_PATHS.length} more`);
    }
  }

  if (unresolved.length) {
    console.log('\nUNRESOLVED — the task is not COMPLETE:');
    for (const item of unresolved) console.log(`  x ${item}`);
  } else {
    console.log('\nAll finalization facts resolved. Evaluate the completion contract:');
    console.log('  .agent/context/task-completion-contract.md');
  }
}

process.exit(unresolved.length === 0 ? 0 : 1);
