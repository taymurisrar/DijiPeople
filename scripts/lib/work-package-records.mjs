/*
 * Durable per-work-package state for LARGE and PROGRAM tasks.
 *
 * The parent Task record already carries a Work Packages *table*. A table row
 * is an index entry: id, title, status, dependencies. It is deliberately narrow,
 * because a Markdown table cannot hold a context manifest, an assumption
 * register, an evidence list and a handoff block without becoming unreadable.
 *
 * So the row stays the index and this file is the state. One Markdown file per
 * package, under:
 *
 *   docs/tasks/<TASK-ID>-<slug>/work-packages/WP-nn-<slug>.md
 *
 * That directory sits *beside* the parent record rather than replacing it.
 * `recordFilesIn` does not recurse, so these files are never mistaken for task
 * records — which is the whole reason the layout is a sibling directory and not
 * a second top-level tree. Two competing task systems is the failure this
 * framework has already paid for once.
 *
 * The point of the file is resumption. A session that ends mid-program leaves
 * behind: what this package is for, which context to load, which context
 * explicitly not to load, what was already decided, what has already been
 * proven, and what the next session must do first. A session that starts from
 * these files does not repeat discovery.
 *
 * No dependencies.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { splitFrontmatter, parseFrontmatter, writeIfChanged, slugify } from './backlog-records.mjs';
import { TASK_DIR, WP_STATUSES } from './task-records.mjs';

export { writeIfChanged, slugify };

// ------------------------------------------------------------------ vocabulary

/**
 * Where a package's context comes from, and — just as importantly — where it
 * must not. `DO_NOT_LOAD` exists because the expensive failure is not missing
 * context, it is an agent that reads every bug record and every Obsidian note
 * "to be safe" and then has no budget left to do the work.
 */
export const MANIFEST_SECTIONS = ['REQUIRED', 'OPTIONAL', 'DO_NOT_LOAD'];

/** What a package changed about durable knowledge. Mirrors the handoff contract. */
export const KNOWLEDGE_IMPACTS = [
  'NONE',
  'CURRENT_CONTEXT',
  'ARCHITECTURE',
  'MODULE',
  'UI_CONVENTION',
  'DATABASE',
  'SECURITY',
  'BUG_PATTERN',
  'QA_SCENARIO',
  'REGRESSION',
  'DECISION',
];

/** What the vault must do about it. */
export const OBSIDIAN_IMPACTS = ['NONE', 'CREATE_NODE', 'UPDATE_NODE', 'RELINK_NODE', 'ARCHIVE_NODE'];

/**
 * Assumption confidence. UNVERIFIED with material impact is the state the
 * framework refuses to build on: prove it, or ask.
 */
export const ASSUMPTION_STATES = ['VERIFIED', 'USER_CONFIRMED', 'UNVERIFIED'];

/**
 * The day per-package files became mandatory for PROGRAM tasks.
 *
 * Records created before this date may opt out with a reason; records created
 * on or after it may not. Hard-coded rather than configurable because a
 * movable cutoff is an escape hatch with extra steps.
 */
export const WP_FILE_CONVENTION_DATE = '2026-08-21';

export const WP_REQUIRED_FIELDS = [
  'WP_ID',
  'TASK_ID',
  'TITLE',
  'STATUS',
  'OWNER_AGENT',
  'DEPENDENCIES',
  'LAST_VERIFIED_SHA',
  'KNOWLEDGE_IMPACT',
  'OBSIDIAN_IMPACT',
];

/**
 * Body sections every package file carries, in order.
 *
 * Order is enforced because these files are read by a resuming agent under
 * budget pressure. Goal first, manifest second: by the time the reader reaches
 * Implementation State they already know what to load and what to skip.
 */
export const WP_SECTIONS = [
  'Goal',
  'Context Manifest',
  'Relevant Files',
  'Assumptions',
  'Implementation State',
  'Validation State',
  'Evidence',
  'Questions',
  'Handoff',
];

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
 * The `## <name>` block of a body, or '' when absent or empty.
 *
 * `[^\S\r\n]*` rather than `\s*` after the heading, and the difference matters
 * more than it looks. `\s*` is greedy across newlines, so for an *empty*
 * section it swallows the blank line and the section boundary with it, and the
 * capture runs on into everything that follows.
 *
 * An empty `## Evidence` would therefore return the text of `## Questions` and
 * read as populated — defeating the one check that stops a package reaching
 * DONE with nothing behind it. The empty section is the case these validators
 * exist for, and the greedy version failed in exactly that case.
 */
