/*
 * The live registry: which Architect sessions are running right now, what they
 * hold, and who may write a shared branch.
 *
 * Three tables, all in the shared Git directory (see `agent-state.mjs` for why
 * that and not `docs/`):
 *
 *   sessions.json     one entry per live session — heartbeat, branch, worktree
 *   leases.json       write leases on high-risk shared resources
 *   merge-queue.json  the serialised integration queue for `develop`
 *
 * The durable, Git-tracked half of a session lives in `docs/sessions/` and is
 * handled by `session-records.mjs`. This file is the part that must be true
 * *now*, across worktrees, without anybody having committed anything.
 *
 * No dependencies.
 */

import { HEARTBEAT_STALE_MS, isStale, readJson, withLock, writeJson } from './agent-state.mjs';

const SESSIONS = 'sessions.json';
const LEASES = 'leases.json';
const QUEUE = 'merge-queue.json';

// ------------------------------------------------------------------ resources

/**
 * The shared resources a write lease covers.
 *
 * These are the files where two sessions editing concurrently produces a
 * conflict that is *silent* rather than loud — a merged `schema.prisma` that
 * compiles but describes a database nobody intended, a permission registry
 * where one side's keys vanished, a generated index that now disagrees with its
 * records. Ordinary source files are not here on purpose: leasing everything
 * would serialise all work and teach agents to bypass the lease.
 *
 * `paths` are prefixes matched against repository-relative paths.
 */
export const LEASED_RESOURCES = {
  schema: {
    title: 'Prisma schema and migrations',
    paths: ['services/api/prisma/schema.prisma', 'services/api/prisma/migrations/'],
    /*
     * The database is single-writer across ALL sessions, not merely
     * single-writer per session. Two migration directories created in parallel
     * apply in timestamp order on a fresh database and in creation order on a
     * developer's, which is how a migration history stops being reproducible.
     */
    exclusiveGlobally: true,
  },
  permissions: {
    title: 'Authorization registries',
    paths: [
      'services/api/src/common/constants/permissions.ts',
      'services/api/src/common/constants/rbac-matrix.ts',
      'services/api/src/common/security/',
      'services/api/src/common/guards/',
    ],
    exclusiveGlobally: false,
  },
  'runtime-registries': {
    title: 'Runtime module and metadata registries',
    paths: [
      'apps/web/lib/runtime/',
      'apps/admin/app/_lib/runtime/',
      'packages/config/platform-runtime-schema.generated.json',
    ],
    exclusiveGlobally: false,
  },
  workspace: {
    title: 'Workspace and build configuration',
    paths: ['package.json', 'package-lock.json', 'turbo.json'],
    exclusiveGlobally: false,
  },
  ci: {
    title: 'CI workflows',
    paths: ['.github/workflows/'],
    exclusiveGlobally: false,
  },
  framework: {
    title: 'Agent framework definition',
    paths: ['.agent/', 'AGENTS.md', 'PLANS.md'],
    exclusiveGlobally: false,
  },
  'record-indexes': {
    title: 'Generated backlog, bug and task indexes',
    paths: [
      'docs/backlog/index.md',
      'docs/backlog/open.md',
      'docs/backlog/blocked.md',
      'docs/backlog/deferred.md',
      'docs/backlog/completed.md',
      'docs/backlog/product-decisions.md',
      'docs/tasks/index.md',
      'docs/tasks/active.md',
      'docs/tasks/blocked.md',
      'docs/tasks/completed.md',
      'docs/qa/coverage-matrix.md',
      'docs/knowledge/dashboards/',
    ],
    exclusiveGlobally: false,
  },
  deployment: {
    title: 'Deployment configuration',
    paths: ['render.yaml', 'docs/deployment/', '.github/workflows/deploy'],
    exclusiveGlobally: false,
  },
};

