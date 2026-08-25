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
 * Health is a property of **every** framework-managed worktree, not of the one
 * the script happens to run in. A task worktree can be spotlessly clean while
 * the user's primary checkout carries uncommitted files nobody has explained —
 * which is exactly how a completed task once reported CLEANUP_STATUS = DONE
 * while GitHub Desktop showed the user six changed files. See
 * PRIMARY_WORKTREE_STATUS below and `.agent/context/repository-health.md`.
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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { taskShaRef } from './lib/task-sha-ref.mjs';
import { mainChangeVerdict } from './lib/main-change-policy.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : (process.argv[index + 1] ?? '');
}

/*
 * `--root` exists so the behavioural simulations can run this script against a
 * throwaway repository with real worktrees attached. Without it the multi-
 * worktree rules below could only ever be asserted, never executed — and a
 * check that is only asserted is the class of defect this file now guards.
 */
const ROOT = argValue('--root')
  ? resolve(argValue('--root'))
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const json = process.argv.includes('--json');
const doFetch = process.argv.includes('--fetch');

/*
 * The paths that were **already** dirty in the primary worktree when this task
 * started, comma-separated, exactly as `git status --porcelain` names them.
 *
 * This is the same idea as --main-baseline and exists for the same reason: it
 * turns "was this mess here before me?" from a guess into a fact. A path in the
 * baseline is the user's own in-flight work and is preserved untouched; a path
 * that appeared *during* the task and belongs to no session is UNEXPLAINED, and
 * unexplained is the one state that blocks completion.
 */
const PRIMARY_BASELINE = new Set(
  argValue('--primary-baseline')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
);
const hasPrimaryBaseline = process.argv.includes('--primary-baseline');

/*
 * Paths in the primary checkout that appeared during this task and belong to
 * another live session:
 *
 *   --primary-attributed SESSION-0025:services/api/package.json,SESSION-0031:path
 *
 * Deliberately separate from --primary-baseline. The baseline says "this
 * predated me"; attribution says "this is not mine, and here is who owns it".
 * Collapsing them would let a task launder a file it created into the user's
 * pre-existing work, which is the one thing the baseline exists to prevent.
 */
const primaryAttributions = new Map(
  argValue('--primary-attributed')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      if (separator === -1) return null;
      return [entry.slice(separator + 1).trim(), entry.slice(0, separator).trim().toUpperCase()];
    })
    .filter(Boolean),
);

/*
 * The SHA `main` sat at when this task started. Supplying it turns
 * MAIN_CHANGE_STATUS from a guess into a fact: an ordinary task must leave the
 * production branch exactly where it found it, and only a comparison against a
 * recorded baseline can prove that. Without it the field reports UNKNOWN rather
 * than a comforting default.
 */
const mainBaselineIndex = process.argv.indexOf('--main-baseline');
const MAIN_BASELINE = mainBaselineIndex === -1 ? '' : (process.argv[mainBaselineIndex + 1] ?? '');

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

// ------------------------------------------------- the integration branch
/*
 * `develop` is the autonomous integration branch and `main` is the production
 * deployment branch. Ordinary tasks merge into develop and leave main untouched,
 * because any mutation of main may trigger a production deployment.
 *
 * That split means repository health has two sync questions, not one. Reporting
 * only MAIN_SYNC_STATUS was correct while main was the integration target; it is
 * now the field that says "production is where we left it", and a separate one
 * has to say "did the work actually land".
 */
const INTEGRATION = 'develop';
const REMOTE_INTEGRATION = `origin/${INTEGRATION}`;

const localIntegration = git(['rev-parse', '--verify', '--quiet', INTEGRATION], null);
const remoteIntegration = git(['rev-parse', '--verify', '--quiet', REMOTE_INTEGRATION], null);

