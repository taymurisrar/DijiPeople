#!/usr/bin/env node
/*
 * Scaffold a durable QA test plan under docs/qa/test-plans/.
 *
 * One plan per product area, evergreen, updated in place. It answers the
 * question a QA run cannot: **what must always be true about this area**,
 * regardless of which task is in flight.
 *
 * The coverage declarations start at GAP deliberately. A scaffolder that
 * defaulted them to GOOD would produce a matrix full of coverage nobody has —
 * and the matrix is read as evidence.
 *
 *   node scripts/new-test-plan.mjs "Authentication" --area authentication \
 *     --risk CRITICAL --module services/api/src/modules/auth
 *
 * Exit codes: 0 created · 1 refused · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COVERAGE_DIMENSIONS,
  PLAN_DIR,
  PLAN_SECTIONS,
  RISKS,
  nextPlanId,
  slugify,
} from './lib/qa-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const title = argv.find((arg) => !arg.startsWith('--'));

const option = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
};
const many = (name) => argv.flatMap((arg, i) => (arg === `--${name}` ? [argv[i + 1]] : [])).filter(Boolean);

if (!title || argv.includes('--help')) {
  console.error('Usage: node scripts/new-test-plan.mjs "<title>" --area <area> [options]');
  console.error('');
  console.error('  --area    stable slug the scenarios reference   (required)');
  console.error(`  --risk    ${RISKS.join(' | ')}`);
  console.error('  --module  repeatable; modules the area covers');
  console.error('  --bug     repeatable; BUG-nnnn that shaped this plan');
  process.exit(2);
}

const area = option('area');
if (!area || !/^[a-z0-9-]+$/.test(area)) {
  console.error('--area is required and must be a lower-case slug, e.g. tenant-isolation.');
  process.exit(2);
}

const risk = option('risk', 'MEDIUM').toUpperCase();
if (!RISKS.includes(risk)) {
  console.error(`--risk must be one of: ${RISKS.join(' | ')}`);
  process.exit(1);
}

function git(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const today = new Date().toISOString().slice(0, 10);
const sha = git(['rev-parse', '--short', 'HEAD'], 'UNKNOWN');
const id = nextPlanId(ROOT, { note: title });
const filename = `${id}-${slugify(area)}.md`;
const path = join(ROOT, PLAN_DIR, filename);

if (existsSync(path)) {
  console.error(`${PLAN_DIR}/${filename} already exists — refusing to overwrite.`);
  process.exit(1);
}

const frontmatter = [
  '---',
  `PLAN_ID: ${id}`,
  `aliases: [${id}]`,
  `TITLE: ${title}`,
  `AREA: ${area}`,
  'STATUS: DRAFT',
  `MODULES: [${many('module').join(', ')}]`,
  `RISK: ${risk}`,
  ...Object.keys(COVERAGE_DIMENSIONS).map((dimension) => `COVERAGE_${dimension}: GAP`),
  `RELATED_BUGS: [${many('bug').join(', ')}]`,
  'RELATED_REGRESSIONS: []',
  `CREATED_AT: ${today}`,
  `UPDATED_AT: ${today}`,
  `VERIFIED_AGAINST_SHA: ${sha}`,
  '---',
].join('\n');

const PROMPTS = {
  Scope: 'What this area is, and what it deliberately excludes. Name the modules and the surfaces.',
  Risks: 'What goes wrong here, ranked. Draw on docs/bugs and docs/qa/known-bug-patterns rather than imagination.',
  Preconditions: 'Seeds, roles, tenants, environment and external services a run of this plan needs.',
  'Test Types': 'Which of UNIT / API / DATABASE / INTEGRATION / E2E / BROWSER_E2E / SECURITY apply, and which cannot run here — with the blocker.',
  'Data Requirements': 'Fixtures and the tenants they belong to. Never a credential.',
  'Security Cases': 'Authorization negatives, cross-tenant reads and writes, sensitive-field exposure. Mandatory where the area touches tenant data.',
  'Negative Cases': 'Invalid input, wrong state, missing permission, absent record.',
  'State Transitions': 'The legal transitions, and the illegal ones that must be rejected.',
  'Integration Cases': 'External boundaries — timeout, 5xx, malformed payload, replay, idempotency.',
  'Browser Cases': 'What a real browser would have to prove. State the tooling status honestly.',
  'Regression Links': 'REG-nnn entries this area owns, and the scenarios that implement them.',
};

const body = [
  `# ${id} — ${title}`,
  '',
  ...PLAN_SECTIONS.flatMap((section) => [`## ${section}`, '', PROMPTS[section], '']),
].join('\n');

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${frontmatter}\n\n${body}`, 'utf8');

console.log(`Created ${PLAN_DIR}/${filename}`);
console.log('');
console.log('Next:');
console.log('  1. Fill every section from real evidence — never from what the area should do.');
console.log('  2. Raise a COVERAGE_ declaration only once a scenario evidences it.');
console.log('  3. node scripts/rebuild-qa.mjs');
