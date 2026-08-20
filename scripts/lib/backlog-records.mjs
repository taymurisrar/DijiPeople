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

import { allocateId } from './id-allocator.mjs';

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

/**
 * Statuses that claim the work is done, as opposed to merely decided.
 *
 * Deliberately not `BUG_TERMINAL`: that set is about records that are *closed*,
 * and it excludes `FIXED` while including `NOT_A_BUG`, `DUPLICATE` and
 * `ACCEPTED_RISK`. The question here is narrower — "does this record assert a
 * fix?" — and `FIXED` is the status that asserts one most often.
 */
const BUG_STATUS_CLAIMS_A_FIX = new Set(['FIXED', 'VERIFIED', 'CLOSED']);

/**
 * Prose that means "this has not been done yet".
 *
 * Kept short, literal and anchored to the start of the section. A cleverer
 * pattern that fires on real records would be worse than no check at all,
 * because the response to a noisy gate is to stop reading it.
 */
const UNFINISHED_PROSE =
  /^(pending\b|tbd\b|to be (added|written|determined|decided|filled)|to follow\b|awaiting\b|not yet\b|none yet\b)/i;

/**
 * The text of one `## Section`, up to the next `##` heading of any level 2.
 * Markdown emphasis and list markers are stripped so the placeholder patterns
 * above match "**Pending.**" as readily as "Pending."
 */