export function section(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `##[^\\S\\r\\n]+${escaped}[^\\S\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##[^\\S\\r\\n]|$)`,
  ).exec(body);
  return match ? match[1].trim() : '';
}

/**
 * Parse the context manifest out of its section.
 *
 * Expected shape — one bullet list per heading:
 *
 *   REQUIRED:
 *   - `path/or/record`
 *   OPTIONAL:
 *   - `path`
 *   DO_NOT_LOAD:
 *   - the entire bug backlog — nothing here depends on it
 */
export function parseContextManifest(body) {
  const raw = section(body, 'Context Manifest');
  const manifest = { REQUIRED: [], OPTIONAL: [], DO_NOT_LOAD: [] };
  if (!raw) return manifest;

  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const heading = /^\s*(REQUIRED|OPTIONAL|DO_NOT_LOAD)\s*:?\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      continue;
    }
    const entry = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    if (entry && current) manifest[current].push(entry[1].replace(/`/g, '').trim());
  }

  return manifest;
}

/**
 * Parse the assumption register.
 *
 * | ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
 */
export function parseAssumptions(body) {
  const raw = section(body, 'Assumptions');
  const assumptions = [];
  if (!raw) return assumptions;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;
    if (!/^A-\d{2,}$/.test(cells[0])) continue;
    assumptions.push({
      id: cells[0],
      statement: cells[1] ?? '',
      state: (cells[2] ?? '').replace(/`/g, '').trim(),
      evidence: cells[3] ?? '',
    });
  }

  return assumptions;
}

/** The directory a task's packages live in, whether or not it exists yet. */
export function packageDirFor(root, taskRelativePath) {
  return join(root, taskRelativePath.replace(/\.md$/, ''), 'work-packages');
}

function packageFilesIn(dir, relativeDir) {
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => ({ name, path: join(dir, name), relative: `${relativeDir}/${name}` }))
    .filter((file) => {
      try {
        return statSync(file.path).isFile();
      } catch {
        return false;
      }
    });
}

// ------------------------------------------------------------------ validation

