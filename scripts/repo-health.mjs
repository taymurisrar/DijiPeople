#!/usr/bin/env node
/*
 * Repository health — the PRE_TASK and POST_TASK checkpoint Release/DevOps owns.
 *
 * Answers the questions a task must not start or finish without an answer to:
 * is the shared target current, is anything mid-operation, is local main ahead
 * of a protected branch, and what is safe to clean up.
 *
 *   node scripts/repo-health.mjs             human-readable
 *   node scripts/repo-health.mjs --json      machine-readable
 *   node scripts/repo-health.mjs --fetch     fetch --prune first (network)
 *
 * It **reports only**. It never fetches destructively, pushes, resets, merges
 * or deletes — the same rule `finalize-agent-task.mjs` follows, and for the same
 * reason: a script that acts on a checklist acts on a *wrong* checklist just as
 * readily. Every action stays with the Integrator, which can read the evidence
 * first.
 *
 * Exit codes: 0 always. This is a report, not a gate — the caller decides what
 * a given state means for the task in hand. A diagnostic that fails the build
 * gets worked around; one that tells the truth gets read.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const json = process.argv.includes('--json');
const doFetch = process.argv.includes('--fetch');

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function gitLines(args) {
  const out = git(args, '');
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

// ------------------------------------------------------------------- target

/*
 * The shared target this repository merges into. Read from Git rather than
 * hardcoded, so a repository that renames its default branch does not get a
 * confidently wrong report.
 */
const originHead = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], '');
const TARGET = originHead ? originHead.replace('refs/remotes/origin/', '') : 'main';
const REMOTE_TARGET = `origin/${TARGET}`;

const hasRemote = Boolean(git(['remote', 'get-url', 'origin'], ''));

let fetchStatus = 'SKIPPED';
if (doFetch && hasRemote) {
  try {
    execFileSync('git', ['fetch', '--prune', 'origin'], { cwd: ROOT, stdio: 'pipe' });
    fetchStatus = 'DONE';
  } catch (error) {
    fetchStatus = 'FAILED';
    if (!json) console.error(`fetch failed: ${String(error.stderr ?? error.message).trim()}`);
  }
}

// ----------------------------------------------------------- unfinished state

/*
 * A repository mid-merge or mid-rebase must not have new work started on it.
 * These marker paths are how Git itself knows, so they are how we know.
 */
const gitDir = git(['rev-parse', '--git-common-dir'], '.git');
const gitDirAbs = resolve(ROOT, gitDir);

const UNFINISHED = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['BISECT_LOG', 'bisect'],
];

const unfinishedOperations = UNFINISHED.filter(([marker]) =>
  existsSync(join(gitDirAbs, marker)),
).map(([, name]) => name);

// -------------------------------------------------------------- sync status

const localTarget = git(['rev-parse', TARGET], null);
const remoteTarget = git(['rev-parse', REMOTE_TARGET], null);

let ahead = 0;
let behind = 0;
const counts = git(['rev-list', '--left-right', '--count', `${REMOTE_TARGET}...${TARGET}`], null);
if (counts) {
  const [remoteOnly, localOnly] = counts.split(/\s+/).map(Number);
  behind = remoteOnly || 0;
  ahead = localOnly || 0;
}

/*
 * MAIN_SYNC_STATUS — see .agent/context/repository-health.md.
 *
 * UNKNOWN is a real answer and stays available: reporting SYNCED because the
 * remote ref could not be read is the specific dishonesty this field exists to
 * prevent.
 */
function mainSyncStatus() {
  if (fetchStatus === 'FAILED') return 'FETCH_FAILED';
  if (!localTarget) return 'UNKNOWN';
  if (!hasRemote || !remoteTarget) return 'UNKNOWN';
  if (localTarget === remoteTarget) return 'SYNCED';
  if (ahead > 0 && behind > 0) return 'DIVERGED';
  if (ahead > 0) return 'AHEAD';
  if (behind > 0) return 'BEHIND';
  return 'UNKNOWN';
}

const syncStatus = mainSyncStatus();

/*
 * When the target is AHEAD, *why* decides the response — so list the commits
 * rather than only the count. Every recovery step downstream depends on somebody
 * reading these and confirming they are intended work.
 */
const localOnlyCommits = ahead > 0 ? gitLines(['log', '--oneline', `${REMOTE_TARGET}..${TARGET}`]) : [];
const remoteOnlyCommits = behind > 0 ? gitLines(['log', '--oneline', `${TARGET}..${REMOTE_TARGET}`]) : [];

// --------------------------------------------------------------- worktrees

const worktrees = [];
{
  let current = null;
  for (const line of gitLines(['worktree', 'list', '--porcelain'])) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null, detached: false };
      worktrees.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '');
    } else if (line === 'detached' && current) {
      current.detached = true;
    }
  }
}