/** Which leased resources a set of repository-relative paths touches. */
export function resourcesFor(paths) {
  const hits = new Set();
  for (const raw of paths) {
    const path = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
    for (const [key, spec] of Object.entries(LEASED_RESOURCES)) {
      if (spec.paths.some((prefix) => path === prefix || path.startsWith(prefix))) hits.add(key);
    }
  }
  return [...hits];
}

// ------------------------------------------------------------------ sessions

export const SESSION_STATUSES = [
  'ACTIVE',
  'BLOCKED',
  'INTEGRATING',
  'COMPLETE',
  'ABANDONED',
];

export function readSessions(root) {
  const entries = readJson(root, SESSIONS, []);
  return Array.isArray(entries) ? entries : [];
}

/**
 * Sessions that are still running.
 *
 * A session whose heartbeat has gone stale is reported but **not** deleted:
 * "probably dead" and "definitely finished" are different facts, and quietly
 * dropping the first one releases leases a live-but-busy session still needs.
 */
export function activeSessions(root, { includeStale = true } = {}) {
  return readSessions(root)
    .filter((session) => !['COMPLETE', 'ABANDONED'].includes(session.status))
    .map((session) => ({ ...session, stale: isStale(session.lastHeartbeat) }))
    .filter((session) => includeStale || !session.stale);
}

export function registerSession(root, session) {
  return withLock(root, 'sessions', () => {
    const sessions = readSessions(root).filter((entry) => entry.sessionId !== session.sessionId);
    const entry = {
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      ...session,
      lastHeartbeat: new Date().toISOString(),
      pid: process.pid,
    };
    sessions.push(entry);
    writeJson(root, SESSIONS, sessions);
    return entry;
  });
}

export function updateSession(root, sessionId, patch) {
  return withLock(root, 'sessions', () => {
    const sessions = readSessions(root);
    const index = sessions.findIndex((entry) => entry.sessionId === sessionId);
    if (index === -1) throw new Error(`unknown session: ${sessionId}`);
    sessions[index] = { ...sessions[index], ...patch, lastHeartbeat: new Date().toISOString() };
    writeJson(root, SESSIONS, sessions);
    return sessions[index];
  });
}

export function heartbeat(root, sessionId) {
  return updateSession(root, sessionId, {});
}

/**
 * Finish a session: mark it terminal and drop every lease it held.
 *
 * Releasing leases here rather than expecting the caller to is deliberate — a
 * session that ends while holding the schema lease blocks every future database
 * task until somebody works out what happened.
 */
export function finishSession(root, sessionId, { status = 'COMPLETE' } = {}) {
  const released = releaseAllLeases(root, sessionId);
  const session = withLock(root, 'sessions', () => {
    const sessions = readSessions(root);
    const index = sessions.findIndex((entry) => entry.sessionId === sessionId);
    if (index === -1) throw new Error(`unknown session: ${sessionId}`);
    sessions[index] = {
      ...sessions[index],
      status,
      finishedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };
    writeJson(root, SESSIONS, sessions);
    return sessions[index];
  });
  dequeue(root, { sessionId });
  return { session, releasedLeases: released };
}

// -------------------------------------------------------------------- leases

export function readLeases(root) {
  const entries = readJson(root, LEASES, []);
  return Array.isArray(entries) ? entries : [];
}

/**
 * Leases held by a session that is still alive.
 *
 * Staleness is judged on the *lease* heartbeat, not on the session record, so a
 * lease survives exactly as long as its owner keeps saying it needs it.
 */
export function liveLeases(root) {
  return readLeases(root).filter((lease) => !isStale(lease.heartbeatAt, HEARTBEAT_STALE_MS));
}

export function staleLeases(root) {
  return readLeases(root).filter((lease) => isStale(lease.heartbeatAt, HEARTBEAT_STALE_MS));
}

/**
 * Take a write lease, or report who holds it.
 *
 * Never blocks and never steals. A caller that cannot get the lease is expected
 * to run a different work package — which is the behaviour the orchestration
 * rules require anyway, and is strictly better than waiting.
 */
