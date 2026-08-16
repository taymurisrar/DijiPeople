/*
 * Live coordination state shared by every concurrent Architect session.
 *
 * The framework keeps two kinds of state, and the split is the whole design:
 *
 *   **Durable narrative state** is Git-tracked — `docs/sessions/`,
 *   `docs/tasks/`, `docs/bugs/`. It survives the machine, syncs to Obsidian,
 *   and is reviewable in a diff.
 *
 *   **Live coordination state** is *not* Git-tracked and lives here, under the
 *   repository's shared Git directory. Who holds the schema write lease right
 *   now, which task is mid-integration, which ids are reserved — none of that
 *   belongs in a commit. Putting it in the working tree would make every
 *   session's ordinary bookkeeping a merge conflict in every other session's
 *   branch, and would still not be visible until somebody pushed.
 *
 * `git rev-parse --git-common-dir` is the key property: **every worktree of a
 * repository shares one**. A lease taken in `dijipeople-framework/` is visible
 * instantly in `dijipeople-bugs/`, with no fetch, no commit and no push. That is
 * exactly the visibility multi-session safety needs, and it is why this is not
 * a file in `docs/`.
 *
 * No dependencies.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** How long a lock may be held before another process may break it. */
export const LOCK_STALE_MS = 60_000;

/**
 * How long a session may go without a heartbeat before its leases are
 * considered abandoned. Deliberately generous: a session that is thinking, or
 * waiting on CI, is still alive, and stealing its schema lease because it went
 * quiet for a minute is worse than waiting.
 */
export const HEARTBEAT_STALE_MS = 45 * 60_000;

function git(root, args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return fallback;
  }
}

/**
 * The directory every worktree of this repository shares.
 *
 * Falls back to `.git` rather than to a temp directory: losing cross-worktree
 * visibility silently is the failure this module exists to prevent, so the
 * fallback must at least stay inside the repository where it is noticeable.
 */
export function stateDir(root) {
  const common = git(root, ['rev-parse', '--git-common-dir'], '.git') || '.git';
  const dir = resolve(root, common, 'dijipeople');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function statePath(root, name) {
  return join(stateDir(root), name);
}

export function readJson(root, name, fallback) {
  const path = statePath(root, name);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    /*
     * Never silently substitute the fallback for a corrupt file. For the id
     * ledger that would lower the allocation ceiling and hand out a live id; for
     * the lease table it would report a held resource as free. Both are exactly
     * the failure these files prevent, so an unreadable file stops the caller.
     */
    throw new Error(
      `agent state file is unreadable: ${path} — ${String(error.message).split('\n')[0]}\n` +
        'Refusing to continue: an unreadable coordination file cannot be proven empty.',
    );
  }
}

export function writeJson(root, name, value) {
  writeFileSync(statePath(root, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * A cross-process, cross-worktree mutex.
 *
 * Built on `mkdir`, which is atomic on every filesystem this repository runs
 * on. A directory rather than a file so a stale lock is inspectable — the owner
 * pid, session and timestamp sit inside it, which is what makes breaking one a
 * decision rather than a guess.
 */
export function acquireLock(root, name, { timeoutMs = 10_000, sessionId = '' } = {}) {
  const lock = join(stateDir(root), `${name}.lock`);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(
        join(lock, 'owner.json'),
        JSON.stringify({ pid: process.pid, sessionId, at: new Date().toISOString() }),
        'utf8',
      );
      return lock;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let age = 0;
      let owner = null;
      try {
        owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
        age = Date.now() - Date.parse(owner.at);
      } catch {
        /* A lock with no readable owner cannot be waited on meaningfully. */
        age = LOCK_STALE_MS + 1;
      }

      /*
       * A crashed holder would otherwise wedge every future session. Break the
       * lock only when it is provably older than any critical section here could
       * take — these hold it for milliseconds.
       */
      if (age > LOCK_STALE_MS) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }

      if (Date.now() > deadline) {
        throw new Error(
          `could not acquire the ${name} lock within ${timeoutMs}ms (${lock}).\n` +
            `Held by pid ${owner?.pid ?? 'unknown'}${owner?.sessionId ? ` / ${owner.sessionId}` : ''} ` +
            `since ${owner?.at ?? 'unknown'}.\n` +
            'Retry. Do not delete the lock by hand — that is how two writers end up inside it.',
        );
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

export function releaseLock(lock) {
  rmSync(lock, { recursive: true, force: true });
}

/** Run `fn` while holding `name`, releasing it however `fn` ends. */
export function withLock(root, name, fn, options = {}) {
  const lock = acquireLock(root, name, options);
  try {
    return fn();
  } finally {
    releaseLock(lock);
  }
}

export function isStale(isoTimestamp, windowMs = HEARTBEAT_STALE_MS) {
  const at = Date.parse(isoTimestamp ?? '');
  if (Number.isNaN(at)) return true;
  return Date.now() - at > windowMs;
}