for (const [index, worktree] of worktrees.entries()) {
  worktree.missing = !existsSync(worktree.path);

  /*
   * A worktree holding uncommitted work is never stale, whatever its branch
   * looks like. This is the Integrator's "never remove a dirty worktree" rule
   * enforced at the point the candidate list is built, rather than trusted to be
   * remembered at the point of deletion.
   */
  worktree.dirty = worktree.missing
    ? false
    : (() => {
        try {
          return (
            execFileSync('git', ['-C', worktree.path, 'status', '--porcelain'], {
              encoding: 'utf8',
            }).trim().length > 0
          );
        } catch {
          /* Unreadable is not clean. Fail towards keeping it. */
          return true;
        }
      })();

  /*
   * `git worktree list` always emits the primary checkout first. Comparing
   * against this script's own location instead would misclassify the primary
   * checkout as stale whenever the script runs from a task worktree — which is
   * exactly where it runs most of the time.
   */
  worktree.isPrimary = index === 0;

  /*
   * "Stale" means the directory is gone, or a *task* worktree's branch is fully
   * merged. A worktree with unmerged commits is never stale, however old; nor is
   * the primary checkout, nor one sitting on the shared target itself.
   */
  if (worktree.missing) {
    worktree.stale = true;
    worktree.reason = 'directory no longer exists — git worktree prune';
  } else if (
    !worktree.isPrimary &&
    !worktree.dirty &&
    worktree.branch &&
    worktree.branch !== TARGET &&
    localTarget &&
    gitLines(['log', '--oneline', `${TARGET}..${worktree.branch}`]).length === 0
  ) {
    worktree.stale = true;
    worktree.reason = `branch ${worktree.branch} has no commits beyond ${TARGET}`;
  } else {
    worktree.stale = false;
    worktree.reason = '';
  }
}

// ---------------------------------------------------------------- branches

const worktreeBranches = new Set(worktrees.map((w) => w.branch).filter(Boolean));

/*
 * Cleanup candidates, deliberately narrow. Only agent-produced branches, only
 * when fully merged, only with no unique commits, only with no worktree
 * attached. Human `feature/<Name>/<topic>` branches are never the framework's
 * to clean up, and `release/*` never is either.
 */
const PROTECTED_BRANCH_PATTERNS = [/^main$/, /^master$/, /^develop$/, /^release\//, /^production$/, /^staging$/];

/*
 * Only branches the framework itself creates are ever proposed for deletion.
 * A merged `feature/<Name>/<topic>` branch belongs to a human who may still be
 * using it, and "it looked merged" is not a reason to delete somebody else's
 * branch. Everything else is reported, never proposed.
 */
const AGENT_BRANCH_PATTERNS = [/^agent\//, /^chore\//];

const mergedLocal = new Set(
  gitLines(['branch', '--merged', TARGET, '--format=%(refname:short)']).filter(Boolean),
);

const localBranches = gitLines(['branch', '--format=%(refname:short)']).filter(Boolean);

const staleBranches = [];
const unmergedBranches = [];
const mergedNonAgentBranches = [];

for (const branch of localBranches) {
  if (PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) continue;

  const unique = gitLines(['log', '--oneline', `${TARGET}..${branch}`]);
  const hasWorktree = worktreeBranches.has(branch);
  const merged = mergedLocal.has(branch);
  const isAgentBranch = AGENT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));

  if (unique.length > 0) {
    unmergedBranches.push({ branch, uniqueCommits: unique.length, hasWorktree });
  } else if (merged && !hasWorktree && isAgentBranch) {
    staleBranches.push({ branch, safeToDelete: true, reason: `merged into ${TARGET}, no unique commits` });
  } else if (merged && !hasWorktree) {
    mergedNonAgentBranches.push(branch);
  }
}

/* Merged remote agent branches are reported, never proposed for deletion here. */
const staleRemoteBranches = gitLines(['branch', '-r', '--merged', REMOTE_TARGET, '--format=%(refname:short)'])
  .filter((branch) => branch.startsWith('origin/agent/') || branch.startsWith('origin/chore/'))
  .filter((branch) => branch !== REMOTE_TARGET);

// ------------------------------------------------------------------ dirty

const porcelain = gitLines(['status', '--porcelain']);
const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], 'UNKNOWN');

// ------------------------------------------------------------------ verdict