export function acquireLease(root, { resource, sessionId, taskId = '', mode = 'write', reason = '' }) {
  if (!LEASED_RESOURCES[resource]) {
    throw new Error(
      `unknown leased resource "${resource}". Known: ${Object.keys(LEASED_RESOURCES).join(', ')}`,
    );
  }

  return withLock(root, 'leases', () => {
    const leases = readLeases(root).filter(
      (lease) => !isStale(lease.heartbeatAt, HEARTBEAT_STALE_MS),
    );

    /* Reading is never coordinated — only writing is. */
    if (mode === 'read') {
      return { granted: true, lease: null, reason: 'reads are never leased' };
    }

    const held = leases.find((lease) => lease.resource === resource && lease.mode === 'write');
    if (held && held.sessionId !== sessionId) {
      return { granted: false, lease: held, reason: 'held by another session' };
    }

    const lease = {
      resource,
      sessionId,
      taskId,
      mode,
      reason,
      acquiredAt: held?.acquiredAt ?? new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      exclusiveGlobally: Boolean(LEASED_RESOURCES[resource].exclusiveGlobally),
    };

    writeJson(root, LEASES, [...leases.filter((entry) => entry.resource !== resource || entry.sessionId !== sessionId), lease]);
    return { granted: true, lease, reason: held ? 're-acquired by the same session' : 'granted' };
  });
}

export function releaseLease(root, resource, sessionId) {
  return withLock(root, 'leases', () => {
    const leases = readLeases(root);
    const remaining = leases.filter(
      (lease) => !(lease.resource === resource && lease.sessionId === sessionId),
    );
    writeJson(root, LEASES, remaining);
    return leases.length - remaining.length;
  });
}

export function releaseAllLeases(root, sessionId) {
  return withLock(root, 'leases', () => {
    const leases = readLeases(root);
    const released = leases.filter((lease) => lease.sessionId === sessionId);
    writeJson(root, LEASES, leases.filter((lease) => lease.sessionId !== sessionId));
    return released.map((lease) => lease.resource);
  });
}

// ------------------------------------------------------------- classification

export const OVERLAP_CLASSES = [
  'SAFE_PARALLEL',
  'SERIALIZE',
  'DEPENDENCY_WAIT',
  'SHARED_FILE_CONFLICT',
  'REBASE_REQUIRED',
  'BLOCKED_BY_ACTIVE_SESSION',
];

/**
 * Classify a proposed piece of work against everything currently in flight.
 *
 * The Architect runs this before planning. It answers one question — may this
 * start now, and if not, what is in the way — and it answers it from live
 * state rather than from what the last report said.
 *
 * `SERIALIZE` versus `BLOCKED_BY_ACTIVE_SESSION` is the distinction that
 * matters: the first means "wait for the lease, then proceed"; the second means
 * "another session owns this ground and you must not plan around it".
 */
