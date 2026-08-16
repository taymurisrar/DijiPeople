#!/usr/bin/env node
/*
 * Scaffold a reusable QA scenario under docs/qa/scenarios/.
 *
 * A scenario earns a permanent id when it has durable value — it guards a fixed
 * defect, it covers a security or tenant-isolation case, or it is a state
 * transition somebody will get wrong again. A one-off check belongs in the QA
 * run and nowhere else; promoting everything turns the registry into noise and
 * nobody re-runs any of it.
 *
 *   node scripts/new-qa-scenario.mjs "Foreign-tenant error log is not readable" \
 *     --scope TENANT --area tenant-isolation --type SECURITY --risk CRITICAL \
 *     --module services/api/src/modules/error-logs \
 *     --automation AUTOMATED --test services/api/src/modules/error-logs/error-logs.service.spec.ts \
 *     --bug BUG-0005 --regression REG-005
 *
 * Exit codes: 0 created · 1 refused · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATION_STATUSES,
  RISKS,
  SCENARIO_DIR,
  SCENARIO_TYPES,
  nextScenarioId,
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
  console.error('Usage: node scripts/new-qa-scenario.mjs "<title>" [options]');
  console.error('');
  console.error('  --scope       id scope, e.g. AUTH TENANT PAYROLL AGENT   (required)');
  console.error('  --area        the test plan area it belongs to           (required)');
  console.error(`  --type        ${SCENARIO_TYPES.join(' | ')}`);
  console.error(`  --risk        ${RISKS.join(' | ')}`);
  console.error('  --module      repeatable; the module under test');
  console.error(`  --automation  ${AUTOMATION_STATUSES.join(' | ')}`);
  console.error('  --test        path to the automated test, if there is one');
  console.error('  --bug         repeatable; BUG-nnnn this guards');
  console.error('  --regression  repeatable; REG-nnn this implements');
  process.exit(2);
}

const requireOneOf = (value, allowed, label) => {
  if (!allowed.includes(value)) {
    console.error(`${label} must be one of: ${allowed.join(' | ')} — got "${value}"`);
    process.exit(1);
  }
  return value;
};

const scope = option('scope').toUpperCase();
const area = option('area');
if (!scope || !/^[A-Z0-9]+$/.test(scope)) {
  console.error('--scope is required and must be A-Z0-9, e.g. AUTH, TENANT, PAYROLL.');
  process.exit(2);
}
if (!area) {
  console.error('--area is required: a scenario outside every test plan is never selected for a re-run.');
  process.exit(2);
}

const type = requireOneOf(option('type', 'API').toUpperCase(), SCENARIO_TYPES, '--type');
const risk = requireOneOf(option('risk', 'MEDIUM').toUpperCase(), RISKS, '--risk');
const automation = requireOneOf(
  option('automation', 'MANUAL').toUpperCase(),
  AUTOMATION_STATUSES,
  '--automation',
);

const test = option('test');
if (['AUTOMATED', 'PARTIAL'].includes(automation)) {
  if (!test) {
    console.error(`--automation ${automation} requires --test: a scenario claiming automation must name it.`);
    process.exit(1);
  }
  if (!existsSync(join(ROOT, test))) {
    console.error(`--test points at a file that does not exist: ${test}`);
    console.error('An automated scenario naming a missing test reports coverage that is not there.');
    process.exit(1);
  }
}

function git(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const today = new Date().toISOString().slice(0, 10);
const id = nextScenarioId(ROOT, scope, { note: title });
const filename = `${id}-${slugify(title)}.md`;
const path = join(ROOT, SCENARIO_DIR, filename);

if (existsSync(path)) {
  console.error(`${SCENARIO_DIR}/${filename} already exists — refusing to overwrite.`);
  process.exit(1);
}

const frontmatter = [
  '---',
  `SCENARIO_ID: ${id}`,
  `aliases: [${id}]`,
  `TITLE: ${title}`,
  `AREA: ${area}`,
  `MODULE: ${many('module')[0] ?? ''}`,
  `TYPE: ${type}`,
  `RISK: ${risk}`,
  `AUTOMATION_STATUS: ${automation}`,
  `TEST_REFERENCE: ${test}`,
  `RELATED_BUGS: [${many('bug').join(', ')}]`,
  `RELATED_REGRESSIONS: [${many('regression').join(', ')}]`,
  `LAST_RUN: ${option('last-run')}`,
  `LAST_RESULT: ${option('last-result', 'NOT_RUN').toUpperCase()}`,
  `CREATED_AT: ${today}`,
  `UPDATED_AT: ${today}`,
  '---',
].join('\n');

const body = [
  `# ${id} — ${title}`,
  '',
  '## Preconditions',
  '',
  'The state the system must be in. Roles, tenants, seeded data, feature flags.',
  '',
  '## Steps',
  '',
  '1. ',
  '',
  '## Expected Result',
  '',
  'What correct looks like — written **before** the scenario is run. Deciding what',
  '"correct" means after seeing the output is not testing.',
  '',
  '## Notes',
  '',
  `Created ${today} at \`${git(['rev-parse', '--short', 'HEAD'], 'unknown')}\`.`,
  '',
].join('\n');

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${frontmatter}\n\n${body}`, 'utf8');

console.log(`Created ${SCENARIO_DIR}/${filename}`);
console.log('');
console.log('Next:');
console.log('  1. Fill Steps and Expected Result — a scenario without them cannot be re-run.');
console.log(`  2. Confirm a test plan exists for area "${area}".`);
console.log('  3. node scripts/rebuild-qa.mjs');
