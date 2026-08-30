/*
 * Atomic durable-id allocation, safe across concurrent Architect sessions.
 *
 * Why this exists
 * ---------------
 * Every id in this framework was allocated as `max(ids visible in the working
 * tree) + 1`. That is correct for one agent on one branch and wrong for
 * everything else: two sessions working on two branches both see the same
 * highest id, both take the next one, and the collision only surfaces at merge
 * time. It has happened twice — see the commits titled "renumber colliding
 * record ids" and "(second occurrence)".
 *
 * The fix has three parts, and all three are necessary:
 *
 *   1. **Scan every ref, not the working tree.** An id allocated on a sibling
 *      branch is invisible to `readdirSync`. `git ls-tree` over every local and
 *      remote ref sees it.
 *   2. **Reserve before the record exists.** Between "decide on BUG-0048" and
 *      "write BUG-0048-….md" there is a window in which a second session sees
 *      nothing. A reservation ledger closes it.
 *   3. **Put the ledger where sibling worktrees share it.** `--git-common-dir`
 *      is one directory for every worktree of a repository, so a reservation
 *      taken in one worktree is immediately visible in the others. A file in
 *      the working tree would not be — that is the same blindness as (1).
 *
 * Reservations are never lowered and never expire on a timer. Burning an id
 * because a session aborted costs a gap in a sequence; reusing one costs a
 * merge conflict in a durable record, and then a renumber that invalidates
 * every link pointing at it.
 *
 * No dependencies.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readJson, stateDir, withLock, writeJson } from './agent-state.mjs';

export { stateDir };

/** The one file that must never be lost: every id this repository has spent. */
const LEDGER = 'id-reservations.json';

// ------------------------------------------------------------------- kinds

/**
 * Every durable numbered id this framework allocates.
 *
 * `dir` is scanned in the working tree **and** in every ref. `scoped` kinds
 * take a scope segment (`QA-AUTH-001`), so the sequence is per-scope.
 * `contentOf` kinds live as sections inside one file rather than as one file
 * each, so they are found by scanning that file's text.
 */
export const ID_KINDS = {
  bug: { prefix: 'BUG', dir: 'docs/bugs', width: 4 },
  item: { prefix: 'ITEM', dir: 'docs/backlog/items', width: 4 },
  backlog: { prefix: 'ITEM', dir: 'docs/backlog/items', width: 4 },
  task: { prefix: 'TASK', dir: 'docs/tasks', width: 4 },
  session: { prefix: 'SESSION', dir: 'docs/sessions', width: 4 },
  adr: { prefix: 'ADR', dir: 'docs/decisions', width: 4 },
  /*
   * A question raised by a specialist and routed to the user. Numbered like
   * every other durable record because the answer becomes a decision that later
   * tasks retrieve by id — an unnumbered question cannot be pointed at from the
   * work package that is waiting on it.
   */
  question: { prefix: 'QUESTION', dir: 'docs/questions', width: 4 },
  scenario: { prefix: 'QA', dir: 'docs/qa/scenarios', width: 3, scoped: true },
  plan: {
    prefix: 'PLAN',
    /* Both families hold PLAN- numbers — BUG-2413. */
    dir: ['docs/qa/test-plans', 'docs/plans'],
    idsInContentOf: ['docs/plans'],
    width: 3,
  },
  regression: {
    prefix: 'REG',
    dir: 'docs/qa/regressions',
    width: 3,
    contentOf: 'docs/qa/regressions/index.md',
  },
};

/**
 * Records named by date and slug rather than by number — a QA run, an
 * engineering-history entry, a release record. They cannot collide on a
 * counter, but two sessions can still choose the same filename on the same day,
 * so they get uniqueness verification instead of allocation.
 */
export const PATH_KINDS = {
  'qa-run': { dir: 'docs/qa/runs' },
  history: { dir: 'docs/engineering-history/tasks' },
  release: { dir: 'docs/deployment/release-history' },
};

export const ALL_KINDS = [...Object.keys(ID_KINDS), ...Object.keys(PATH_KINDS)];

// --------------------------------------------------------------------- git

