#!/usr/bin/env node
/*
 * Scaffold a durable parent Task record under docs/tasks/.
 *
 * Required for LARGE and PROGRAM tasks. The record carries the decomposition,
 * the dependency graph and the block reasons — the state a new session needs to
 * resume without re-deriving decisions the last one already made.
 *
 * It allocates the id, fills what a machine can derive, and lays out the
 * required sections. It deliberately does **not** invent work packages: the
 * decomposition is the Architect's judgement, and a script that guesses
 * boundaries produces "files 1-10 / files 11-20", which is the shape the
 * framework explicitly rejects.
 *
 *   node scripts/new-task.mjs "Attendance geofencing" --type FEATURE --size LARGE
 *
 * Exit codes: 0 created · 1 refused (bad value, or the file already exists)
 *             2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIORITIES } from './lib/backlog-records.mjs';
import {
  TASK_DIR,
  TASK_SIZES,
  TASK_STATUSES,
  TASK_TYPES,
  TASK_SECTIONS,
  nextTaskId,
  slugify,
} from './lib/task-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const title = argv.find((arg) => !arg.startsWith('--'));

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

if (!title || argv.includes('--help')) {
  console.error('Usage: node scripts/new-task.mjs "<title>" [options]');
  console.error('');
  console.error('  --type      the routed keyword — FEATURE | BUG | SECURITY | …  (required)');
  console.error('  --size      SMALL | MEDIUM | LARGE | PROGRAM                   (default LARGE)');
  console.error('  --priority  P0 | P1 | P2 | P3                                  (default P1)');
  console.error('  --status    default NOT_STARTED');
  console.error('  --module    repeatable; affected module path');
  console.error('  --agent     repeatable; specialist required');
  console.error('');
  console.error('LARGE and PROGRAM records must carry a Work Packages table before');
  console.error('`node scripts/rebuild-tasks.mjs --check` will accept them.');
  process.exit(2);
}

function requireOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    console.error(`${label} must be one of: ${allowed.join(' | ')} — got "${value}"`);
    process.exit(1);
  }
  return value;
}

/* TYPE is not uppercased blindly: "UI/UX" must survive as written. */
const rawType = option('type');
if (!rawType) {
  console.error('--type is required. It is the routed keyword — see .agent/context/task-router.md');
  process.exit(2);
}
const type = requireOneOf(rawType.toUpperCase(), TASK_TYPES, '--type');
const size = requireOneOf(option('size', 'LARGE').toUpperCase(), TASK_SIZES, '--size');
const status = requireOneOf(option('status', 'NOT_STARTED').toUpperCase(), TASK_STATUSES, '--status');
const priority = requireOneOf(option('priority', 'P1').toUpperCase(), PRIORITIES, '--priority');

const modules = argv.flatMap((arg, index) => (arg === '--module' ? [argv[index + 1]] : [])).filter(Boolean);
const agents = argv.flatMap((arg, index) => (arg === '--agent' ? [argv[index + 1]] : [])).filter(Boolean);

function gitOutput(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const today = new Date().toISOString().slice(0, 10);
const sha = gitOutput(['rev-parse', '--short', 'HEAD'], 'UNKNOWN');

const id = nextTaskId(ROOT);
const filename = `${id}-${slugify(title)}.md`;
const path = join(ROOT, TASK_DIR, filename);

if (existsSync(path)) {
  console.error(`${TASK_DIR}/${filename} already exists — refusing to overwrite.`);
  process.exit(1);
}

const frontmatter = [
  '---',
  `TASK_ID: ${id}`,
  // Obsidian resolves a bare-id wikilink only through `aliases:`. Without this
  // line every `[[TASK-nnnn]]` in the vault renders as ordinary text rather
  // than announcing itself as broken — see BUG-0059.
  `aliases: [${id}]`,
  `TITLE: ${title}`,
  `TYPE: ${type}`,
  `SIZE: ${size}`,
  `STATUS: ${status}`,
  `PRIORITY: ${priority}`,
  `CREATED_AT: ${today}`,
  `AFFECTED_MODULES: [${modules.join(', ')}]`,
  `AGENTS: [${agents.join(', ')}]`,
  'DEPENDENCIES:',
  'CURRENT_PACKAGE:',
  'COMPLETED_PACKAGES: []',
  'BLOCKED_PACKAGES: []',
  'OWNER_DECISIONS: 0',
  'FINAL_STATUS:',
  '---',
].join('\n');

const WP_TABLE = [
  '| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  `| WP-01 | <first package> | NOT_STARTED | — | <agent> | agent/<feature>-<scope> | — | — | — | — | — |`,
].join('\n');

const PROMPTS = {
  Objective:
    'What this task achieves, and how a reader knows it is finished. One paragraph.',
  'Work Packages':
    'Boundaries follow ownership and dependency — schema, backend, frontend, security,\n' +
    'integration, migration, QA, browser E2E, deployment. Never "files 1-10".\n' +
    'A good package can be reviewed on its own and has one owning specialist.\n\n' +
    `${WP_TABLE}`,
  Assumptions:
    'One row per material assumption. LOW confidence with high impact must be verified\n' +
    'before work depends on it.\n\n' +
    '| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |\n' +
    '|---|---|---|---|---|\n' +
    '| A-01 |  |  | HIGH \\| MEDIUM \\| LOW |  |',
  'Owner Decisions':
    'Genuine product or business questions only. Anything an agent can establish by\n' +
    'reading this repository is an assumption to verify, not a question to ask.\n\n' +
    'None.',
  'Repository Health':
    'PRE_TASK_REPO_HEALTH and POST_TASK_REPO_HEALTH, with MAIN_SYNC_STATUS at each.\n' +
    'See `node scripts/repo-health.mjs`.',
  History: `- ${today} — created at \`${sha}\`.`,
};

const body = TASK_SECTIONS.map((section) => `## ${section}\n\n${PROMPTS[section] ?? ''}`).join('\n\n');

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${frontmatter}\n\n# ${id} — ${title}\n\n${body}\n`, 'utf8');

console.log(`Created ${TASK_DIR}/${filename}`);
console.log('');
console.log('Next, in this order:');
console.log('  1. Decompose into work packages by ownership — not by file ranges.');
console.log('  2. Set DEPENDENCIES so continuation can compute what is READY.');
console.log('  3. node scripts/rebuild-tasks.mjs');
