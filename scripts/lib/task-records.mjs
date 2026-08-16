/*
 * Shared parsing and vocabulary for durable parent Task records.
 *
 * A LARGE or PROGRAM task outlives the session that started it. Chat scrollback
 * does not survive; this record does — it is what lets a new session resume
 * without re-deriving which work packages are done, which are blocked and why.
 *
 * Deliberately the same frontmatter dialect as `backlog-records.mjs`: flat
 * `Key: value` pairs with `[a, b]` lists. Two record systems with two formats
 * is how agents learn one and get the other wrong. The work-package table is
 * the one addition, and it lives in the body as a Markdown table rather than in
 * frontmatter, because nested structure is exactly what this dialect refuses to
 * carry.
 *
 * No dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import {
  PRIORITIES,
  recordFilesIn,
  splitFrontmatter,
  parseFrontmatter,
  writeIfChanged,
  slugify,
} from './backlog-records.mjs';

export { writeIfChanged, slugify };

// ------------------------------------------------------------------ vocabulary

export const TASK_DIR = 'docs/tasks';

/** Parent task lifecycle. */
export const TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETE',
  'ABANDONED',
];

/**
 * Sized by dependency and architectural scope, never by file count. See
 * .agent/context/task-orchestration.md — SMALL and MEDIUM rarely need a record
 * at all, and are accepted here only so a task that grows can be re-sized in
 * place rather than re-filed.
 */
export const TASK_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'PROGRAM'];

/** The routed keyword. Kept identical to the router table. */
export const TASK_TYPES = [
  'BUG',
  'FEATURE',
  'UI/UX',
  'QA',
  'E2E',
  'ARCHITECTURE',
  'DATABASE',
  'INTEGRATION',
  'SECURITY',
  'PERFORMANCE',
  'RELEASE',
  'DEPLOY',
  'HOTFIX',
  'BACKLOG',
  'KNOWLEDGE',
  'FRAMEWORK',
  'AUDIT',
];

/**
 * Work package lifecycle.
 *
 * READY and NOT_STARTED are separate on purpose: READY means every dependency
 * is DONE and the package can start now. That distinction is what makes
 * automatic continuation mechanical instead of a judgement call.
 */
export const WP_STATUSES = [
  'NOT_STARTED',
  'READY',
  'IN_PROGRESS',
  'QA',
  'CI',
  'MERGING',
  'DONE',
  'BLOCKED',
];

/** The only reasons a task may stop with work outstanding. */
export const BLOCK_REASONS = [
  'OWNER_DECISION_REQUIRED',
  'BLOCKED_EXTERNAL',
  'UNRECOVERABLE_TOOL_FAILURE',
  'SAFETY_BLOCK',
];

export const TASK_REQUIRED_FIELDS = [
  'TASK_ID',
  'TITLE',
  'TYPE',
  'SIZE',
  'STATUS',
  'PRIORITY',
  'CREATED_AT',
  'AFFECTED_MODULES',
  'AGENTS',
  'DEPENDENCIES',
  'CURRENT_PACKAGE',
  'COMPLETED_PACKAGES',
  'BLOCKED_PACKAGES',
  'OWNER_DECISIONS',
  'FINAL_STATUS',
];

/** Body sections every task record carries, in order. */
export const TASK_SECTIONS = [
  'Objective',
  'Work Packages',
  'Assumptions',
  'Owner Decisions',
  'Repository Health',
  'History',
];

const TASK_ACTIVE = new Set(['NOT_STARTED', 'IN_PROGRESS']);
const TASK_TERMINAL = new Set(['COMPLETE', 'ABANDONED']);

// --------------------------------------------------------------------- parsing

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Parse the `WORK_PACKAGES` table out of the body.
 *
 * Expected shape, one row per package:
 *
 *   | WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
 *
 * Returns [] when the section is absent, which `validate` reports — an empty
 * decomposition on a LARGE task is a planning failure, not a valid state.
 */
export function parseWorkPackages(body) {
  const packages = [];
  const section = /##\s+Work Packages\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/.exec(body);
  if (!section) return packages;

  for (const line of section[1].split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    /* Skip the header row and the |---|---| separator. */
    if (cells.length < 3) continue;
    if (!/^WP-\d{2,}$/.test(cells[0])) continue;

    packages.push({
      id: cells[0],
      title: cells[1] ?? '',
      status: (cells[2] ?? '').replace(/`/g, '').trim(),
      dependencies: asList((cells[3] ?? '').replace(/[`—-]+$/, '')).filter((d) =>
        /^WP-\d{2,}$/.test(d),
      ),
      agents: asList(cells[4]),
      branch: cells[5] ?? '',
      sha: cells[6] ?? '',
      qaStatus: cells[7] ?? '',
      bugs: asList(cells[8]),
      ciStatus: cells[9] ?? '',
      mergeStatus: cells[10] ?? '',
    });
  }

  return packages;
}

