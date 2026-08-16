/*
 * Durable parent records for concurrent Architect sessions.
 *
 * The live registry in `session-registry.mjs` answers "what is running right
 * now"; it lives in the Git directory and disappears with the machine. This
 * answers the question a *human* asks two weeks later — what was that session
 * doing, on which branch, from which base, and what did it own — and it is
 * Git-tracked, reviewable in a diff, and published to Obsidian.
 *
 * Same flat `Key: value` frontmatter dialect as the bug, backlog and task
 * records. Three record systems with three formats is how agents learn one and
 * get the others wrong.
 *
 * No dependencies beyond the sibling record libraries.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { allocateId } from './id-allocator.mjs';
import {
  recordFilesIn,
  splitFrontmatter,
  parseFrontmatter,
  writeIfChanged,
  slugify,
} from './backlog-records.mjs';

export { writeIfChanged, slugify };

export const SESSION_DIR = 'docs/sessions';

/**
 * Session lifecycle.
 *
 * `INTEGRATING` is separate from `ACTIVE` because it is the one state in which
 * a session may write a shared branch, and therefore the one another session
 * must not enter concurrently.
 */
export const SESSION_STATUSES = ['ACTIVE', 'BLOCKED', 'INTEGRATING', 'COMPLETE', 'ABANDONED'];

export const SESSION_REQUIRED_FIELDS = [
  'SESSION_ID',
  'TASK_ID',
  'TITLE',
  'ARCHITECT_INTENT',
  'STATUS',
  'TASK_TYPE',
  'TASK_SIZE',
  'BASE_BRANCH',
  'BASE_SHA',
  'TASK_BRANCH',
  'TARGET_BRANCH',
  'WORKTREE',
  'AFFECTED_MODULES',
  'WRITE_LEASES',
  'ACTIVE_WORK_PACKAGES',
  'SCHEMA_WRITE',
  'CI_STATUS',
  'MERGE_STATUS',
  'STARTED_AT',
  'LAST_HEARTBEAT',
  'BLOCKERS',
];

export const SESSION_SECTIONS = ['Intent', 'Scope', 'Concurrency', 'History'];

const SESSION_ACTIVE = new Set(['ACTIVE', 'BLOCKED', 'INTEGRATING']);
const SESSION_TERMINAL = new Set(['COMPLETE', 'ABANDONED']);

const GENERATED = ['index.md', 'active.md', 'completed.md', 'README.md'];

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validate(record, errors) {
  const { fields, relative } = record;

  for (const field of SESSION_REQUIRED_FIELDS) {
    if (!(field in fields)) errors.push(`${relative}: missing required field ${field}`);
  }

  const NON_EMPTY = ['SESSION_ID', 'TITLE', 'STATUS', 'TASK_BRANCH', 'TARGET_BRANCH', 'STARTED_AT'];
  for (const field of NON_EMPTY) {
    if (field in fields && !String(fields[field] ?? '').trim()) {
      errors.push(`${relative}: ${field} must not be empty`);
    }
  }

  const status = String(fields.STATUS ?? '').trim();
  if (status && !SESSION_STATUSES.includes(status)) {
    errors.push(`${relative}: STATUS = "${status}" is not one of ${SESSION_STATUSES.join(' | ')}`);
  }

  const id = String(fields.SESSION_ID ?? '').trim();
  if (id && !/^SESSION-\d{4}$/.test(id)) {
    errors.push(`${relative}: SESSION_ID "${id}" does not match SESSION-nnnn`);
  }
  if (id && !basename(relative).startsWith(`${id}-`)) {
    errors.push(`${relative}: filename must start with "${id}-" so the id and the file cannot drift`);
  }

  /*
   * An ordinary session that names `main` as its integration target is the
   * single most damaging misconfiguration available here: `main` is the
   * production deployment branch, so merging into it can trigger a release. The
   * record is where that intent is declared, so it is where it is checked.
   */
  const target = String(fields.TARGET_BRANCH ?? '').trim();
  const type = String(fields.TASK_TYPE ?? '').trim().toUpperCase();
  const PRODUCTION_TYPES = ['RELEASE', 'DEPLOY', 'HOTFIX'];
  if (target === 'main' && !PRODUCTION_TYPES.some((keyword) => type.includes(keyword))) {
    errors.push(
      `${relative}: TARGET_BRANCH = main on a ${type || 'non-release'} session — ` +
        'main is the production deployment branch. Ordinary work integrates to develop. ' +
        'Only RELEASE, DEPLOY or HOTFIX_PRODUCTION may target main.',
    );
  }

  const schemaWrite = String(fields.SCHEMA_WRITE ?? '').trim().toUpperCase();
  if (schemaWrite && !['YES', 'NO'].includes(schemaWrite)) {
    errors.push(`${relative}: SCHEMA_WRITE = "${schemaWrite}" must be YES or NO`);
  }
}

