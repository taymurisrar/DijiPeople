#!/usr/bin/env node
/*
 * The multi-session control surface.
 *
 * A user may have several Architect chats open at once. Each is a session, and
 * sessions must not plan over each other's ground, allocate each other's ids, or
 * write a shared branch at the same moment. This command is how a session
 * announces itself, sees the others, takes write leases, and queues for
 * integration.
 *
 *   node scripts/session.mjs start "<title>" --type FEATURE --size LARGE \
 *        --branch agent/<feature> --task TASK-0004 --modules payroll,attendance
 *   node scripts/session.mjs list [--json]
 *   node scripts/session.mjs check --paths services/api/prisma/schema.prisma,apps/web/…
 *   node scripts/session.mjs heartbeat SESSION-0001
 *   node scripts/session.mjs lease acquire schema --session SESSION-0001 --reason "add ProbationReview"
 *   node scripts/session.mjs lease release schema --session SESSION-0001
 *   node scripts/session.mjs queue add --session SESSION-0001 --branch agent/x --sha <sha>
 *   node scripts/session.mjs queue next
 *   node scripts/session.mjs queue claim --branch agent/x
 *   node scripts/session.mjs queue done --branch agent/x
 *   node scripts/session.mjs finish SESSION-0001
 *
 * Exit codes: 0 done · 1 refused (a lease is held, the queue is busy) · 2 usage
 *
 * `--json` is available on every read command, because the Architect consumes
 * these programmatically and a human reads the same data one screen at a time.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEASED_RESOURCES,
  acquireLease,
  activeSessions,
  classifyOverlap,
  enqueue,
  finishSession,
  heartbeat,
  liveLeases,
  nextIntegration,
  readQueue,
  registerSession,
  releaseLease,
  resourcesFor,
  staleLeases,
  updateQueueEntry,
  updateSession,
} from './lib/session-registry.mjs';
import { SESSION_DIR, nextSessionId, slugify } from './lib/session-records.mjs';

const argv = process.argv.slice(2);

/*
 * `--root` exists so the behavioural simulations can drive this script against a
 * throwaway repository. Without it the PRIMARY_WORKTREE_ARTIFACT warning below
 * could only be asserted by grepping this file — and a mutation that set the
 * flag to a constant `false` survived exactly that check.
 */
const rootIndex = argv.indexOf('--root');
const ROOT =
  rootIndex === -1
    ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
    : resolve(argv[rootIndex + 1] ?? '.');

const command = argv[0];
const positional = argv.slice(1).filter((arg) => !arg.startsWith('--'));

const flag = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
};
const has = (name) => argv.includes(`--${name}`);
const asJson = has('json');
const list = (name) => flag(name).split(',').map((entry) => entry.trim()).filter(Boolean);

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function usage(code = 2) {
  console.error('Usage: node scripts/session.mjs <command> [options]');
  console.error('');
  console.error('  start "<title>"   register a session and write its durable record');
  console.error('  list              active sessions, live leases and the merge queue');
  console.error('  check             classify proposed work against everything in flight');
  console.error('  heartbeat <id>    keep the session and its leases alive');
  console.error('  lease <acquire|release|list> <resource>');
  console.error('  queue <add|next|claim|validating|done|list>');
  console.error('  finish <id>       release every lease and mark the session terminal');
  console.error('');
  console.error(`  leased resources: ${Object.keys(LEASED_RESOURCES).join(', ')}`);
  process.exit(code);
}

/* ------------------------------------------------------------------ start */