function validate(record, errors) {
  const { fields, relative, body, manifest, assumptions } = record;
  const where = relative;

  for (const field of WP_REQUIRED_FIELDS) {
    if (!(field in fields)) errors.push(`${where}: missing required field ${field}`);
  }

  const NON_EMPTY = ['WP_ID', 'TASK_ID', 'TITLE', 'STATUS', 'OWNER_AGENT', 'LAST_VERIFIED_SHA'];
  for (const field of NON_EMPTY) {
    if (field in fields && !String(fields[field] ?? '').trim()) {
      errors.push(`${where}: ${field} must not be empty`);
    }
  }

  const id = String(fields.WP_ID ?? '').trim();
  if (id && !/^WP-\d{2,}$/.test(id)) {
    errors.push(`${where}: WP_ID "${id}" does not match WP-nn`);
  }
  if (id && !basename(where).startsWith(`${id}-`)) {
    errors.push(`${where}: filename must start with "${id}-" so the id and the file cannot drift`);
  }

  const status = String(fields.STATUS ?? '').trim();
  if (status && !WP_STATUSES.includes(status)) {
    errors.push(`${where}: STATUS = "${status}" is not one of ${WP_STATUSES.join(' | ')}`);
  }

  const obsidian = String(fields.OBSIDIAN_IMPACT ?? '').trim();
  if (obsidian && !OBSIDIAN_IMPACTS.includes(obsidian)) {
    errors.push(`${where}: OBSIDIAN_IMPACT = "${obsidian}" is not one of ${OBSIDIAN_IMPACTS.join(' | ')}`);
  }

  for (const impact of asList(fields.KNOWLEDGE_IMPACT)) {
    if (!KNOWLEDGE_IMPACTS.includes(impact)) {
      errors.push(`${where}: KNOWLEDGE_IMPACT "${impact}" is not one of ${KNOWLEDGE_IMPACTS.join(' | ')}`);
    }
  }

  for (const name of WP_SECTIONS) {
    if (!new RegExp(`##\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\r?\\n`).test(body)) {
      errors.push(`${where}: missing required section "## ${name}"`);
    }
  }

  /*
   * A manifest that declares nothing is the same as no manifest: the agent
   * falls back to reading whatever looks relevant, which is the behaviour the
   * context budget exists to stop.
   */
  if (manifest.REQUIRED.length === 0) {
    errors.push(`${where}: Context Manifest declares no REQUIRED entries — an empty manifest is not a budget`);
  }
  if (manifest.DO_NOT_LOAD.length === 0) {
    errors.push(
      `${where}: Context Manifest declares no DO_NOT_LOAD entries — naming what to skip is the half that saves budget`,
    );
  }

  for (const assumption of assumptions) {
    if (assumption.state && !ASSUMPTION_STATES.includes(assumption.state)) {
      errors.push(
        `${where}: ${assumption.id} state "${assumption.state}" is not one of ${ASSUMPTION_STATES.join(' | ')}`,
      );
    }
  }

  /*
   * Terminal states are claims, and a claim points at evidence. A package that
   * says DONE with an empty Evidence section is exactly the false completion
   * the contract forbids.
   */
  if (status === 'DONE') {
    const evidence = section(body, 'Evidence');
    if (!evidence || /^(none|n\/a|—|-)\.?$/i.test(evidence)) {
      errors.push(`${where}: STATUS DONE with no Evidence — a terminal state must point at what proved it`);
    }
    const unverified = assumptions.filter((entry) => entry.state === 'UNVERIFIED');
    if (unverified.length) {
      errors.push(
        `${where}: STATUS DONE while ${unverified.map((entry) => entry.id).join(', ')} remain UNVERIFIED`,
      );
    }
  }

  /*
   * WAITING_USER is only honest when it names the question. Without a
   * QUESTION-nnnn reference the state is indistinguishable from "stalled".
   */
  if (status === 'WAITING_USER') {
    const questions = section(body, 'Questions');
    if (!/QUESTION-\d{4}/.test(questions)) {
      errors.push(
        `${where}: STATUS WAITING_USER but the Questions section names no QUESTION-nnnn record`,
      );
    }
  }
}

/**
 * Load every work-package file belonging to `taskRelativePath`, validated.
 * Never throws — problems come back in `errors`.
 */
export function loadWorkPackages(root, taskRelativePath) {
  const packages = [];
  const errors = [];

  const relativeDir = `${taskRelativePath.replace(/\.md$/, '')}/work-packages`;
  const dir = packageDirFor(root, taskRelativePath);

  for (const file of packageFilesIn(dir, relativeDir)) {
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
      id: String(fields.WP_ID ?? '').trim(),
      taskId: String(fields.TASK_ID ?? '').trim(),
      title: String(fields.TITLE ?? '').trim(),
      status: String(fields.STATUS ?? '').trim(),
      ownerAgent: String(fields.OWNER_AGENT ?? '').trim(),
      dependencies: asList(fields.DEPENDENCIES).filter((entry) => /^WP-\d{2,}$/.test(entry)),
      lastVerifiedSha: String(fields.LAST_VERIFIED_SHA ?? '').trim(),
      knowledgeImpact: asList(fields.KNOWLEDGE_IMPACT),
      obsidianImpact: String(fields.OBSIDIAN_IMPACT ?? '').trim(),
      manifest: parseContextManifest(split.body),
      assumptions: parseAssumptions(split.body),
    };

    validate(record, errors);
    packages.push(record);
  }

  const seen = new Set();
  for (const wp of packages) {
    if (wp.id && seen.has(wp.id)) errors.push(`${relativeDir}: duplicate work package file for ${wp.id}`);
    seen.add(wp.id);
  }

  return { packages, errors, dir, relativeDir };
}

/**
 * Cross-check package files against the parent record's table.
 *
 * This is the check that matters. Either artefact alone can look healthy while
 * the pair disagrees about what is done — and a resuming session trusts the
 * table for "what is left" and the file for "how to do it". Drift between them
 * is how a package gets silently skipped.
 */