function validate(record, errors) {
  const { fields, relative, packages } = record;
  const where = relative;

  for (const field of TASK_REQUIRED_FIELDS) {
    if (!(field in fields)) errors.push(`${where}: missing required field ${field}`);
  }

  const NON_EMPTY = ['TASK_ID', 'TITLE', 'TYPE', 'SIZE', 'STATUS', 'PRIORITY', 'CREATED_AT'];
  for (const field of NON_EMPTY) {
    if (field in fields && !String(fields[field] ?? '').trim()) {
      errors.push(`${where}: ${field} must not be empty`);
    }
  }

  const enumCheck = (field, allowed) => {
    const value = String(fields[field] ?? '').trim();
    if (!value) return;
    if (!allowed.includes(value)) {
      errors.push(`${where}: ${field} = "${value}" is not one of ${allowed.join(' | ')}`);
    }
  };

  enumCheck('STATUS', TASK_STATUSES);
  enumCheck('SIZE', TASK_SIZES);
  enumCheck('TYPE', TASK_TYPES);
  enumCheck('PRIORITY', PRIORITIES);

  const id = String(fields.TASK_ID ?? '').trim();
  if (id && !/^TASK-\d{4}$/.test(id)) {
    errors.push(`${where}: TASK_ID "${id}" does not match TASK-nnnn`);
  }
  if (id && !basename(where).startsWith(`${id}-`)) {
    errors.push(`${where}: filename must start with "${id}-" so the id and the file cannot drift`);
  }

  if (String(fields.CREATED_AT ?? '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.CREATED_AT).trim())) {
    errors.push(`${where}: CREATED_AT = "${fields.CREATED_AT}" is not YYYY-MM-DD`);
  }

  const size = String(fields.SIZE ?? '').trim();
  if (['LARGE', 'PROGRAM'].includes(size) && packages.length === 0) {
    errors.push(
      `${where}: SIZE ${size} requires a decomposed Work Packages table — an undecomposed large task cannot be continued automatically`,
    );
  }

  const ids = new Set();
  for (const wp of packages) {
    if (ids.has(wp.id)) errors.push(`${where}: duplicate work package ${wp.id}`);
    ids.add(wp.id);

    if (wp.status && !WP_STATUSES.includes(wp.status)) {
      errors.push(`${where}: ${wp.id} STATUS = "${wp.status}" is not one of ${WP_STATUSES.join(' | ')}`);
    }
  }

  /* A dependency on a package that does not exist silently blocks forever. */
  for (const wp of packages) {
    for (const dependency of wp.dependencies) {
      if (!ids.has(dependency)) {
        errors.push(`${where}: ${wp.id} depends on unknown work package ${dependency}`);
      }
    }
  }

  /*
   * The consistency that matters for continuation: a package the frontmatter
   * calls complete must actually be DONE in the table, or the orchestrator and
   * the record disagree about what is left.
   */
  for (const id of asList(fields.COMPLETED_PACKAGES)) {
    const wp = packages.find((entry) => entry.id === id);
    if (!wp) {
      errors.push(`${where}: COMPLETED_PACKAGES names unknown package ${id}`);
    } else if (wp.status !== 'DONE') {
      errors.push(`${where}: COMPLETED_PACKAGES lists ${id} but its status is ${wp.status}`);
    }
  }

  for (const id of asList(fields.BLOCKED_PACKAGES)) {
    const wp = packages.find((entry) => entry.id === id.split(':')[0].trim());
    if (!wp) errors.push(`${where}: BLOCKED_PACKAGES names unknown package ${id}`);
  }

  const status = String(fields.STATUS ?? '').trim();
  if (status === 'COMPLETE') {
    const unfinished = packages.filter((wp) => wp.status !== 'DONE');
    if (unfinished.length) {
      errors.push(
        `${where}: STATUS COMPLETE while ${unfinished.map((wp) => wp.id).join(', ')} are not DONE`,
      );
    }
    if (!String(fields.FINAL_STATUS ?? '').trim()) {
      errors.push(`${where}: a COMPLETE task must record a FINAL_STATUS`);
    }
  }
}

/**
 * Load every task record under `root`, validated. Never throws — structural
 * problems come back in `errors` so the caller decides the exit code.
 */
export function loadTasks(root) {
  const tasks = [];
  const errors = [];
  const seen = new Map();

  for (const file of recordFilesIn(root, TASK_DIR)) {
    /* index.md, active.md, blocked.md and completed.md are generated. */
    if (['index.md', 'active.md', 'blocked.md', 'completed.md'].includes(file.name)) continue;

    let text;
    try {
      text = readFileSync(file.path, 'utf8');
    } catch (error) {
      errors.push(`${file.relative}: unreadable — ${error.message}`);
      continue;
    }

    const split = splitFrontmatter(text);
    if (!split) {
      errors.push(`${file.relative}: no --- frontmatter block`);
      continue;
    }

    const { fields, errors: parseErrors } = parseFrontmatter(split.raw);
    for (const message of parseErrors) errors.push(`${file.relative}: ${message}`);

    const record = {
      fields,
      body: split.body,
      relative: file.relative,
      path: file.path,
      packages: parseWorkPackages(split.body),
      id: String(fields.TASK_ID ?? '').trim(),
      title: String(fields.TITLE ?? '').trim(),
      type: String(fields.TYPE ?? '').trim(),
      size: String(fields.SIZE ?? '').trim(),
      status: String(fields.STATUS ?? '').trim(),
      priority: String(fields.PRIORITY ?? '').trim(),
      createdAt: String(fields.CREATED_AT ?? '').trim(),
      modules: asList(fields.AFFECTED_MODULES),
      agents: asList(fields.AGENTS),
      currentPackage: String(fields.CURRENT_PACKAGE ?? '').trim(),
      ownerDecisions: String(fields.OWNER_DECISIONS ?? '').trim(),
      finalStatus: String(fields.FINAL_STATUS ?? '').trim(),
    };

    validate(record, errors);

    if (record.id) {
      if (seen.has(record.id)) {
        errors.push(`duplicate id ${record.id}: ${seen.get(record.id)} and ${file.relative}`);
      } else {
        seen.set(record.id, file.relative);
      }
    }

    tasks.push(record);
  }

  return { tasks, errors };
}

// ---------------------------------------------------------------- continuation

/**
 * Packages whose dependencies are all DONE and which have not started.
 *
 * This is the whole of automatic continuation: when a package reaches DONE,
 * recompute this, take the first, and start it. An orchestrator that asks the
 * user which package is next has turned a mechanical lookup into a round trip.
 */
export function readyPackages(task) {
  const done = new Set(task.packages.filter((wp) => wp.status === 'DONE').map((wp) => wp.id));
  return task.packages.filter(
    (wp) =>
      ['NOT_STARTED', 'READY'].includes(wp.status) &&
      wp.dependencies.every((dependency) => done.has(dependency)),
  );
}

/**
 * True when the task genuinely cannot proceed: nothing is READY, and everything
 * unfinished is BLOCKED.
 *
 * One blocked package never stops an independent one — that is the expensive
 * orchestration failure this function exists to make impossible to reach by
 * accident.
 */
export function isFullyBlocked(task) {
  const unfinished = task.packages.filter((wp) => wp.status !== 'DONE');
  if (unfinished.length === 0) return false;
  if (readyPackages(task).length > 0) return false;
  return unfinished.every((wp) => wp.status === 'BLOCKED');
}

export function isActive(task) {
  return TASK_ACTIVE.has(task.status);
}

export function isTerminal(task) {
  return TASK_TERMINAL.has(task.status);
}

export function bucketOf(task) {
  if (task.status === 'BLOCKED') return 'blocked';
  if (isTerminal(task)) return 'completed';
  return 'active';
}

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3, '': 4 };

/** Deterministic ordering: highest priority first, then by id. */
export function compareTasks(a, b) {
  const priority = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  if (priority) return priority;
  return a.id.localeCompare(b.id);
}

export function progressOf(task) {
  const done = task.packages.filter((wp) => wp.status === 'DONE').length;
  return { done, total: task.packages.length };
}

/** Highest allocated numeric suffix, so ids are never reused. */
export function nextTaskId(root) {
  let highest = 0;
  for (const file of recordFilesIn(root, TASK_DIR)) {
    const match = /^TASK-(\d{4})-/.exec(file.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `TASK-${String(highest + 1).padStart(4, '0')}`;
}

export function taskExists(root, id) {
  return recordFilesIn(root, TASK_DIR).some((file) => file.name.startsWith(`${id}-`));
}

export const GENERATED_BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-tasks.mjs`.';

export { existsSync };