function start() {
  const title = positional[0];
  if (!title) usage();

  const type = flag('type', 'FEATURE').toUpperCase();
  const size = flag('size', 'MEDIUM').toUpperCase();
  const branch = flag('branch', git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown'));

  /*
   * `develop` unless the session is explicitly a production release. This
   * default is the branch-model rule expressed where it is actually applied —
   * a default of `main` would make every ordinary task a potential deployment.
   */
  const productionTask = ['RELEASE', 'DEPLOY', 'HOTFIX_PRODUCTION'].includes(type);
  const target = flag('target', productionTask ? 'main' : 'develop');

  const baseBranch = flag('base', 'origin/develop');
  const baseSha = git(['rev-parse', baseBranch], git(['rev-parse', 'HEAD'], 'unknown'));
  const sessionId = nextSessionId(ROOT, { note: title });
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const modules = list('modules');
  const paths = list('paths');

  const fields = [
    '---',
    `SESSION_ID: ${sessionId}`,
    `aliases: [${sessionId}]`,
    `TASK_ID: ${flag('task')}`,
    `TITLE: ${title}`,
    `ARCHITECT_INTENT: ${flag('intent', title)}`,
    'STATUS: ACTIVE',
    `TASK_TYPE: ${type}`,
    `TASK_SIZE: ${size}`,
    `BASE_BRANCH: ${baseBranch}`,
    `BASE_SHA: ${baseSha}`,
    `TASK_BRANCH: ${branch}`,
    `TARGET_BRANCH: ${target}`,
    `WORKTREE: ${ROOT.replace(/\\/g, '/')}`,
    `AFFECTED_MODULES: [${modules.join(', ')}]`,
    'WRITE_LEASES: []',
    'ACTIVE_WORK_PACKAGES: []',
    `SCHEMA_WRITE: ${resourcesFor(paths).includes('schema') ? 'YES' : 'NO'}`,
    'CI_STATUS: NOT_RUN',
    'MERGE_STATUS: NOT_STARTED',
    `STARTED_AT: ${now}`,
    `LAST_HEARTBEAT: ${now}`,
    'BLOCKERS: none',
    '---',
  ]
    /*
     * An unset field would otherwise emit `TASK_ID: ` with a trailing space,
     * which `git diff --check` reports as a whitespace error on every session
     * record that has no parent task. Trimming here rather than at each
     * interpolation keeps the list readable and covers fields added later.
     */
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');

  const body = [
    `# ${sessionId} — ${title}`,
    '',
    '## Intent',
    '',
    flag('intent', title),
    '',
    '## Scope',
    '',
    modules.length ? modules.map((module) => `- ${module}`).join('\n') : '_To be established during planning._',
    '',
    '## Concurrency',
    '',
    'Write leases held, overlap classification against other active sessions, and',
    'anything this session deliberately serialised behind another. Live state:',
    '`node scripts/session.mjs list`.',
    '',
    '## History',
    '',
    `- ${today} — session started from \`${baseBranch}\` at \`${baseSha.slice(0, 7)}\`.`,
    '',
  ].join('\n');

  const path = join(ROOT, SESSION_DIR, `${sessionId}-${slugify(title)}.md`);
  if (existsSync(path)) {
    console.error(`${path} already exists — refusing to overwrite.`);
    process.exit(1);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${fields}\n\n${body}`, 'utf8');

  registerSession(ROOT, {
    sessionId,
    taskId: flag('task'),
    title,
    taskType: type,
    taskSize: size,
    branch,
    target,
    baseBranch,
    baseSha,
    worktree: ROOT.replace(/\\/g, '/'),
    modules,
    paths,
  });

  const overlap = classifyOverlap(ROOT, { sessionId, paths });

  /*
   * Where did this record actually land?
   *
   * ROOT is this script's own checkout, so `node scripts/session.mjs start` run
   * from the user's primary worktree writes the record *there* — and then the
   * session creates its task worktree, does all its work in it, commits the real
   * record from there, and never comes back. The stub is left behind untracked,
   * invisible to every check that only ever looked at the task worktree, until
   * the user opens GitHub Desktop and finds files nobody can explain.
   *
   * That is not hypothetical: SESSION-0015 and SESSION-0016 both did exactly
   * this, and SESSION-0016's abandoned stub sat in the primary checkout while
   * its real record — same SESSION_ID, same STARTED_AT, richer content — was
   * committed from `wt-framework`.
   */
  const primaryWorktree = (() => {
    const first = git(['worktree', 'list', '--porcelain']).split(/\r?\n/)[0] ?? '';
    return first.startsWith('worktree ') ? first.slice('worktree '.length) : '';
  })();
  const normalise = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const wroteIntoPrimary = primaryWorktree && normalise(primaryWorktree) === normalise(ROOT);
  const checkedOutBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');
  const strandedInPrimary = Boolean(wroteIntoPrimary && branch !== checkedOutBranch);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          sessionId,
          path: path.replace(ROOT, '.'),
          target,
          overlap,
          worktree: ROOT.replace(/\\/g, '/'),
          PRIMARY_WORKTREE_ARTIFACT: strandedInPrimary,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`${sessionId} started.`);
    console.log(`  record   ${SESSION_DIR}/${sessionId}-${slugify(title)}.md`);
    console.log(`  worktree ${ROOT.replace(/\\/g, '/')}`);
    console.log(`  branch   ${branch}`);
    console.log(`  target   ${target}${target === 'main' ? '  ← production branch' : ''}`);
    console.log(`  base     ${baseBranch} @ ${baseSha.slice(0, 7)}`);
    console.log(`  overlap  ${overlap.classification}`);
    for (const reason of overlap.reasons) console.log(`           ${reason}`);
    console.log('');

    if (strandedInPrimary) {
      console.log('  PRIMARY_WORKTREE_ARTIFACT');
      console.log('');
      console.log(`  This record was written into the PRIMARY checkout (${primaryWorktree}),`);
      console.log(`  which has ${checkedOutBranch} checked out — but this session works on ${branch}.`);
      console.log('  Left as-is it becomes an untracked file in the user\'s own workspace that no');
      console.log('  task-worktree check will ever see. Before doing any other work:');
      console.log('');
      console.log(`    1. create the task worktree for ${branch}`);
      console.log('    2. move this record into it, or re-run `start` from inside it');
      console.log('    3. confirm the primary checkout is clean again');
      console.log('');
      console.log('  Verify with: node scripts/repo-health.mjs --task-branch <branch>');
      console.log('');
    }

    console.log('Next: node scripts/rebuild-sessions.mjs');
  }
}

/* ------------------------------------------------------------------- list */

function showList() {
  const sessions = activeSessions(ROOT);
  const leases = liveLeases(ROOT);
  const stale = staleLeases(ROOT);
  const queue = readQueue(ROOT);
  const { ready, inFlight } = nextIntegration(ROOT);

  if (asJson) {
    console.log(JSON.stringify({ sessions, leases, staleLeases: stale, queue, ready, inFlight }, null, 2));
    return;
  }

  console.log('');
  console.log(`Active sessions: ${sessions.length}`);
  for (const session of sessions) {
    console.log(
      `  ${session.sessionId}  ${session.status.padEnd(11)} ${String(session.branch).padEnd(38)} → ${session.target}` +
        `${session.stale ? '  (heartbeat stale)' : ''}`,
    );
    if (session.title) console.log(`             ${session.title}`);
  }
  if (!sessions.length) console.log('  none');

  console.log('');
  console.log(`Write leases held: ${leases.length}`);
  for (const lease of leases) {
    console.log(
      `  ${lease.resource.padEnd(20)} ${lease.sessionId}${lease.exclusiveGlobally ? '  [single-writer across all sessions]' : ''}`,
    );
    if (lease.reason) console.log(`  ${' '.repeat(20)} ${lease.reason}`);
  }
  if (!leases.length) console.log('  none');
  if (stale.length) {
    console.log('');
    console.log(`  ${stale.length} lease(s) whose owner stopped heartbeating — reported, not stolen:`);
    for (const lease of stale) console.log(`    ${lease.resource} — ${lease.sessionId} since ${lease.heartbeatAt}`);
  }

  const databaseWriter = leases.find((lease) => lease.resource === 'schema');
  console.log('');
  console.log(`DATABASE_WRITER: ${databaseWriter ? databaseWriter.sessionId : 'none'}`);

  console.log('');
  console.log(`Develop merge queue: ${queue.length}`);
  for (const item of queue) {
    console.log(`  ${String(item.status).padEnd(12)} ${item.branch}  ${item.sessionId ?? ''}`);
  }
  if (!queue.length) console.log('  empty');
  if (inFlight) console.log(`  INTEGRATING NOW: ${inFlight.branch} — no other session may write ${inFlight.target}`);
  else if (ready) console.log(`  next to integrate: ${ready.branch}`);
  console.log('');
}

/* ------------------------------------------------------------------ check */

function check() {
  const result = classifyOverlap(ROOT, {
    sessionId: flag('session'),
    paths: list('paths'),
    baseSha: flag('base-sha'),
    targetSha: flag('target-sha'),
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('');
    console.log(`OVERLAP: ${result.classification}`);
    console.log(`  leased resources touched: ${result.wantedResources.join(', ') || 'none'}`);
    console.log(`  other active sessions:    ${result.activeSessions}`);
    for (const reason of result.reasons) console.log(`  - ${reason}`);
    if (result.classification === 'SAFE_PARALLEL') {
      console.log('  Nothing in flight conflicts. Proceed.');
    } else {
      console.log('');
      console.log('  A blocked resource never stops an independent work package — take a');
      console.log('  different package rather than waiting. See .agent/context/multi-session.md.');
    }
    console.log('');
  }

  process.exit(result.classification === 'SAFE_PARALLEL' ? 0 : 1);
}

/* ----------------------------------------------------------------- leases */

function lease() {
  const action = positional[0];
  const resource = positional[1];
  const sessionId = flag('session');

  if (action === 'list') {
    const leases = liveLeases(ROOT);
    if (asJson) console.log(JSON.stringify({ leases }, null, 2));
    else for (const entry of leases) console.log(`${entry.resource}\t${entry.sessionId}\t${entry.reason}`);
    return;
  }

  if (!resource || !sessionId) usage();

  if (action === 'acquire') {
    const result = acquireLease(ROOT, {
      resource,
      sessionId,
      taskId: flag('task'),
      mode: flag('mode', 'write'),
      reason: flag('reason'),
    });
    if (asJson) console.log(JSON.stringify(result, null, 2));
    else if (result.granted) console.log(`LEASE_GRANTED ${resource} → ${sessionId}`);
    else {
      console.error(`LEASE_DENIED ${resource} — held by ${result.lease.sessionId} since ${result.lease.acquiredAt}`);
      console.error(result.lease.reason ? `  their reason: ${result.lease.reason}` : '');
      console.error('  Do not wait. Run an independent work package and retry later.');
    }
    process.exit(result.granted ? 0 : 1);
  }

  if (action === 'release') {
    const count = releaseLease(ROOT, resource, sessionId);
    console.log(count ? `LEASE_RELEASED ${resource}` : `no lease on ${resource} held by ${sessionId}`);
    return;
  }

  usage();
}

/* ------------------------------------------------------------------ queue */

function queue() {
  const action = positional[0] ?? 'list';

  if (action === 'add') {
    const entry = enqueue(ROOT, {
      sessionId: flag('session'),
      taskId: flag('task'),
      branch: flag('branch', git(['rev-parse', '--abbrev-ref', 'HEAD'], '')),
      sha: flag('sha', git(['rev-parse', 'HEAD'], '')),
      target: flag('target', 'develop'),
    });
    console.log(asJson ? JSON.stringify(entry, null, 2) : `QUEUED ${entry.branch} → ${entry.target}`);
    return;
  }

  if (action === 'next') {
    const result = nextIntegration(ROOT);
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.inFlight) {
      console.log(`INTEGRATION_IN_PROGRESS ${result.inFlight.branch} (${result.inFlight.status})`);
      console.log('Only one session may write a shared branch at a time. Wait, or run another package.');
    } else if (result.ready) {
      console.log(`READY ${result.ready.branch}`);
    } else {
      console.log('QUEUE_EMPTY');
    }
    process.exit(result.inFlight ? 1 : 0);
  }

  if (action === 'claim') {
    /*
     * Claiming is the integration lock. It fails when something else is already
     * integrating, which is the whole point: two sessions pushing `develop`
     * concurrently either reject noisily or fast-forward over a state the other
     * had already validated against.
     */
    const branch = flag('branch');
    const { inFlight } = nextIntegration(ROOT);
    if (inFlight && inFlight.branch !== branch) {
      console.error(`INTEGRATION_LOCK_HELD by ${inFlight.branch} (${inFlight.status})`);
      process.exit(1);
    }
    const entry = updateQueueEntry(ROOT, branch, { status: 'INTEGRATING' });
    console.log(asJson ? JSON.stringify(entry, null, 2) : `INTEGRATING ${branch}`);
    return;
  }

  if (action === 'validating') {
    const entry = updateQueueEntry(ROOT, flag('branch'), { status: 'VALIDATING' });
    console.log(asJson ? JSON.stringify(entry, null, 2) : `VALIDATING ${entry.branch}`);
    return;
  }

  if (action === 'done') {
    const entry = updateQueueEntry(ROOT, flag('branch'), {
      status: 'DONE',
      mergedSha: flag('sha'),
    });
    console.log(asJson ? JSON.stringify(entry, null, 2) : `DONE ${entry.branch}`);
    return;
  }

  if (action === 'block') {
    const entry = updateQueueEntry(ROOT, flag('branch'), { status: 'BLOCKED', blockReason: flag('reason') });
    console.log(asJson ? JSON.stringify(entry, null, 2) : `BLOCKED ${entry.branch} — ${flag('reason')}`);
    return;
  }

  if (action === 'list') {
    const entries = readQueue(ROOT);
    if (asJson) console.log(JSON.stringify({ queue: entries }, null, 2));
    else for (const item of entries) console.log(`${item.status}\t${item.branch}\t${item.sessionId ?? ''}`);
    return;
  }

  usage();
}

/* ---------------------------------------------------------------- dispatch */

try {
  switch (command) {
    case 'start':
      start();
      break;
    case 'list':
      showList();
      break;
    case 'check':
      check();
      break;
    case 'heartbeat': {
      const id = positional[0] || flag('session');
      if (!id) usage();
      const updated = heartbeat(ROOT, id);
      console.log(asJson ? JSON.stringify(updated, null, 2) : `HEARTBEAT ${id} ${updated.lastHeartbeat}`);
      break;
    }
    case 'status': {
      const id = positional[0] || flag('session');
      if (!id) usage();
      const updated = updateSession(ROOT, id, { status: flag('set', 'ACTIVE').toUpperCase() });
      console.log(asJson ? JSON.stringify(updated, null, 2) : `${id} → ${updated.status}`);
      break;
    }
    case 'lease':
      lease();
      break;
    case 'queue':
      queue();
      break;
    case 'finish': {
      const id = positional[0] || flag('session');
      if (!id) usage();
      const result = finishSession(ROOT, id, { status: flag('status', 'COMPLETE').toUpperCase() });
      if (asJson) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`${id} → ${result.session.status}`);
        console.log(`  released leases: ${result.releasedLeases.join(', ') || 'none'}`);
        console.log('  Update the durable record under docs/sessions/, then rebuild-sessions.');
      }
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(String(error.message));
  process.exit(1);
}