let integrationAhead = 0;
let integrationBehind = 0;
if (localIntegration && remoteIntegration) {
  const counts = git(
    ['rev-list', '--left-right', '--count', `${REMOTE_INTEGRATION}...${INTEGRATION}`],
    null,
  );
  if (counts) {
    const [remoteOnly, localOnly] = counts.split(/\s+/).map(Number);
    integrationBehind = remoteOnly || 0;
    integrationAhead = localOnly || 0;
  }
}

/*
 * DEVELOP_SYNC_STATUS. `NOT_PRESENT` and `REMOTE_ONLY` are real states worth
 * naming: most task worktrees never check develop out, and reporting UNKNOWN for
 * that ordinary case would train everybody to ignore the field.
 */
function developSyncStatus() {
  if (fetchStatus === 'FAILED') return 'FETCH_FAILED';
  if (!hasRemote) return 'UNKNOWN';
  if (!remoteIntegration) return 'NOT_PRESENT';
  if (!localIntegration) return 'REMOTE_ONLY';
  if (localIntegration === remoteIntegration) return 'SYNCED';
  if (integrationAhead > 0 && integrationBehind > 0) return 'DIVERGED';
  if (integrationAhead > 0) return 'AHEAD';
  if (integrationBehind > 0) return 'BEHIND';
  return 'UNKNOWN';
}

const developStatus = developSyncStatus();

/*
 * How far behind `main` the integration branch is. A develop that is hundreds
 * of commits behind main is not an integration branch — it is an abandoned one,
 * and cutting work from it would resurrect a tree nobody has run in months.
 */
const developBehindMain = remoteIntegration && remoteTarget
  ? Number(
      (git(['rev-list', '--count', `${REMOTE_INTEGRATION}..${REMOTE_TARGET}`], '0') || '0').trim(),
    )
  : 0;

/*
 * MAIN_CHANGE_STATUS — the production-safety field.
 *
 * The question is "did **this task** move production", which is not the same as
 * "has main moved". Several sessions run concurrently, and another session
 * merging a PR advances `main` through no fault of the task being audited.
 *
 * The first implementation compared the baseline against `origin/main` and
 * reported CHANGED for exactly that case — it fired on its own first real run,
 * for a task that had not touched `main` at all. A production-safety field that
 * cries wolf when a colleague merges is a field people learn to ignore.
 *
 * So the test is containment, not equality: does `origin/main` contain this
 * task's commits? The baseline still matters — it distinguishes `main` moving
 * *forward* (ordinary) from `main` being rewritten (never ordinary).
 */
/*
 * BUG-1203 — the HEAD fallback that used to live here reintroduced the exact
 * false positive the paragraph above describes, by a different route. The
 * decision now lives in `lib/task-sha-ref.mjs`, where it is under test; the
 * reasoning is recorded there rather than restated here.
 */
const TASK_SHA = (() => {
  const index = process.argv.indexOf('--task-sha');
  const supplied = index === -1 ? '' : (process.argv[index + 1] ?? '');
  const ref = taskShaRef({
    supplied,
    head: git(['rev-parse', '--abbrev-ref', 'HEAD'], ''),
    target: TARGET,
    integration: INTEGRATION,
  });
  return ref ? git(['rev-parse', '--verify', '--quiet', ref], '') : '';
})();

let mainAdvancedBy = 0;

function mainChangeStatus() {
  if (!MAIN_BASELINE || !remoteTarget) return 'UNKNOWN';

  const baseline = git(['rev-parse', '--verify', '--quiet', MAIN_BASELINE], '');
  if (!baseline) return 'UNKNOWN';

  /* This task's work reaching production is the event the field exists for. */
  if (TASK_SHA) {
    const contained = git(['merge-base', '--is-ancestor', TASK_SHA, remoteTarget], null);
    if (contained !== null) return 'CHANGED_BY_THIS_TASK';
  }

  if (baseline === remoteTarget) return 'UNTOUCHED';

  /*
   * `main` moved and this task is not in it. Fast-forward from the baseline is
   * somebody else's merge and is fine; anything else means the branch was
   * rewritten, which nobody should be doing and which must not be silent.
   */
  if (git(['merge-base', '--is-ancestor', baseline, remoteTarget], null) !== null) {
    mainAdvancedBy = Number(
      (git(['rev-list', '--count', `${baseline}..${remoteTarget}`], '0') || '0').trim(),
    );
    return 'UNTOUCHED';
  }

  return 'REWRITTEN';
}