export function classifyOverlap(root, { sessionId, paths = [], baseSha = '', targetSha = '' }) {
  const wanted = resourcesFor(paths);
  const leases = liveLeases(root).filter((lease) => lease.sessionId !== sessionId);
  const sessions = activeSessions(root).filter((entry) => entry.sessionId !== sessionId);

  const conflicts = leases.filter((lease) => wanted.includes(lease.resource) && lease.mode === 'write');
  const globalConflicts = conflicts.filter((lease) => lease.exclusiveGlobally);

  let classification = 'SAFE_PARALLEL';
  const reasons = [];

  if (globalConflicts.length) {
    classification = 'BLOCKED_BY_ACTIVE_SESSION';
    for (const lease of globalConflicts) {
      reasons.push(
        `${lease.resource} is single-writer across all sessions and is held by ${lease.sessionId}` +
          `${lease.taskId ? ` (${lease.taskId})` : ''}`,
      );
    }
  } else if (conflicts.length) {
    classification = 'SERIALIZE';
    for (const lease of conflicts) {
      reasons.push(`${lease.resource} is leased by ${lease.sessionId}${lease.reason ? ` — ${lease.reason}` : ''}`);
    }
  }

  /*
   * Two sessions editing the same ordinary file is not a lease matter, but it
   * is still one work item with one owner. Report it separately so the Architect
   * merges the packages rather than racing them.
   */
  const sharedFiles = [];
  for (const session of sessions) {
    const overlap = (session.paths ?? []).filter((path) => paths.includes(path));
    if (overlap.length) sharedFiles.push({ sessionId: session.sessionId, paths: overlap });
  }
  if (sharedFiles.length && classification === 'SAFE_PARALLEL') {
    classification = 'SHARED_FILE_CONFLICT';
    for (const entry of sharedFiles) {
      reasons.push(`${entry.sessionId} is already editing ${entry.paths.join(', ')}`);
    }
  }

  if (baseSha && targetSha && baseSha !== targetSha && classification === 'SAFE_PARALLEL') {
    classification = 'REBASE_REQUIRED';
    reasons.push(`base ${baseSha.slice(0, 7)} is behind the target ${targetSha.slice(0, 7)}`);
  }

  return {
    classification,
    reasons,
    wantedResources: wanted,
    conflictingLeases: conflicts,
    sharedFiles,
    activeSessions: sessions.length,
  };
}

// --------------------------------------------------------------- merge queue

export const QUEUE_STATUSES = ['QUEUED', 'READY', 'INTEGRATING', 'VALIDATING', 'DONE', 'BLOCKED'];

export function readQueue(root) {
  const entries = readJson(root, QUEUE, []);
  return Array.isArray(entries) ? entries : [];
}

export function enqueue(root, entry) {
  return withLock(root, 'merge-queue', () => {
    const queue = readQueue(root);
    const existing = queue.findIndex(
      (item) => item.branch === entry.branch && !['DONE'].includes(item.status),
    );
    const record = {
      status: 'QUEUED',
      enqueuedAt: new Date().toISOString(),
      target: 'develop',
      ...entry,
    };
    if (existing === -1) queue.push(record);
    else queue[existing] = { ...queue[existing], ...record };
    writeJson(root, QUEUE, queue);
    return record;
  });
}

export function updateQueueEntry(root, branch, patch) {
  return withLock(root, 'merge-queue', () => {
    const queue = readQueue(root);
    const index = queue.findIndex((item) => item.branch === branch && item.status !== 'DONE');
    if (index === -1) throw new Error(`branch not in the merge queue: ${branch}`);
    queue[index] = { ...queue[index], ...patch, updatedAt: new Date().toISOString() };
    writeJson(root, QUEUE, queue);
    return queue[index];
  });
}

export function dequeue(root, { branch = '', sessionId = '' } = {}) {
  return withLock(root, 'merge-queue', () => {
    const queue = readQueue(root);
    const remaining = queue.filter(
      (item) => !((branch && item.branch === branch) || (sessionId && item.sessionId === sessionId)),
    );
    writeJson(root, QUEUE, remaining);
    return queue.length - remaining.length;
  });
}

/**
 * The next branch that may integrate, and only if nothing is already
 * integrating.
 *
 * Two sessions pushing `develop` at the same moment is the failure this exists
 * to prevent: the second push either rejects (recoverable, noisy) or
 * fast-forwards over a state the first session had already validated against
 * (silent, and the validation is now about different code).
 */
export function nextIntegration(root) {
  const queue = readQueue(root);
  const inFlight = queue.find((item) => ['INTEGRATING', 'VALIDATING'].includes(item.status));
  if (inFlight) return { ready: null, inFlight };

  const waiting = queue
    .filter((item) => ['QUEUED', 'READY'].includes(item.status))
    .sort((a, b) => String(a.enqueuedAt).localeCompare(String(b.enqueuedAt)));

  return { ready: waiting[0] ?? null, inFlight: null };
}