function git(root, args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------ scanning

function namesInWorkingTree(root, dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  try {
    return readdirSync(full);
  } catch {
    return [];
  }
}

/** Every directory a kind's ids can appear in. `dir` stays valid as a string. */
function scanDirs(spec) {
  if (Array.isArray(spec.dir)) return spec.dir;
  return [spec.dir];
}

/** The contents of every markdown file directly under `dir`. */
function fileBodiesIn(root, dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  try {
    return readdirSync(full)
      .filter((name) => name.endsWith('.md'))
      .map((name) => {
        try {
          return readFileSync(join(full, name), 'utf8');
        } catch {
          return '';
        }
      });
  } catch {
    return [];
  }
}

/**
 * Every path ever touched under these directories, on any ref.
 *
 * `git log --all --name-only` does this in **one** subprocess. The first
 * implementation ran `git ls-tree` once per distinct commit, which is correct
 * and took nine seconds per allocation on this repository — slow enough that
 * somebody would eventually bypass the allocator, which is the whole failure
 * this module exists to prevent.
 *
 * Every touched path counts, not only currently-existing ones: an id used on a
 * branch that was later reverted is still spent, because records elsewhere link
 * to it.
 *
 * **Deliberately uncached.** An earlier version memoised this per process, which
 * is right for the ordinary case — one allocation, one process — and wrong the
 * moment anything allocates twice around a commit: the second call would get a
 * ceiling computed before the first record existed. That is the same stale-view
 * defect this module exists to remove, so the saving is not worth having.
 */
function namesInRefs(root, dirs) {
  const out = git(root, ['log', '--all', '--reflog', '--name-only', '--format=', '--', ...dirs]);
  return out ? [...new Set(out.split(/\r?\n/).filter(Boolean))] : [];
}

/**
 * Every revision of a file whose ids live in its text rather than in filenames
 * — the regression register is one file holding every `REG-nnn`.
 *
 * `git log -p` over a single path emits every historical version's diff in one
 * subprocess, so an id added and later removed is still found. Scanning only
 * the current file would hand out a number a merged branch already used.
 */
function contentRevisions(root, path) {
  const bodies = [];
  const current = join(root, path);
  if (existsSync(current)) {
    try {
      bodies.push(readFileSync(current, 'utf8'));
    } catch {
      /* Unreadable is not evidence of absence — the history scan still runs. */
    }
  }
  const history = git(root, ['log', '--all', '--reflog', '-p', '--format=', '--', path]);
  if (history) bodies.push(history);

  return bodies;
}

// ---------------------------------------------------------------- reservations

export function readReservations(root) {
  const entries = readJson(root, LEDGER, []);
  return Array.isArray(entries) ? entries : [];
}

// ---------------------------------------------------------------- allocation

function idPattern(prefix, width) {
  return new RegExp(`\\b${prefix}-(\\d{${width},})\\b`, 'g');
}

/**
 * The highest number already taken for a kind, from **every** source: the
 * working tree, every ref, and the reservation ledger.
 *
 * Exported because the concurrency tests assert on it directly — a ceiling that
 * silently ignores a source is exactly the defect this module exists to remove,
 * and it must be observable without allocating.
 */
export function highestAllocated(root, kind, { scope = '' } = {}) {
  const spec = ID_KINDS[kind];
  if (!spec) throw new Error(`unknown id kind: ${kind}`);

  const prefix = spec.scoped ? `${spec.prefix}-${scope.toUpperCase()}` : spec.prefix;
  if (spec.scoped && !scope) {
    throw new Error(`kind "${kind}" is scoped — pass --scope (e.g. --scope AUTH)`);
  }

  const pattern = idPattern(prefix, spec.width);
  let highest = 0;
  const consider = (text) => {
    for (const match of String(text).matchAll(pattern)) {
      highest = Math.max(highest, Number(match[1]));
    }
    pattern.lastIndex = 0;
  };

  /*
   * A kind may live in more than one directory — BUG-2413.
   *
   * `PLAN-` numbers are held by two record families: QA test plans in
   * `docs/qa/test-plans`, named `PLAN-nnn-*.md`, and ExecPlans in `docs/plans`,
   * which carry `ID: PLAN-nnn` in frontmatter under an `EXECPLAN-nnnn-*.md`
   * filename. Scanning only the first handed out `PLAN-027` while
   * `EXECPLAN-0027-attendance-single-source-of-truth.md` already held it — the
   * allocator issuing the very collision it exists to prevent.
   *
   * `namesInRefs` already accepted an array; only the working-tree scan and this
   * loop assumed one directory.
   */
  for (const dir of scanDirs(spec)) {
    for (const name of namesInWorkingTree(root, dir)) consider(name);
  }
  for (const name of namesInRefs(root, scanDirs(spec))) consider(name);

  /*
   * Filenames are not enough where the id lives in frontmatter. An ExecPlan is
   * named `EXECPLAN-0027-…` and declares `ID: PLAN-027`, so a name scan sees
   * the wrong number entirely.
   */
  for (const dir of spec.idsInContentOf ?? []) {
    for (const body of fileBodiesIn(root, dir)) consider(body);
  }

  if (spec.contentOf) {
    for (const body of contentRevisions(root, spec.contentOf)) consider(body);
  }

  for (const entry of readReservations(root)) {
    if (entry.kind === kind || entry.prefix === prefix) consider(entry.id);
  }

  return highest;
}

export function formatId(kind, number, { scope = '' } = {}) {
  const spec = ID_KINDS[kind];
  const prefix = spec.scoped ? `${spec.prefix}-${scope.toUpperCase()}` : spec.prefix;
  return `${prefix}-${String(number).padStart(spec.width, '0')}`;
}

/**
 * Reserve and return the next id for a kind.
 *
 * The lock is held across read-ceiling → write-reservation, which is the whole
 * point: two sessions calling this concurrently serialise, and the second one
 * sees the first one's reservation.
 */
export function allocateId(root, kind, { scope = '', sessionId = '', note = '' } = {}) {
  if (!ID_KINDS[kind]) throw new Error(`unknown id kind: ${kind}`);

  return withLock(
    root,
    'id-allocation',
    () => {
      const next = highestAllocated(root, kind, { scope }) + 1;
      const id = formatId(kind, next, { scope });

      const entries = readReservations(root);
      entries.push({
        id,
        kind,
        prefix: ID_KINDS[kind].scoped
          ? `${ID_KINDS[kind].prefix}-${scope.toUpperCase()}`
          : ID_KINDS[kind].prefix,
        scope: scope ? scope.toUpperCase() : '',
        sessionId,
        note,
        pid: process.pid,
        allocatedAt: new Date().toISOString(),
      });
      writeJson(root, LEDGER, entries);

      return id;
    },
    { sessionId },
  );
}

/**
 * Drop reservations whose record now exists somewhere in the repository.
 *
 * Only **consumed** reservations are pruned. Dropping an unconsumed one would
 * lower the ceiling and hand the same id out twice, which is the defect, not
 * the cleanup.
 */
export function pruneReservations(root) {
  return withLock(root, 'id-allocation', () => {
    const entries = readReservations(root);
    if (!entries.length) return { pruned: [], kept: [] };

    const dirs = [...new Set(entries.map((entry) => ID_KINDS[entry.kind]?.dir).filter(Boolean))];
    const known = new Set();
    const collect = (name) => {
      for (const spec of Object.values(ID_KINDS)) {
        for (const match of String(name).matchAll(idPattern(`${spec.prefix}(?:-[A-Z0-9]+)?`, spec.width))) {
          known.add(match[0]);
        }
      }
    };
    for (const dir of dirs) {
      for (const name of namesInWorkingTree(root, dir)) collect(name);
    }
    for (const name of namesInRefs(root, dirs)) collect(name);
    for (const spec of Object.values(ID_KINDS)) {
      if (!spec.contentOf) continue;
      for (const body of contentRevisions(root, spec.contentOf)) collect(body);
    }

    const pruned = entries.filter((entry) => known.has(entry.id));
    const kept = entries.filter((entry) => !known.has(entry.id));
    writeJson(root, LEDGER, kept);
    return { pruned, kept };
  });
}

// ------------------------------------------------------- date-named records

/**
 * Verify a date-and-slug filename is free in the working tree and in every ref.
 *
 * These records cannot collide on a counter, but two sessions producing a run
 * for the same feature on the same day will choose the same name — and the
 * second one silently overwrites the first when the branches merge.
 */
export function claimPath(root, kind, filename) {
  const spec = PATH_KINDS[kind];
  if (!spec) throw new Error(`unknown path kind: ${kind}`);

  const relative = `${spec.dir}/${filename}`;
  const inTree = existsSync(join(root, relative));
  const inRefs = namesInRefs(root, [spec.dir]).some(
    (name) => name.replace(/\\/g, '/') === relative,
  );

  return {
    path: relative,
    available: !inTree && !inRefs,
    conflictsInWorkingTree: inTree,
    conflictsInRefs: inRefs,
  };
}
