/*
 * Shared parsing and vocabulary for the durable Bug and Backlog record systems.
 *
 * One module so that `rebuild-backlog.mjs`, `new-bug.mjs`,
 * `new-backlog-item.mjs`, `generate-dashboards.mjs` and
 * `validate-framework.mjs` cannot drift into three different opinions about
 * what a valid Status is. A vocabulary defined in four places is a vocabulary
 * with four values — that is the `divergent-duplicate-guard` bug pattern
 * applied to the framework itself.
 *
 * No dependencies. The frontmatter dialect is deliberately a small, strict
 * subset of YAML: flat `Key: value` pairs, with `[a, b]` list syntax. Anything
 * richer would need a parser, and a record format that needs a parser is a
 * record format agents get wrong.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

// ------------------------------------------------------------------ vocabulary

/** Bug lifecycle. See docs/bugs/README.md for what each means operationally. */
export const BUG_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'DEFERRED',
  'PRODUCT_DECISION',
  'FIXED',
  'VERIFIED',
  'CLOSED',
  'NOT_A_BUG',
  'DUPLICATE',
  'ACCEPTED_RISK',
];

/** Backlog item lifecycle. */
export const ITEM_STATUSES = [
  'NEW',
  'TRIAGE_REQUIRED',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'DEFERRED',
  'PRODUCT_DECISION',
  'VALIDATING',
  'DONE',
  'CANCELLED',
  'DUPLICATE',
];

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

export const BUG_TYPES = [
  'BUG',
  'SECURITY',
  'UX',
  'INTEGRATION',
  'DATABASE',
  'AUTHORIZATION',
  'TENANT_ISOLATION',
  'STATE_MACHINE',
  'PERFORMANCE',
  'DATA_INTEGRITY',
  'TEST_GAP',
  'INFRA',
  'DOCUMENTATION',
];

export const ITEM_TYPES = [
  'BUG',
  'SECURITY',
  'TECH_DEBT',
  'ARCHITECTURE',
  'UX',
  'TEST_GAP',
  'INFRA',
  'PRODUCT_DECISION',
  'FOLLOW_UP',
  'DOCUMENTATION',
  'PERFORMANCE',
  'DATA_MIGRATION',
  'RELEASE',
];

/**
 * What the Architect decided to do about the record. `TRIAGE_REQUIRED` is the
 * honest value for anything not yet looked at — it is deliberately not a
 * disposition, so it shows up as outstanding work rather than as a decision.
 */
export const DISPOSITIONS = [
  'TRIAGE_REQUIRED',
  'FIX_NOW',
  'PLAN_REQUIRED',
  'DEFER',
  'PRODUCT_DECISION',
  'BLOCKED_EXTERNAL',
  'ACCEPTED_RISK',
  'DUPLICATE',
  'NOT_A_BUG',
  'DONE',
];

/** Where the record came from. Provenance, not blame. */
export const SOURCES = [
  'QA_RUN',
  'REVIEWER',
  'ARCHITECT',
  'USER_REPORT',
  'CI',
  'DEPLOYMENT',
  'SECURITY_REVIEW',
  'IMPLEMENTATION',
  'REGRESSION_REGISTER',
];

/* Records in these states are still work. */
const BUG_ACTIVE = new Set(['OPEN', 'IN_PROGRESS', 'FIXED']);
const ITEM_ACTIVE = new Set(['NEW', 'TRIAGE_REQUIRED', 'READY', 'IN_PROGRESS', 'VALIDATING']);

/* Records in these states are finished, one way or another. */
const BUG_TERMINAL = new Set(['VERIFIED', 'CLOSED', 'NOT_A_BUG', 'DUPLICATE', 'ACCEPTED_RISK']);
const ITEM_TERMINAL = new Set(['DONE', 'CANCELLED', 'DUPLICATE']);

export const BUG_REQUIRED_FIELDS = [
  'ID',
  'Title',
  'Status',
  'Severity',
  'Priority',
  'Type',
  'Source',
  'DetectedDate',
  'DetectedInSha',
  'AffectedModules',
  'OwnerAgent',
  'ArchitectDisposition',
  'QAReport',
  'RegressionId',
  'RelatedBacklogItem',
  'RelatedDecision',
  'RelatedImplementation',
  'CreatedAt',
  'UpdatedAt',
  'ResolvedAt',
];

export const ITEM_REQUIRED_FIELDS = [
  'ID',
  'Title',
  'Type',
  'Status',
  'Priority',
  'Severity',
  'AffectedModules',
  'Source',
  'OwnerAgent',
  'ArchitectDisposition',
  'CreatedAt',
  'UpdatedAt',
  'RelatedBug',
  'RelatedQA',
  'RelatedADR',
  'RelatedImplementation',
  'TargetMilestone',
  'BlockedBy',
];