export function loadSessions(root) {
  const sessions = [];
  const errors = [];
  const seen = new Map();

  for (const file of recordFilesIn(root, SESSION_DIR)) {
    if (GENERATED.includes(file.name)) continue;

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
      id: String(fields.SESSION_ID ?? '').trim(),
      taskId: String(fields.TASK_ID ?? '').trim(),
      title: String(fields.TITLE ?? '').trim(),
      intent: String(fields.ARCHITECT_INTENT ?? '').trim(),
      status: String(fields.STATUS ?? '').trim(),
      taskType: String(fields.TASK_TYPE ?? '').trim(),
      taskSize: String(fields.TASK_SIZE ?? '').trim(),
      baseBranch: String(fields.BASE_BRANCH ?? '').trim(),
      baseSha: String(fields.BASE_SHA ?? '').trim(),
      taskBranch: String(fields.TASK_BRANCH ?? '').trim(),
      targetBranch: String(fields.TARGET_BRANCH ?? '').trim(),
      worktree: String(fields.WORKTREE ?? '').trim(),
      modules: asList(fields.AFFECTED_MODULES),
      leases: asList(fields.WRITE_LEASES),
      packages: asList(fields.ACTIVE_WORK_PACKAGES),
      schemaWrite: String(fields.SCHEMA_WRITE ?? '').trim(),
      ciStatus: String(fields.CI_STATUS ?? '').trim(),
      mergeStatus: String(fields.MERGE_STATUS ?? '').trim(),
      startedAt: String(fields.STARTED_AT ?? '').trim(),
      lastHeartbeat: String(fields.LAST_HEARTBEAT ?? '').trim(),
      blockers: String(fields.BLOCKERS ?? '').trim(),
    };

    validate(record, errors);

    if (record.id) {
      if (seen.has(record.id)) {
        errors.push(`duplicate id ${record.id}: ${seen.get(record.id)} and ${file.relative}`);
      } else {
        seen.set(record.id, file.relative);
      }
    }

    sessions.push(record);
  }

  /*
   * Two live sessions on one branch is not a concurrency model, it is two
   * agents overwriting each other. Caught here because the record system is the
   * only place that sees every session at once.
   */
  const byBranch = new Map();
  for (const session of sessions.filter((entry) => SESSION_ACTIVE.has(entry.status))) {
    if (!session.taskBranch) continue;
    if (byBranch.has(session.taskBranch)) {
      errors.push(
        `two active sessions share the branch ${session.taskBranch}: ` +
          `${byBranch.get(session.taskBranch)} and ${session.id}`,
      );
    } else {
      byBranch.set(session.taskBranch, session.id);
    }
  }

  return { sessions, errors };
}

export function isActive(session) {
  return SESSION_ACTIVE.has(session.status);
}

export function isTerminal(session) {
  return SESSION_TERMINAL.has(session.status);
}

export function bucketOf(session) {
  return isTerminal(session) ? 'completed' : 'active';
}

export function compareSessions(a, b) {
  return b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id);
}

/** Reserve the next session id — atomic across every concurrent session. */
export function nextSessionId(root, { note = '' } = {}) {
  return allocateId(root, 'session', { note });
}

export const GENERATED_BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-sessions.mjs`.';