const mainChange = mainChangeStatus();

/*
 * ITEM-0091 — the task's type, so `CHANGED_BY_THIS_TASK` can be read as the
 * defining outcome of a RELEASE rather than as a failure. Absent or
 * unrecognised still blocks; see `lib/main-change-policy.mjs` for why that
 * default is not negotiable.
 */
const TASK_TYPE = argValue('--task-type') ?? '';
const mainChangeDecision = mainChangeVerdict(mainChange, TASK_TYPE);

/* The live integration lock, so a health report says whether develop is busy. */
let integrationLock = { holder: null, queued: 0 };
try {
  const { nextIntegration, readQueue } = await import('./lib/session-registry.mjs');
  const { inFlight } = nextIntegration(ROOT);
  integrationLock = { holder: inFlight?.branch ?? null, queued: readQueue(ROOT).length };
} catch {
  /* The registry is optional state; its absence is not a health failure. */
}

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

/*
 * Which session owns which worktree, read from the durable session records.
 *
 * Ownership is the difference between "somebody else is working here, leave it
 * alone" and "nobody can account for this, stop". Without it every dirty file
 * looks the same, and a framework that cannot tell them apart either reverts
 * another session's work or ignores its own mess. It has done both.
 */
const sessionsByWorktree = new Map();
const sessionsById = new Map();
try {
  const sessionDir = join(ROOT, 'docs/sessions');
  if (existsSync(sessionDir)) {
    for (const file of readdirSync(sessionDir)) {
      if (!/^SESSION-\d+.*\.md$/.test(file)) continue;
      const body = readFileSync(join(sessionDir, file), 'utf8');
      const field = (name) => {
        const match = body.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
        return match ? match[1].trim() : '';
      };
      const record = {
        id: field('SESSION_ID') || file.slice(0, 12),
        status: (field('STATUS') || 'UNKNOWN').toUpperCase(),
        worktree: field('WORKTREE').replace(/\\/g, '/').replace(/\/+$/, ''),
        branch: field('TASK_BRANCH'),
        file: `docs/sessions/${file}`,
      };
      sessionsById.set(record.id, record);

      /*
       * Worktrees get reused across sessions, so a path maps to many records.
       * The live one is what a reader needs: prefer an ACTIVE session, and among
       * equals the most recent id. Keeping the last record read instead — which
       * is alphabetical order, not chronological — attributed the primary
       * checkout to a session that had finished days earlier.
       */
      if (record.worktree) {
        const key = record.worktree.toLowerCase();
        const held = sessionsByWorktree.get(key);
        const better =
          !held ||
          (record.status === 'ACTIVE' && held.status !== 'ACTIVE') ||
          (((record.status === 'ACTIVE') === (held.status === 'ACTIVE')) && record.id > held.id);
        if (better) sessionsByWorktree.set(key, record);
      }
    }
  }
} catch {
  /* Session records are optional state; unreadable ones must not crash health. */
}

const activeSessionIds = new Set(
  [...sessionsById.values()].filter((s) => s.status === 'ACTIVE').map((s) => s.id),
);

/* This task's own branch, so its worktree is classified TASK rather than OTHER. */
const SELF_BRANCH = argValue('--task-branch');