/** Body sections every Bug record carries, in order. */
export const BUG_SECTIONS = [
  'Summary',
  'Expected Behavior',
  'Actual Behavior',
  'Reproduction',
  'Evidence',
  'Root Cause',
  'Impact',
  'Affected Areas',
  'Proposed Resolution',
  'Acceptance Criteria',
  'Regression Coverage',
  'Dependencies',
  'Related Items',
  'Resolution',
  'QA Retest',
  'History',
];

export const BUG_DIR = 'docs/bugs';
export const ITEM_DIR = 'docs/backlog/items';

// --------------------------------------------------------------------- parsing

/**
 * Split `---\nkey: value\n---\nbody` into its two halves.
 * Returns null when there is no frontmatter block at all, which the caller
 * reports as a malformed record rather than silently skipping.
 */
export function splitFrontmatter(text) {
  const normalized = text.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(normalized);
  if (!match) return null;
  return { raw: match[1], body: match[2] };
}

/**
 * Parse the flat key/value dialect. Values are trimmed strings; `[a, b]`
 * becomes an array; empty becomes ''. Quoting is honoured so a Title may
 * contain a colon.
 */
export function parseFrontmatter(raw) {
  const fields = {};
  const errors = [];

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const separator = line.indexOf(':');
    if (separator === -1) {
      errors.push(`line ${index + 1}: not a "Key: value" pair — ${line.trim()}`);
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (!key) {
      errors.push(`line ${index + 1}: empty key`);
      continue;
    }
    if (key in fields) {
      errors.push(`line ${index + 1}: duplicate key ${key}`);
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      fields[key] = value
        .slice(1, -1)
        .split(',')
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    fields[key] = value;
  }

  return { fields, errors };
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Markdown files directly inside a directory. Records are never nested. */
export function recordFilesIn(root, relativeDir) {
  const dir = join(root, relativeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => ({ name, path: join(dir, name), relative: `${relativeDir}/${name}` }));
}

function validate(record, kind, errors) {
  const { fields, relative } = record;
  const where = relative;

  const required = kind === 'bug' ? BUG_REQUIRED_FIELDS : ITEM_REQUIRED_FIELDS;
  for (const field of required) {
    if (!(field in fields)) errors.push(`${where}: missing required field ${field}`);
  }

  /*
   * Required means "declared", not "populated". ResolvedAt on an OPEN bug is
   * legitimately empty; a field that is absent entirely is a record whose
   * author did not consider it.
   */
  const NON_EMPTY = ['ID', 'Title', 'Status', 'Type', 'Priority', 'Source', 'OwnerAgent', 'ArchitectDisposition'];
  for (const field of NON_EMPTY) {
    if (field in fields && !String(fields[field] ?? '').trim()) {
      errors.push(`${where}: ${field} must not be empty`);
    }
  }

  const statuses = kind === 'bug' ? BUG_STATUSES : ITEM_STATUSES;
  const types = kind === 'bug' ? BUG_TYPES : ITEM_TYPES;

  const enumCheck = (field, allowed, { optional = false } = {}) => {
    const value = String(fields[field] ?? '').trim();
    if (!value) {
      if (!optional) errors.push(`${where}: ${field} is empty`);
      return;
    }
    if (!allowed.includes(value)) {
      errors.push(`${where}: ${field} = "${value}" is not one of ${allowed.join(' | ')}`);
    }
  };

  enumCheck('Status', statuses);
  enumCheck('Type', types);
  enumCheck('Priority', PRIORITIES);
  enumCheck('Severity', SEVERITIES, { optional: kind === 'item' });
  enumCheck('Source', SOURCES);
  enumCheck('ArchitectDisposition', DISPOSITIONS);

  const idPattern = kind === 'bug' ? /^BUG-\d{4}$/ : /^ITEM-\d{4}$/;
  const id = String(fields.ID ?? '').trim();
  if (id && !idPattern.test(id)) {
    errors.push(`${where}: ID "${id}" does not match ${idPattern}`);
  }
  if (id && !basename(where).startsWith(`${id}-`)) {
    errors.push(`${where}: filename must start with "${id}-" so the id and the file cannot drift`);
  }

  for (const field of ['DetectedDate', 'CreatedAt', 'UpdatedAt', 'ResolvedAt']) {
    const value = String(fields[field] ?? '').trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${where}: ${field} = "${value}" is not YYYY-MM-DD`);
    }
  }

  if (kind === 'bug') {
    const status = String(fields.Status ?? '').trim();
    if (['VERIFIED', 'CLOSED'].includes(status) && !String(fields.ResolvedAt ?? '').trim()) {
      errors.push(`${where}: Status ${status} requires a ResolvedAt date`);
    }
    /*
     * A record nobody has triaged must say so. Silently defaulting to a real
     * disposition is how an untriaged CRITICAL becomes invisible.
     */
    if (
      String(fields.ArchitectDisposition ?? '').trim() === 'TRIAGE_REQUIRED' &&
      BUG_TERMINAL.has(status)
    ) {
      errors.push(`${where}: a ${status} bug cannot still be TRIAGE_REQUIRED`);
    }
  }
}

/**
 * Load every Bug and Backlog record under `root`, validated.
 * Never throws — structural problems come back in `errors` so the caller
 * decides the exit code.
 */
export function loadRecords(root) {
  const records = [];
  const errors = [];
  const seen = new Map();

  for (const [kind, dir] of [
    ['bug', BUG_DIR],
    ['item', ITEM_DIR],
  ]) {
    for (const file of recordFilesIn(root, dir)) {
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
        kind,
        fields,
        body: split.body,
        relative: file.relative,
        path: file.path,
        id: String(fields.ID ?? '').trim(),
        title: String(fields.Title ?? '').trim(),
        status: String(fields.Status ?? '').trim(),
        severity: String(fields.Severity ?? '').trim(),
        priority: String(fields.Priority ?? '').trim(),
        type: String(fields.Type ?? '').trim(),
        disposition: String(fields.ArchitectDisposition ?? '').trim(),
        modules: asList(fields.AffectedModules),
        updatedAt: String(fields.UpdatedAt ?? '').trim(),
      };

      validate(record, kind, errors);

      if (record.id) {
        if (seen.has(record.id)) {
          errors.push(
            `duplicate id ${record.id}: ${seen.get(record.id)} and ${file.relative}`,
          );
        } else {
          seen.set(record.id, file.relative);
        }
      }

      records.push(record);
    }
  }

  /* Cross-references must resolve, or an index links into nothing. */
  const known = new Set(records.map((record) => record.id).filter(Boolean));
  for (const record of records) {
    for (const field of ['RelatedBacklogItem', 'RelatedBug', 'BlockedBy']) {
      for (const reference of asList(record.fields[field])) {
        if (!/^(BUG|ITEM)-\d{4}$/.test(reference)) continue;
        if (!known.has(reference)) {
          errors.push(`${record.relative}: ${field} references unknown record ${reference}`);
        }
      }
    }
  }

  return { records, errors };
}

// ---------------------------------------------------------------- classifying

export function isActive(record) {
  return record.kind === 'bug' ? BUG_ACTIVE.has(record.status) : ITEM_ACTIVE.has(record.status);
}

export function isTerminal(record) {
  return record.kind === 'bug' ? BUG_TERMINAL.has(record.status) : ITEM_TERMINAL.has(record.status);
}

export function bucketOf(record) {
  if (record.status === 'BLOCKED') return 'blocked';
  if (record.status === 'DEFERRED') return 'deferred';
  if (record.status === 'PRODUCT_DECISION') return 'product-decisions';
  if (isTerminal(record)) return 'completed';
  return 'open';
}

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, '': 4 };
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3, '': 4 };

/**
 * Deterministic ordering: worst first, then by id. Any two runs over the same
 * inputs must produce byte-identical output, or "idempotent" is a claim rather
 * than a property.
 */
export function compareRecords(a, b) {
  const severity = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
  if (severity) return severity;
  const priority = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  if (priority) return priority;
  return a.id.localeCompare(b.id);
}

/** Highest allocated numeric suffix for a prefix, so ids are never reused. */
export function nextId(root, prefix) {
  const dir = prefix === 'BUG' ? BUG_DIR : ITEM_DIR;
  let highest = 0;
  for (const file of recordFilesIn(root, dir)) {
    const match = new RegExp(`^${prefix}-(\\d{4})-`).exec(file.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ----------------------------------------------------------------- generating

/**
 * Write only when the content actually changed. Generated indexes are
 * regenerated on every task; rewriting an identical file churns mtimes, the
 * Obsidian sync, and the diff a reviewer has to read.
 */
export function writeIfChanged(path, content) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (existsSync(path) && readFileSync(path, 'utf8').replace(/\r\n/g, '\n') === normalized) {
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalized, 'utf8');
  return true;
}

/** Repository-relative path to the note, for a Markdown link from `fromDir`. */
export function linkTo(record, fromDir) {
  const depth = fromDir.split('/').filter(Boolean).length;
  const up = '../'.repeat(depth);
  return `${up}${record.relative}`;
}

export const GENERATED_BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.';