export function reconcileWithParent(task, loaded, grandfathered = []) {
  const errors = [];
  const { packages, relativeDir } = loaded;
  const where = task.relative;

  const size = String(task.fields?.SIZE ?? task.size ?? '').trim();
  const rows = task.packages ?? [];

  /* Only PROGRAM tasks are required to carry package files. */
  const terminal = ['COMPLETE', 'ABANDONED'].includes(String(task.status ?? '').trim());
  let filesRequired = size === 'PROGRAM' && !terminal;

  /*
   * Programs that predate this convention keep their table-only state.
   *
   * The alternative was backfilling thirty package files for programs whose
   * sessions ended weeks ago, inventing context manifests and evidence lists
   * nobody actually produced. Fabricated state is worse than absent state: it
   * reads as proof.
   *
   * The exemption is deliberately hard to reach. It is honoured only for a
   * record created *before* the convention existed, and only when it says why —
   * so it grandfathers the five programs that exist today and cannot be claimed
   * by anything written afterwards. That is the difference between a dated
   * clause and an escape hatch: this one stops being available tomorrow.
   */
  const exemption = String(task.fields?.WORK_PACKAGE_FILES ?? '').trim();
  const createdAt = String(task.fields?.CREATED_AT ?? '').trim();
  if (filesRequired && exemption.startsWith('NOT_REQUIRED')) {
    const reason = exemption.replace(/^NOT_REQUIRED\s*[—:-]?\s*/, '').trim();
    if (createdAt && createdAt < WP_FILE_CONVENTION_DATE && reason) {
      filesRequired = false;
      grandfathered.push(`${where} — ${reason}`);
    } else if (!reason) {
      errors.push(`${where}: WORK_PACKAGE_FILES = NOT_REQUIRED without a reason`);
    } else {
      errors.push(
        `${where}: WORK_PACKAGE_FILES = NOT_REQUIRED is only honoured for records created before ${WP_FILE_CONVENTION_DATE} (this one says ${createdAt || 'nothing'})`,
      );
    }
  }

  if (filesRequired && packages.length === 0) {
    errors.push(
      `${where}: SIZE PROGRAM but no work-package files under ${relativeDir}/ — the table alone cannot carry a context manifest`,
    );
    return errors;
  }

  if (packages.length === 0) return errors;

  const byId = new Map(packages.map((wp) => [wp.id, wp]));
  const rowIds = new Set(rows.map((row) => row.id));

  for (const row of rows) {
    const file = byId.get(row.id);
    if (!file) {
      if (filesRequired) {
        errors.push(`${relativeDir}: ${row.id} is in the parent table but has no package file`);
      }
      continue;
    }

    if (file.taskId && task.id && file.taskId !== task.id) {
      errors.push(`${file.relative}: TASK_ID ${file.taskId} does not match the parent record ${task.id}`);
    }
    if (file.status && row.status && file.status !== row.status) {
      errors.push(
        `${file.relative}: STATUS ${file.status} disagrees with the parent table row (${row.status}) — the index and the state must not drift`,
      );
    }

    const rowDeps = [...row.dependencies].sort().join(',');
    const fileDeps = [...file.dependencies].sort().join(',');
    if (rowDeps !== fileDeps) {
      errors.push(
        `${file.relative}: DEPENDENCIES [${fileDeps}] disagree with the parent table row [${rowDeps}]`,
      );
    }
  }

  for (const wp of packages) {
    if (wp.id && !rowIds.has(wp.id)) {
      errors.push(`${wp.relative}: ${wp.id} has a package file but no row in the parent Work Packages table`);
    }
  }

  return errors;
}

/**
 * Which packages can start right now: every dependency DONE, and not already
 * finished, blocked or waiting on the user.
 *
 * Continuation is mechanical precisely because this is a computation and not a
 * judgement call. An Architect that "decides what to do next" can decide to
 * stop; a queue that is empty or non-empty cannot.
 */
export function readyPackages(rows) {
  const done = new Set(rows.filter((row) => row.status === 'DONE').map((row) => row.id));
  const stopped = new Set(['DONE', 'BLOCKED', 'WAITING_USER']);
  return rows.filter(
    (row) => !stopped.has(row.status) && row.dependencies.every((dependency) => done.has(dependency)),
  );
}

export { TASK_DIR };