for (const [index, worktree] of worktrees.entries()) {
  worktree.missing = !existsSync(worktree.path);

  /*
   * The porcelain lines themselves, not merely whether there were any. The old
   * boolean was enough to protect a worktree from deletion but could never say
   * *what* was uncommitted or who put it there, so it could not be reported and
   * could not be classified — and a fact that cannot be reported cannot gate.
   */
  worktree.dirtyPaths = worktree.missing
    ? []
    : (() => {
        try {
          return execFileSync('git', ['-C', worktree.path, 'status', '--porcelain'], {
            encoding: 'utf8',
          })
            .split(/\r?\n/)
            .filter(Boolean);
        } catch {
          /* Unreadable is not clean. Fail towards keeping it. */
          return ['?? <unreadable>'];
        }
      })();

  worktree.dirty = worktree.dirtyPaths.length > 0;

  /*
   * `git worktree list` always emits the primary checkout first. Comparing
   * against this script's own location instead would misclassify the primary
   * checkout as stale whenever the script runs from a task worktree — which is
   * exactly where it runs most of the time.
   */
  worktree.isPrimary = index === 0;

  const normalisedPath = worktree.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  worktree.session = sessionsByWorktree.get(normalisedPath) ?? null;

  /*
   * PRIMARY, TASK or OTHER. The framework had no word for the first of these,
   * which is why nothing ever checked it: the primary checkout is the user's
   * interactive workspace, it is nobody's task worktree, and it is the one place
   * a stray file is guaranteed to be seen by a human before it is seen by an
   * agent.
   */
  worktree.role = worktree.isPrimary
    ? 'PRIMARY'
    : SELF_BRANCH && worktree.branch === SELF_BRANCH
      ? 'TASK'
      : 'OTHER';

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

// ------------------------------------------------- primary worktree ownership

/*
 * Every dirty path in the primary checkout gets an owner. The vocabulary is
 * deliberately small, because the only question that matters downstream is
 * whether a human already knows about this file:
 *
 *   USER                 already dirty at task start — preserve, never touch
 *   SESSION-nnnn         an active session's own record or declared worktree
 *   GENERATED_BY_FRAMEWORK  a framework generator wrote it during this task
 *   UNKNOWN              nobody can account for it — this is the blocking one
 */
const primaryWorktree = worktrees.find((w) => w.isPrimary) ?? null;

/*
 * Paths a framework generator is known to write. These are still reported and
 * still have to be committed or explained; naming them only distinguishes
 * "a generator did this" from "nobody knows", which are different problems with
 * different fixes.
 */
const GENERATED_PATH_PATTERNS = [
  /^docs\/backlog\//,
  /^docs\/bugs\/index\.md$/,
  /^docs\/qa\/(index|coverage)/,
  /^docs\/sessions\/(index|active|completed)\.md$/,
  /^docs\/tasks\/index\.md$/,
  /^docs\/knowledge\/dashboards\//,
];

function classifyPrimaryPath(entry) {
  /* `XY path` — and `R  old -> new`, where the new name is what exists now. */
  const path = entry.slice(3).trim().split(' -> ').pop();

  const preExisting = PRIMARY_BASELINE.has(path) || PRIMARY_BASELINE.has(entry);

  /*
   * A session record for a session that is still ACTIVE belongs to that session
   * — very possibly another chat running right now. It is reported and left
   * alone. A record for a session that is not active is an orphaned stub: the
   * session registered here, moved to its own worktree, and never came back.
   *
   * The record's STATUS is read from the file **as it exists in the primary
   * worktree**, not from this checkout's committed records. An active session
   * registered from the primary checkout has its only copy sitting there
   * untracked — reading committed state instead reported the live session of
   * another chat as an orphan, which would have invited deleting it.
   */
  const sessionMatch = path.match(/^docs\/sessions\/(SESSION-\d+)/);
  if (sessionMatch) {
    const id = sessionMatch[1];
    let status = sessionsById.get(id)?.status ?? '';
    if (primaryWorktree) {
      try {
        const body = readFileSync(join(primaryWorktree.path, path), 'utf8');
        const match = body.match(/^STATUS:\s*(.*)$/m);
        if (match) status = match[1].trim().toUpperCase();
      } catch {
        /* Deleted or unreadable — fall back to whatever the indexes recorded. */
      }
    }
    if (status === 'ACTIVE' || activeSessionIds.has(id)) {
      return { path, owner: id, classification: 'ACTIVE_SESSION_RECORD' };
    }
    /*
     * A stub that was already here when the task started is somebody else's
     * mess to explain, not this task's to be blocked by. It is still named and
     * still attributed, because "pre-existing" is a reason not to block, never
     * a reason to stop reporting.
     */
    if (preExisting) {
      return { path, owner: id, classification: 'PRE_EXISTING_ORPHANED_STUB' };
    }
    return { path, owner: id, classification: 'ORPHANED_SESSION_STUB' };
  }

  if (preExisting) {
    return { path, owner: 'USER', classification: 'PRE_EXISTING_USER_WORK' };
  }

  /*
   * A path that appeared *during* this task and belongs to another live session.
   *
   * The model used to assume only the running task changes the primary
   * checkout, so a concurrent session editing it mid-task had nowhere to land
   * but UNEXPLAINED. The only ways out were to block forever, or to list the
   * path in --primary-baseline — which asserts it predated the task when it
   * did not. TASK-0012 hit exactly this: SESSION-0025 was deploying an API heap
   * cap and edited `services/api/package.json` in the primary worktree while
   * this program was running.
   *
   * Attribution is explicit, names an owner, and the owner must actually be an
   * ACTIVE session, so it cannot wave through a genuinely unexplained file.
   * Naming a session that is not active leaves the path UNEXPLAINED, which is
   * the correct answer when nobody is around to claim it.
   */
  const attributedTo = primaryAttributions.get(path);
  if (attributedTo && activeSessionIds.has(attributedTo)) {
    return { path, owner: attributedTo, classification: 'OTHER_SESSION_WORK' };
  }

  if (GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    return { path, owner: 'GENERATED_BY_FRAMEWORK', classification: 'GENERATED_UNCOMMITTED' };
  }

  return { path, owner: 'UNKNOWN', classification: 'UNEXPLAINED' };
}

const primaryDirtyFiles = (primaryWorktree?.dirtyPaths ?? []).map(classifyPrimaryPath);
const unexplainedDirtyFiles = primaryDirtyFiles.filter((f) => f.owner === 'UNKNOWN');
const orphanedSessionStubs = primaryDirtyFiles.filter(
  (f) => f.classification === 'ORPHANED_SESSION_STUB',
);

/*
 * PRIMARY_WORKTREE_STATUS — the field whose absence let a task report
 * CLEANUP_STATUS = DONE while the user's checkout held six unexplained files.
 *
 * DIRTY_USER_OWNED is the only dirty state compatible with completion, and only
 * because a baseline proves the files predate the task.
 */
function primaryWorktreeStatus() {
  if (!primaryWorktree || primaryWorktree.missing) return 'UNAVAILABLE';
  if (!primaryWorktree.dirty) return 'CLEAN';
  if (unexplainedDirtyFiles.length > 0 || orphanedSessionStubs.length > 0) {
    return 'DIRTY_UNEXPLAINED';
  }
  if (primaryDirtyFiles.some((f) => f.classification === 'GENERATED_UNCOMMITTED')) {
    return 'DIRTY_UNEXPLAINED';
  }
  /*
   * Only paths proven to predate the task are the user's. A pre-existing
   * orphaned stub is reported under the session that left it, so it does not
   * count towards DIRTY_USER_OWNED — the distinction tells the reader whether
   * to ask the user or go and look at a session record.
   */
  if (primaryDirtyFiles.every((f) => f.classification === 'PRE_EXISTING_USER_WORK')) {
    return 'DIRTY_USER_OWNED';
  }
  return 'DIRTY_OTHER_SESSION_OWNED';
}

const PRIMARY_WORKTREE_STATUS = primaryWorktreeStatus();

/* Worktrees other than the primary and this task's, reported never touched. */
const otherDirtyWorktrees = worktrees
  .filter((w) => w.dirty && w.role === 'OTHER')
  .map((w) => ({
    path: w.path,
    branch: w.branch,
    dirtyPaths: w.dirtyPaths.length,
    session: w.session?.id ?? null,
    ownership: w.session ? 'DIRTY_OTHER_SESSION_OWNED' : 'DIRTY_UNATTRIBUTED',
  }));

const taskWorktree = worktrees.find((w) => w.role === 'TASK') ?? null;
const TASK_WORKTREE_STATUS = !SELF_BRANCH
  ? 'NOT_DECLARED'
  : !taskWorktree
    ? 'UNAVAILABLE'
    : taskWorktree.dirty
      ? 'DIRTY'
      : 'CLEAN';

/*
 * Unfinished Git operations across every worktree, not only this one. A rebase
 * abandoned in a sibling checkout is still an unfinished operation in this
 * repository, and `--git-common-dir` does not see it.
 */
const unfinishedByWorktree = [];
for (const worktree of worktrees) {
  if (worktree.missing) continue;
  let worktreeGitDir = null;
  try {
    worktreeGitDir = execFileSync('git', ['-C', worktree.path, 'rev-parse', '--git-dir'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    continue;
  }
  const abs = resolve(worktree.path, worktreeGitDir);
  const ops = UNFINISHED.filter(([marker]) => existsSync(join(abs, marker))).map(([, n]) => n);
  if (ops.length) unfinishedByWorktree.push({ path: worktree.path, operations: [...new Set(ops)] });
}

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

/*
 * ITEM-0091 — this used to block unconditionally, while its own message named
 * the three task types allowed to do it. Policy lives in
 * `lib/main-change-policy.mjs`, under test. An absent or unrecognised
 * `--task-type` still blocks: that is the safe default, and it is why the flag
 * cannot be used to silence the field by accident.
 */
if (mainChange === 'CHANGED_BY_THIS_TASK' && mainChangeDecision !== 'EXPECTED') {
  blockers.push(
    `this task's commits are on ${REMOTE_TARGET} — main is the production deployment ` +
      'branch, and only a RELEASE, DEPLOY or HOTFIX_PRODUCTION task may put work there' +
      (TASK_TYPE ? ` (--task-type ${TASK_TYPE} is not one of them)` : ''),
  );
}
if (mainChange === 'REWRITTEN') {
  blockers.push(
    `${REMOTE_TARGET} no longer contains the recorded baseline ${MAIN_BASELINE.slice(0, 7)} — ` +
      'the production branch has been rewritten, which nothing in this framework does',
  );
}
if (developStatus === 'DIVERGED') {
  blockers.push(`${INTEGRATION} has diverged from ${REMOTE_INTEGRATION} — the Integrator must reconcile before integrating`);
}

/*
 * The primary-worktree blockers. These are blockers rather than warnings on
 * purpose: the previous implementation computed per-worktree dirtiness, dropped
 * it from the report, and warned only when the *invoking* worktree was dirty
 * *and* sitting on main. A dirty develop in the user's checkout therefore
 * produced no output at all, which is precisely what happened.
 */
if (PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED') {
  blockers.push(
    `the primary worktree holds ${unexplainedDirtyFiles.length + orphanedSessionStubs.length} ` +
      'unexplained tracked change(s) — every dirty path must have an owner before a task completes',
  );
}
if (unfinishedByWorktree.length) {
  blockers.push(
    `unfinished Git operations in ${unfinishedByWorktree.length} worktree(s) — ` +
      unfinishedByWorktree.map((w) => `${w.path} (${w.operations.join(', ')})`).join('; '),
  );
}

const warningList = [];
/*
 * ITEM-0091 — a release's commits reaching production is reported, not blocked,
 * but it is never silent. A RELEASE that moved `main` should say so plainly in
 * its own health output; the thing that was wrong was calling it a failure.
 */
if (mainChangeDecision === 'EXPECTED') {
  warningList.push(
    `this task's commits are on ${REMOTE_TARGET} — the defining outcome of a ` +
      `${TASK_TYPE} task, so reported rather than blocked`,
  );
}
if (syncStatus === 'BEHIND') warningList.push(`${TARGET} is ${behind} commit(s) behind — fast-forward before branching`);
if (porcelain.length && currentBranch === TARGET) {
  warningList.push(`${TARGET} is dirty (${porcelain.length} path(s)) — work in a separate worktree`);
}
if (PRIMARY_WORKTREE_STATUS === 'DIRTY_USER_OWNED') {
  warningList.push(
    `the primary worktree carries ${primaryDirtyFiles.length} pre-existing user path(s) — ` +
      'preserve them; they are not this task\'s to commit, revert or stash',
  );
}
if (PRIMARY_WORKTREE_STATUS === 'DIRTY_OTHER_SESSION_OWNED') {
  warningList.push(
    'the primary worktree is dirty with another session\'s records — reported, not cleaned',
  );
}
if (PRIMARY_WORKTREE_STATUS === 'DIRTY_UNEXPLAINED' && !hasPrimaryBaseline) {
  warningList.push(
    'no --primary-baseline was supplied, so files that predate this task cannot be ' +
      'distinguished from files it created — record the baseline at PRE_TASK_REPO_HEALTH',
  );
}
if (otherDirtyWorktrees.length) {
  warningList.push(
    `${otherDirtyWorktrees.length} other worktree(s) are dirty — another session may be live ` +
      'in them; never clean, revert or remove a worktree this task does not own',
  );
}
if (developStatus === 'NOT_PRESENT') {
  warningList.push(
    `${REMOTE_INTEGRATION} does not exist — ordinary tasks have no integration target and would ` +
      'fall back to main, which is production. Create it from the current shared baseline.',
  );
}
if (developBehindMain > 0) {
  warningList.push(
    `${REMOTE_INTEGRATION} is ${developBehindMain} commit(s) behind ${REMOTE_TARGET} — ` +
      'an integration branch behind production produces conflicts that have nothing to do with the task',
  );
}
if (developStatus === 'AHEAD') {
  warningList.push(
    `${INTEGRATION} is ${integrationAhead} commit(s) ahead of ${REMOTE_INTEGRATION} — integrated work has not been pushed`,
  );
}
if (integrationLock.holder) {
  warningList.push(
    `${integrationLock.holder} holds the ${INTEGRATION} integration lock — no other session may write it`,
  );
}

const health = blockers.length ? 'FAIL' : warningList.length ? 'PASS_WITH_WARNINGS' : 'PASS';

const report = {
  health,
  target: TARGET,
  integrationBranch: INTEGRATION,
  currentBranch,
  MAIN_SYNC_STATUS: syncStatus,
  MAIN_CHANGE_STATUS: mainChange,
  MAIN_BASELINE: MAIN_BASELINE || null,
  mainAdvancedByOthers: mainAdvancedBy,
  taskSha: TASK_SHA || null,
  DEVELOP_SYNC_STATUS: developStatus,
  localIntegrationSha: localIntegration,
  remoteIntegrationSha: remoteIntegration,
  integrationAhead,
  integrationBehind,
  developBehindMain,
  integrationLock,
  localTargetSha: localTarget,
  remoteTargetSha: remoteTarget,
  ahead,
  behind,
  diverged: syncStatus === 'DIVERGED',
  fetch: fetchStatus,
  dirtyPaths: porcelain.length,
  unfinishedOperations,
  PRIMARY_WORKTREE_STATUS,
  TASK_WORKTREE_STATUS,
  primaryWorktreePath: primaryWorktree?.path ?? null,
  primaryDirtyFiles,
  unexplainedDirtyFiles,
  orphanedSessionStubs,
  otherDirtyWorktrees,
  unfinishedByWorktree,
  primaryBaselineSupplied: hasPrimaryBaseline,
  localOnlyCommits,
  remoteOnlyCommits,
  staleWorktrees: worktrees.filter((w) => w.stale).map((w) => ({ path: w.path, reason: w.reason })),
  worktrees: worktrees.map((w) => ({
    path: w.path,
    branch: w.branch,
    stale: w.stale,
    role: w.role,
    dirty: w.dirty,
    dirtyPaths: w.dirtyPaths.length,
    session: w.session?.id ?? null,
  })),
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
line('PRODUCTION_BRANCH', TARGET);
line('INTEGRATION_BRANCH', INTEGRATION);
line('CURRENT_BRANCH', currentBranch);
line('MAIN_SYNC_STATUS', syncStatus);
line(
  'MAIN_CHANGE_STATUS',
  mainChange +
    (MAIN_BASELINE
      ? ` (baseline ${MAIN_BASELINE.slice(0, 7)}${mainAdvancedBy ? `, advanced ${mainAdvancedBy} commit(s) by other sessions` : ''})`
      : ' — pass --main-baseline <sha> to prove it'),
);
line('DEVELOP_SYNC_STATUS', developStatus);
line('LOCAL_TARGET_SHA', localTarget ?? 'UNKNOWN');
line('REMOTE_TARGET_SHA', remoteTarget ?? 'UNKNOWN');
line('LOCAL_DEVELOP_SHA', localIntegration ?? 'not checked out here');
line('REMOTE_DEVELOP_SHA', remoteIntegration ?? 'UNKNOWN');
line('DEVELOP_BEHIND_MAIN', String(developBehindMain));
line('INTEGRATION_LOCK', integrationLock.holder ?? `free (${integrationLock.queued} queued)`);
line('AHEAD', String(ahead));
line('BEHIND', String(behind));
line('DIVERGED', String(syncStatus === 'DIVERGED'));
line('DIRTY_PATHS', String(porcelain.length));
line('FETCH', fetchStatus);
line('UNFINISHED_GIT_OPS', unfinishedOperations.length ? unfinishedOperations.join(', ') : 'none');
line(
  'PRIMARY_WORKTREE_STATUS',
  PRIMARY_WORKTREE_STATUS + (primaryWorktree ? ` (${primaryWorktree.path})` : ''),
);
line('TASK_WORKTREE_STATUS', TASK_WORKTREE_STATUS);
line('UNEXPLAINED_DIRTY_FILES', String(unexplainedDirtyFiles.length + orphanedSessionStubs.length));
line('OTHER_DIRTY_WORKTREES', String(otherDirtyWorktrees.length));
line('STALE_WORKTREES', String(report.staleWorktrees.length));
line('STALE_BRANCHES', String(staleBranches.length));

if (primaryDirtyFiles.length) {
  console.log('');
  console.log('  Primary worktree — every dirty path and who owns it:');
  for (const file of primaryDirtyFiles) {
    console.log(`    ${file.owner.padEnd(22)} ${file.classification.padEnd(24)} ${file.path}`);
  }
  if (unexplainedDirtyFiles.length || orphanedSessionStubs.length) {
    console.log('');
    console.log('  UNKNOWN ownership blocks completion. Classify each path before finishing:');
    console.log('  it is the user\'s own work, another session\'s, a generator\'s output that');
    console.log('  must be committed, or a mistake. Never reset the set to make it go away.');
  }
}

if (otherDirtyWorktrees.length) {
  console.log('');
  console.log('  Other dirty worktrees — REPORT ONLY, never clean these:');
  for (const worktree of otherDirtyWorktrees) {
    console.log(
      `    ${worktree.path} — ${worktree.branch ?? 'detached'}, ${worktree.dirtyPaths} path(s)` +
        `${worktree.session ? `, ${worktree.session}` : ', no session record'}`,
    );
  }
}

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
