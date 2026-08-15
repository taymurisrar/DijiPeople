#!/usr/bin/env node
/*
 * Scaffold a durable Bug record under docs/bugs/.
 *
 * It allocates the next id safely, fills the metadata a machine can derive
 * (dates, the current SHA, the QA run path) and lays out the required body
 * sections. It deliberately does **not** write a summary, a root cause or an
 * impact assessment: those are QA's evidence and judgement, and a script that
 * guesses them produces confident records nobody verified.
 *
 *   node scripts/new-bug.mjs "Signed agreements are mutable" \
 *     --severity HIGH --type STATE_MACHINE --priority P1 \
 *     --qa docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md \
 *     --module services/api/src/modules/contracts
 *
 * Exit codes: 0 created · 1 refused (bad value, or the file already exists)
 *             2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUG_STATUSES,
  BUG_TYPES,
  SEVERITIES,
  PRIORITIES,
  SOURCES,
  BUG_SECTIONS,
  BUG_DIR,
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
  console.error('Usage: node scripts/new-bug.mjs "<title>" [options]');
  console.error('');
  console.error('  --severity   CRITICAL | HIGH | MEDIUM | LOW          (required)');
  console.error('  --type       one of the Bug types                    (default BUG)');
  console.error('  --priority   P0 | P1 | P2 | P3                       (default derived from severity)');
  console.error('  --status     default OPEN');
  console.error('  --source     QA_RUN | REVIEWER | USER_REPORT | …     (default QA_RUN)');
  console.error('  --qa         path to the QA run that found it');
  console.error('  --module     repeatable; affected module path');
  console.error('  --owner      agent that owns the fix                 (default architect)');
  console.error('  --regression REG-nnn, once a regression test exists');
  process.exit(2);
}

function requireOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    console.error(`${label} must be one of: ${allowed.join(' | ')} — got "${value}"`);
    process.exit(1);
  }
  return value;
}

const severity = requireOneOf(option('severity').toUpperCase(), SEVERITIES, '--severity');
const type = requireOneOf(option('type', 'BUG').toUpperCase(), BUG_TYPES, '--type');
const status = requireOneOf(option('status', 'OPEN').toUpperCase(), BUG_STATUSES, '--status');
const source = requireOneOf(option('source', 'QA_RUN').toUpperCase(), SOURCES, '--source');

/* A default, not a decision: the Architect re-prioritises during triage. */
const DEFAULT_PRIORITY = { CRITICAL: 'P0', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' };
const priority = requireOneOf(
  option('priority', DEFAULT_PRIORITY[severity]).toUpperCase(),
  PRIORITIES,
  '--priority',
);

/* Collect every --module occurrence, not just the first. */
const modules = argv.flatMap((arg, index) => (arg === '--module' ? [argv[index + 1]] : [])).filter(Boolean);

const qaReport = option('qa');
if (qaReport && !existsSync(join(ROOT, qaReport))) {
  console.error(`--qa points at a file that does not exist: ${qaReport}`);
  console.error('A QA reference that does not resolve is worse than none — it reads as evidence.');
  process.exit(1);
}

function gitOutput(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const today = new Date().toISOString().slice(0, 10);
const sha = gitOutput(['rev-parse', '--short', 'HEAD'], 'UNKNOWN');

const id = nextId(ROOT, 'BUG');
const filename = `${id}-${slugify(title)}.md`;
const path = join(ROOT, BUG_DIR, filename);

if (existsSync(path)) {
  console.error(`${BUG_DIR}/${filename} already exists — refusing to overwrite.`);
  process.exit(1);
}

const frontmatter = [
  '---',
  `ID: ${id}`,
  `Title: ${title}`,
  `Status: ${status}`,
  `Severity: ${severity}`,
  `Priority: ${priority}`,
  `Type: ${type}`,
  `Source: ${source}`,
  `DetectedDate: ${today}`,
  `DetectedInSha: ${sha}`,
  `AffectedModules: [${modules.join(', ')}]`,
  `OwnerAgent: ${option('owner', 'architect')}`,
  'ArchitectDisposition: TRIAGE_REQUIRED',
  `QAReport: ${qaReport}`,
  `RegressionId: ${option('regression')}`,
  'RelatedBacklogItem:',
  'RelatedDecision:',
  'RelatedImplementation:',
  `CreatedAt: ${today}`,
  `UpdatedAt: ${today}`,
  'ResolvedAt:',
  '---',
].join('\n');

const PROMPTS = {
  Summary: 'One paragraph: what is wrong, for someone who has never seen this module.',
  'Expected Behavior': 'What the system should do. State it before describing the failure.',
  'Actual Behavior': 'What it does instead.',
  Reproduction: 'Numbered steps, with the exact request/state. A bug nobody can reproduce is a rumour.',
  Evidence:
    'Paths with line numbers, request/response shapes, database rows, test output. **Never a credential, token or connection string.**',
  'Root Cause': 'Why it happens — not the symptom. Leave empty until it is actually established.',
  Impact: 'Who is affected, how badly, and whether it is reachable in production.',
  'Affected Areas': 'Modules, endpoints, screens and consumers.',
  'Proposed Resolution': 'A direction, not a patch. Say if it needs an ExecPlan.',
  'Acceptance Criteria': 'Verifiable statements QA can retest against.',
  'Regression Coverage': 'The test that must fail without the fix, and its `REG-nnn` entry once it exists.',
  Dependencies: 'Other records, decisions or infrastructure this waits on.',
  'Related Items': 'Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.',
  Resolution: 'What was actually changed, with the commit or branch. Filled at fix time.',
  'QA Retest': 'Which QA run verified the fix, and the scenario ids.',
  History: `- ${today} — created from ${source.toLowerCase().replace('_', ' ')} at \`${sha}\`.`,
};

const body = BUG_SECTIONS.map((section) => `## ${section}\n\n${PROMPTS[section] ?? ''}`).join('\n\n');

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${frontmatter}\n\n# ${id} — ${title}\n\n${body}\n`, 'utf8');

console.log(`Created ${BUG_DIR}/${filename}`);
console.log('');
console.log('Next, in this order:');
console.log('  1. Fill Evidence and Reproduction — the record is not durable without them.');
console.log('  2. Leave ArchitectDisposition as TRIAGE_REQUIRED. The Architect sets it, not QA.');
console.log('  3. node scripts/rebuild-backlog.mjs');