const blockers = [];
if (unfinishedOperations.length) {
  blockers.push(`unfinished ${unfinishedOperations.join(', ')} in progress — resolve before starting work`);
}
if (syncStatus === 'DIVERGED') blockers.push(`${TARGET} has diverged from ${REMOTE_TARGET}`);
if (syncStatus === 'AHEAD') {
  blockers.push(`${TARGET} is ${ahead} commit(s) ahead of ${REMOTE_TARGET} — protected-branch recovery may be required`);
}
if (syncStatus === 'FETCH_FAILED') blockers.push('remote state could not be read');
if (syncStatus === 'UNKNOWN') blockers.push('sync status could not be determined');

const warningList = [];
if (syncStatus === 'BEHIND') warningList.push(`${TARGET} is ${behind} commit(s) behind — fast-forward before branching`);
if (porcelain.length && currentBranch === TARGET) {
  warningList.push(`${TARGET} is dirty (${porcelain.length} path(s)) — work in a separate worktree`);
}

const health = blockers.length ? 'FAIL' : warningList.length ? 'PASS_WITH_WARNINGS' : 'PASS';

const report = {
  health,
  target: TARGET,
  currentBranch,
  MAIN_SYNC_STATUS: syncStatus,
  localTargetSha: localTarget,
  remoteTargetSha: remoteTarget,
  ahead,
  behind,
  diverged: syncStatus === 'DIVERGED',
  fetch: fetchStatus,
  dirtyPaths: porcelain.length,
  unfinishedOperations,
  localOnlyCommits,
  remoteOnlyCommits,
  staleWorktrees: worktrees.filter((w) => w.stale).map((w) => ({ path: w.path, reason: w.reason })),
  worktrees: worktrees.map((w) => ({ path: w.path, branch: w.branch, stale: w.stale })),
  staleBranches,
  unmergedBranches,
  mergedNonAgentBranches,
  staleRemoteBranches,
  blockers,
  warnings: warningList,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ------------------------------------------------------------------ output

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log('');
console.log(`Repository health — ${health}`);
console.log('');
line('TARGET', TARGET);
line('CURRENT_BRANCH', currentBranch);
line('MAIN_SYNC_STATUS', syncStatus);
line('LOCAL_TARGET_SHA', localTarget ?? 'UNKNOWN');
line('REMOTE_TARGET_SHA', remoteTarget ?? 'UNKNOWN');
line('AHEAD', String(ahead));
line('BEHIND', String(behind));
line('DIVERGED', String(syncStatus === 'DIVERGED'));
line('DIRTY_PATHS', String(porcelain.length));
line('FETCH', fetchStatus);
line('UNFINISHED_GIT_OPS', unfinishedOperations.length ? unfinishedOperations.join(', ') : 'none');
line('STALE_WORKTREES', String(report.staleWorktrees.length));
line('STALE_BRANCHES', String(staleBranches.length));

if (localOnlyCommits.length) {
  console.log('');
  console.log(`  Commits on ${TARGET} that are not on ${REMOTE_TARGET}:`);
  for (const commit of localOnlyCommits) console.log(`    ${commit}`);
  console.log('');
  console.log('  Read every one before acting. Preserve them on a task branch and use the');
  console.log('  PR flow — see .agent/context/repository-health.md. Never force-push, never');
  console.log('  discard a commit that has not been verified as already on the remote.');
}

if (report.staleWorktrees.length) {
  console.log('');
  console.log('  Stale worktrees:');
  for (const worktree of report.staleWorktrees) console.log(`    ${worktree.path} — ${worktree.reason}`);
}

if (staleBranches.length) {
  console.log('');
  console.log('  Local branches safe to delete:');
  for (const entry of staleBranches) console.log(`    ${entry.branch} — ${entry.reason}`);
}

if (unmergedBranches.length) {
  console.log('');
  console.log('  Unmerged local branches — NEVER delete these:');
  for (const entry of unmergedBranches) {
    console.log(
      `    ${entry.branch} — ${entry.uniqueCommits} unique commit(s)${entry.hasWorktree ? ', worktree attached' : ''}`,
    );
  }
}

if (mergedNonAgentBranches.length) {
  console.log('');
  console.log('  Merged non-agent local branches — report only, not the framework\'s to delete:');
  for (const branch of mergedNonAgentBranches) console.log(`    ${branch}`);
}

if (staleRemoteBranches.length) {
  console.log('');
  console.log(`  Merged remote branches (${staleRemoteBranches.length}) — report only, delete per policy:`);
  for (const branch of staleRemoteBranches.slice(0, 10)) console.log(`    ${branch}`);
  if (staleRemoteBranches.length > 10) console.log(`    … and ${staleRemoteBranches.length - 10} more`);
}

if (blockers.length) {
  console.log('');
  console.log('  BLOCKERS:');
  for (const blocker of blockers) console.log(`    x ${blocker}`);
}

if (warningList.length) {
  console.log('');
  console.log('  Warnings:');
  for (const warning of warningList) console.log(`    ! ${warning}`);
}

console.log('');
