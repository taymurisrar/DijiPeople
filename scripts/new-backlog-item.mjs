#!/usr/bin/env node
/*
 * Scaffold a durable Backlog item under docs/backlog/items/.
 *
 * **Do not use this for a bug.** A Bug record is already a backlog entry — it
 * is indexed, triaged and prioritised exactly like an item. Creating a mirror
 * item for a bug produces two records that must be kept in step by hand, which
 * is the duplication the single-record model exists to avoid. Use
 * `scripts/new-bug.mjs`.
 *
 * This is for work that is genuinely not a defect: tech debt, an architecture
 * change, a test or infrastructure gap, an open product decision, a follow-up.
 *
 *   node scripts/new-backlog-item.mjs "Add browser E2E tooling" \
 *     --type TEST_GAP --priority P2 --severity MEDIUM \
 *     --module apps/admin --qa docs/qa/runs/2026-08-15-….md
 *
 * Exit codes: 0 created · 1 refused · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITEM_STATUSES,
  ITEM_TYPES,
  SEVERITIES,
  PRIORITIES,
  SOURCES,
  ITEM_DIR,
  nextId,
  slugify,
} from './lib/backlog-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const title = argv.find((arg) => !arg.startsWith('--'));

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

if (!title || argv.includes('--help')) {
  console.error('Usage: node scripts/new-backlog-item.mjs "<title>" [options]');
  console.error('');
  console.error(`  --type       ${ITEM_TYPES.join(' | ')}`);
  console.error('  --severity   CRITICAL | HIGH | MEDIUM | LOW   (optional for non-defect work)');
  console.error('  --priority   P0 | P1 | P2 | P3                (default P2)');
  console.error('  --status     default TRIAGE_REQUIRED');
  console.error('  --source     QA_RUN | REVIEWER | ARCHITECT | …');
  console.error('  --module     repeatable');
  console.error('  --qa         QA run that raised it');
  console.error('  --bug        BUG-nnnn this item supports');
  console.error('  --blocked-by BUG-nnnn / ITEM-nnnn');
  console.error('  --milestone  target milestone');
  console.error('');
  console.error('For a defect, use scripts/new-bug.mjs instead — a bug record IS a backlog item.');
  process.exit(2);
}

function requireOneOf(value, allowed, label, { optional = false } = {}) {
  if (optional && !value) return '';
  if (!allowed.includes(value)) {
    console.error(`${label} must be one of: ${allowed.join(' | ')} — got "${value}"`);
    process.exit(1);
  }
  return value;
}

const type = requireOneOf(option('type', 'FOLLOW_UP').toUpperCase(), ITEM_TYPES, '--type');
const status = requireOneOf(option('status', 'TRIAGE_REQUIRED').toUpperCase(), ITEM_STATUSES, '--status');
const priority = requireOneOf(option('priority', 'P2').toUpperCase(), PRIORITIES, '--priority');
const severity = requireOneOf(option('severity').toUpperCase(), SEVERITIES, '--severity', { optional: true });
const source = requireOneOf(option('source', 'ARCHITECT').toUpperCase(), SOURCES, '--source');

if (type === 'BUG') {
  console.error('Type BUG belongs in docs/bugs/ — run scripts/new-bug.mjs.');
  console.error('A bug record is indexed as a backlog entry already; a second record is duplication.');
  process.exit(1);
}

const modules = argv.flatMap((arg, index) => (arg === '--module' ? [argv[index + 1]] : [])).filter(Boolean);

const qaReport = option('qa');
if (qaReport && !existsSync(join(ROOT, qaReport))) {
  console.error(`--qa points at a file that does not exist: ${qaReport}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const id = nextId(ROOT, 'ITEM');
const filename = `${id}-${slugify(title)}.md`;
const path = join(ROOT, ITEM_DIR, filename);

if (existsSync(path)) {
  console.error(`${ITEM_DIR}/${filename} already exists — refusing to overwrite.`);
  process.exit(1);
}

let sha = 'UNKNOWN';
try {
  sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  /* A checkout without git history is unusual but not a reason to refuse. */
}

const frontmatter = [
  '---',
  `ID: ${id}`,
  // Records are filed under a long slug but referred to everywhere by the bare
  // id. Obsidian resolves that short form only through this line, so a record
  // without it has every short-form link pointing at it dead in the vault —
  // silently, because a dead wikilink renders as ordinary text (ITEM-0029).
  `aliases: [${id}]`,
  `Title: ${title}`,
  `Type: ${type}`,
  `Status: ${status}`,
  `Priority: ${priority}`,
  `Severity: ${severity}`,
  `AffectedModules: [${modules.join(', ')}]`,
  `Source: ${source}`,
  `OwnerAgent: ${option('owner', 'architect')}`,
  'ArchitectDisposition: TRIAGE_REQUIRED',
  `CreatedAt: ${today}`,
  `UpdatedAt: ${today}`,
  `RelatedBug: ${option('bug')}`,
  `RelatedQA: ${qaReport}`,
  `RelatedADR: ${option('adr')}`,
  'RelatedImplementation:',
  `TargetMilestone: ${option('milestone')}`,
  `BlockedBy: ${option('blocked-by')}`,
  '---',
].join('\n');

const body = [
  '## Summary',
  '',
  'What this is, in one paragraph.',
  '',
  '## Why It Matters',
  '',
  'The cost of not doing it. An item with no stated cost never gets prioritised.',
  '',
  '## Evidence',
  '',
  'Paths, line numbers, QA scenario ids, CI runs. No credentials.',
  '',
  '## Proposed Approach',
  '',
  'A direction. Say plainly if this needs an ExecPlan under `PLANS.md`.',
  '',
  '## Acceptance Criteria',
  '',
  'Verifiable statements. "Better error handling" is not one.',
  '',
  '## Dependencies',
  '',
  'What must land first.',
  '',
  '## Related Items',
  '',
  'Wikilinks to related bugs, items, modules and decisions.',
  '',
  '## History',
  '',
  `- ${today} — created at \`${sha}\`.`,
].join('\n');

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${frontmatter}\n\n# ${id} — ${title}\n\n${body}\n`, 'utf8');

console.log(`Created ${ITEM_DIR}/${filename}`);
console.log('Then: node scripts/rebuild-backlog.mjs');