function sectionText(body, section) {
  const heading = new RegExp(
    `^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm',
  );
  const start = heading.exec(body);
  if (!start) return null;
  const rest = body.slice(start.index + start[0].length);
  const next = /^##\s+/m.exec(rest);
  const raw = next ? rest.slice(0, next.index) : rest;
  return raw
    .replace(/[*_`~>#]/g, '')
    .replace(/^[-+]\s+/gm, '')
    .trim();
}

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

  const createdAt = String(fields.CreatedAt ?? '').trim();
  const updatedAt = String(fields.UpdatedAt ?? '').trim();
  const resolvedAt = String(fields.ResolvedAt ?? '').trim();
  if (createdAt && updatedAt && updatedAt < createdAt) {
    errors.push(`${where}: UpdatedAt ${updatedAt} predates CreatedAt ${createdAt}`);
  }
  if (createdAt && resolvedAt && resolvedAt < createdAt) {
    errors.push(`${where}: ResolvedAt ${resolvedAt} predates CreatedAt ${createdAt}`);
  }

  const status = String(fields.Status ?? '').trim();
  const disposition = String(fields.ArchitectDisposition ?? '').trim();
  const terminalDisposition =
    kind === 'bug'
      ? {
          VERIFIED: 'DONE',
          CLOSED: 'DONE',
          NOT_A_BUG: 'NOT_A_BUG',
          DUPLICATE: 'DUPLICATE',
          ACCEPTED_RISK: 'ACCEPTED_RISK',
        }[status]
      : {
          DONE: 'DONE',
          CANCELLED: 'DONE',
          DUPLICATE: 'DUPLICATE',
        }[status];

  if (terminalDisposition && disposition !== terminalDisposition) {
    errors.push(
      `${where}: terminal Status ${status} requires ArchitectDisposition ${terminalDisposition}, got ${disposition || '(empty)'}`,
    );
  }

  for (const [alignedStatus, alignedDisposition] of [
    ['DEFERRED', 'DEFER'],
    ['PRODUCT_DECISION', 'PRODUCT_DECISION'],
  ]) {
    if (status === alignedStatus && disposition !== alignedDisposition) {
      errors.push(
        `${where}: Status ${alignedStatus} requires ArchitectDisposition ${alignedDisposition}`,
      );
    }
    if (disposition === alignedDisposition && status !== alignedStatus) {
      errors.push(
        `${where}: ArchitectDisposition ${alignedDisposition} requires Status ${alignedStatus}`,
      );
    }
  }

  /*
   * Semantic contradiction between a terminal status and the record's own prose.
   *
   * Structural validation already checks that Status and ArchitectDisposition
   * agree with each other. It cannot see the case that actually happened here:
   * a record whose frontmatter said VERIFIED sitting above a QA Retest section
   * that said the retest had not been run. Both fields were internally
   * consistent, and the record was still false.
   *
   * Deliberately bounded to phrases that cannot mean anything else in the
   * section they appear in. A validator that guesses at prose produces false
   * positives, and the first response to a noisy validator is to stop reading
   * it — which costs more than the check was worth. Anything needing
   * interpretation is the Reviewer's job, not this function's.
   */
  const contradictions = [
    {
      section: 'QA Retest',
      statuses: ['VERIFIED', 'CLOSED'],
      pattern:
        /\b(not (?:yet )?(?:been )?(?:re)?(?:tested|verified|executed|run)|retest (?:is )?(?:still )?pending|awaiting (?:qa )?retest)\b/i,
      says: 'the retest has not happened',
    },
    {
      section: 'Resolution',
      statuses: ['VERIFIED', 'CLOSED', 'FIXED', 'DONE'],
      pattern:
        /\b(not (?:yet )?(?:been )?implemented|implementation (?:is )?(?:still )?in progress|pending (?:a )?product decision|no fix (?:has been )?(?:applied|written))\b/i,
      says: 'the fix has not landed',
    },
  ];

  for (const rule of contradictions) {
    if (!rule.statuses.includes(status)) continue;

    /*
     * `[^\S\r\n]*` rather than `\s*` after the heading: `\s*` is greedy across
     * newlines, so an empty section swallows its own boundary and captures
     * everything after it — which would make this rule read the *next*
     * section's prose and attribute it to this one.
     */
    const escaped = rule.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(
      `##[^\\S\\r\\n]+${escaped}[^\\S\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##[^\\S\\r\\n]|$)`,
    ).exec(record.body);
    if (!block) continue;

    /*
     * Blockquotes and code fences describe history — "this used to say the
     * retest was pending" — rather than the current state, and flagging them
     * would punish exactly the records that explain themselves best.
     */
    const prose = block[1]
      .replace(/```[\s\S]*?```/g, '')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('>'))
      .join('\n');

    /*
     * The opening line of the section is the verdict; everything after it is
     * qualification. A section that begins "Pass, with one honest gap" and later
     * says "not verified end-to-end" is a *good* record — it ran the retest and
     * stated precisely what it could not cover.
     *
     * BUG-0034 is exactly that record, and flagging it was this check's first
     * output. Punishing the records that explain their own limits is how a
     * validator teaches people to stop writing limits down.
     */
    const verdict = prose.split(/\r?\n/).find((line) => line.trim());
    if (verdict && /^\**\s*(pass|passed|verified|re-?tested|green|confirmed)\b/i.test(verdict.trim())) {
      continue;
    }

    /*
     * A scoped negative is a stated gap, not a contradiction. "Not verified
     * end-to-end" and "not tested against a real provider" both mean the retest
     * happened and its boundary is being declared.
     */
    const scoped = new RegExp(
      `${rule.pattern.source}\\s*(end.to.end|in production|against|on real|in this environment|manually|locally)`,
      'i',
    );
    if (scoped.test(prose)) continue;

    const hit = rule.pattern.exec(prose);
    if (hit) {
      errors.push(
        `${where}: Status ${status} contradicts its own "## ${rule.section}" section, which says ${rule.says} ("${hit[0].trim()}")`,
      );
    }
  }

  if (record.body.split(/\r?\n/).some((line) => line.trim() === '</content>')) {
    errors.push(`${where}: contains stray literal </content> wrapper text`);
  }

  if (kind === 'bug') {
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

    let previousSection = -1;
    for (const section of BUG_SECTIONS) {
      const match = new RegExp(
        `^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`,
        'm',
      ).exec(record.body);
      if (!match) {
        errors.push(`${where}: missing required section "## ${section}"`);
        continue;
      }
      if (match.index < previousSection) {
        errors.push(`${where}: required section "## ${section}" is out of order`);
      }
      previousSection = Math.max(previousSection, match.index);
    }

    /*
     * A record that claims a fix must describe one — ITEM-0071.
     *
     * Everything above this point validates frontmatter, or that a section
     * *exists* and is in the right place. Nothing validated what a section
     * said, so a record could make two opposite claims and pass: BUG-0080
     * carried `Status: FIXED` and `RegressionId: REG-075` above a `##
     * Resolution` reading, in full, "Pending a product decision."
     *
     * That is not cosmetic. The generated fields are checked and were right;
     * the prose is hand-written, unchecked, and more persuasive because it
     * explains itself. A later reader believed the prose, reversed a correct
     * status, changed working billing code, and put a settled product decision
     * back to the owner. All of it had to be reverted.
     *
     * The check is one-directional on purpose. "Terminal status, unfinished
     * prose" is unambiguous. The mirror case — an open record whose Resolution
     * claims completion — cannot be detected without guessing, and a guess here
     * would produce exactly the false positives that teach people to ignore the
     * gate.
     */
    if (BUG_STATUS_CLAIMS_A_FIX.has(status)) {
      for (const section of ['Resolution', 'QA Retest']) {
        // `VERIFIED` is the status that asserts QA looked; `FIXED` is not.
        if (section === 'QA Retest' && status === 'FIXED') continue;

        const text = sectionText(record.body, section);
        if (text === null) continue; // already reported as missing above

        if (!text) {
          errors.push(
            `${where}: Status ${status} but "## ${section}" is empty — say what was done`,
          );
        } else if (UNFINISHED_PROSE.test(text)) {
          errors.push(
            `${where}: Status ${status} but "## ${section}" still reads "${text.split('\n')[0].slice(0, 60)}" — ` +
              'the status and the prose disagree',
          );
        }
      }
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

  /* Evidence paths and regression links are part of record truth, not prose. */
  const registerPath = join(root, 'docs/qa/regressions/index.md');
  const regressionRegister = existsSync(registerPath) ? readFileSync(registerPath, 'utf8') : '';
  const regressionEntries = new Map(
    regressionRegister
      .split(/(?=^### REG-)/m)
      .map((entry) => [(/^### (REG-\d{3})/.exec(entry) ?? [])[1], entry])
      .filter(([id]) => id),
  );
  for (const record of records) {
    for (const field of ['QAReport', 'RelatedQA', 'RelatedADR', 'RelatedImplementation']) {
      for (const value of asList(record.fields[field])) {
        if (!value.startsWith('docs/')) continue;
        if (!existsSync(join(root, value))) {
          errors.push(`${record.relative}: ${field} references missing path ${value}`);
        }
      }
    }

    if (record.kind !== 'bug') continue;
    const regressionId = String(record.fields.RegressionId ?? '').trim();
    if (['FIXED', 'VERIFIED', 'CLOSED'].includes(record.status) && !regressionId) {
      errors.push(
        `${record.relative}: Status ${record.status} requires RegressionId so the fix has durable regression coverage`,
      );
    }
    if (regressionId && !regressionEntries.has(regressionId)) {
      errors.push(`${record.relative}: RegressionId ${regressionId} is absent from the regression register`);
    } else if (regressionId) {
      const entry = regressionEntries.get(regressionId);
      const active =
        (/^\|\s*\*\*Active\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(entry) ?? [])[1] ?? '';
      if (['FIXED', 'VERIFIED', 'CLOSED'].includes(record.status) && active.trim().toLowerCase() !== 'yes') {
        errors.push(
          `${record.relative}: Status ${record.status} requires RegressionId ${regressionId} to be active`,
        );
      }
      const rootCell =
        (/^\|\s*\*\*Bug record\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(entry) ?? [])[1] ?? '';
      const rootIds = [...rootCell.matchAll(/\bBUG-\d{4}\b/g)].map((match) => match[0]);
      if (!rootIds.includes(record.id)) {
        errors.push(
          `${record.relative}: RegressionId ${regressionId} does not name ${record.id} in its Bug record field`,
        );
      }
    }
  }

  /* A completed blocker cannot still describe why active work cannot move. */
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) {
    for (const reference of asList(record.fields.BlockedBy)) {
      const blocker = byId.get(reference);
      if (blocker && isTerminal(blocker)) {
        errors.push(
          `${record.relative}: BlockedBy ${reference} is terminal (${blocker.status}); clear or replace the discharged dependency`,
        );
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

/**
 * Reserve the next id for a prefix — atomically, and across every branch.
 *
 * This was `max(ids visible in the working tree) + 1`, which is right for one
 * agent on one branch and wrong for every other case: two concurrent sessions
 * on two branches both see the same highest id and both take the next one. That
 * collision has landed twice — see the commits titled "renumber colliding
 * record ids" and "(second occurrence)".
 *
 * `allocateId` scans every ref and holds a cross-worktree lock while it
 * reserves, so a second caller sees the first caller's reservation even before
 * the record file exists. See scripts/lib/id-allocator.mjs.
 */
export function nextId(root, prefix, { sessionId = '', note = '' } = {}) {
  return allocateId(root, prefix === 'BUG' ? 'bug' : 'item', { sessionId, note });
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
