#!/usr/bin/env node
/*
 * What QA must load before designing anything, for a given change.
 *
 * This is "QA does not rediscover testing from zero" made executable. Given the
 * modules a task touched, it returns the durable material that already applies:
 * the test plans, the reusable scenarios, the regressions those scenarios guard,
 * the open bug records for the same ground, and the bug patterns this repository
 * is known to produce there.
 *
 *   node scripts/qa-select.mjs services/api/src/modules/auth
 *   node scripts/qa-select.mjs --json apps/web/app/(authenticated)/payroll
 *   node scripts/qa-select.mjs --area authentication
 *
 * Selection is a starting point and never a boundary. QA still designs new
 * scenarios for new behaviour — this exists so the effort goes there rather than
 * into re-deriving cases the repository already paid for once.
 *
 * Exit codes: 0 always (an empty selection is a finding, not a failure)
 *             2 usage error
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords, isActive } from './lib/backlog-records.mjs';
import { COVERAGE_DIMENSIONS, loadQaRecords, selectForModules } from './lib/qa-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const areaIndex = argv.indexOf('--area');
const area = areaIndex === -1 ? '' : (argv[areaIndex + 1] ?? '');
/* Only skip the value position when --area was actually given; otherwise
 * areaIndex is -1 and `areaIndex + 1` would silently drop the first module. */
const modules = argv.filter(
  (arg, index) => !arg.startsWith('--') && !(areaIndex !== -1 && index === areaIndex + 1),
);

if (!modules.length && !area) {
  console.error('Usage: node scripts/qa-select.mjs [--json] <module-path> [module-path…]');
  console.error('       node scripts/qa-select.mjs --area <area>');
  console.error('');
  console.error('Modules are repository-relative paths, e.g. services/api/src/modules/auth');
  process.exit(2);
}

const qa = loadQaRecords(ROOT);
if (qa.errors.length) {
  console.error('QA records are invalid — fix them first with `node scripts/rebuild-qa.mjs`:');
  for (const error of qa.errors.slice(0, 10)) console.error(`  x ${error}`);
  process.exit(1);
}

let selection;
if (area) {
  const plans = qa.plans.filter((plan) => plan.area === area);
  const scenarios = qa.scenarios.filter((scenario) => scenario.area === area);
  selection = {
    plans,
    scenarios,
    mandatory: scenarios.filter((s) => s.type === 'SECURITY' || s.risk === 'CRITICAL'),
    regressions: [...new Set(scenarios.flatMap((s) => s.regressions))].sort(),
    bugs: [...new Set(scenarios.flatMap((s) => s.bugs))].sort(),
  };
} else {
  selection = selectForModules(qa, modules);
}

/* Open records for the same ground — what is already known to be wrong here. */
const { records } = loadRecords(ROOT);
const openHere = records.filter(
  (record) =>
    isActive(record) &&
    record.modules.some((module) =>
      modules.some((wanted) => module.startsWith(wanted) || wanted.startsWith(module)),
    ),
);

/* Bug patterns are prevention rules, not history — always worth naming. */
const patternDir = join(ROOT, 'docs/qa/known-bug-patterns');
const patterns = existsSync(patternDir)
  ? readdirSync(patternDir)
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .filter((name) => {
        const body = readFileSync(join(patternDir, name), 'utf8').toLowerCase();
        return modules.some((module) => body.includes(module.toLowerCase().split('/').pop() ?? ''));
      })
      .map((name) => `docs/qa/known-bug-patterns/${name}`)
  : [];

/* Coverage dimensions this change would be walking over unprotected. */
const gaps = selection.plans.flatMap((plan) =>
  Object.keys(COVERAGE_DIMENSIONS)
    .filter((dimension) => ['GAP', 'PARTIAL'].includes(plan.coverage[dimension]))
    .map((dimension) => ({ area: plan.area, dimension, status: plan.coverage[dimension] })),
);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        modules,
        area: area || null,
        plans: selection.plans.map((p) => ({ id: p.id, area: p.area, path: p.relative })),
        scenarios: selection.scenarios.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          risk: s.risk,
          automation: s.automation,
          testReference: s.testReference,
          path: s.relative,
        })),
        mandatory: selection.mandatory.map((s) => s.id),
        regressions: selection.regressions,
        relatedBugs: selection.bugs,
        openRecordsHere: openHere.map((r) => ({ id: r.id, title: r.title, severity: r.severity })),
        bugPatterns: patterns,
        coverageGaps: gaps,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log('');
console.log(`QA selection for: ${area ? `area ${area}` : modules.join(', ')}`);
console.log('');

console.log(`TEST_PLANS (${selection.plans.length})`);
for (const plan of selection.plans) console.log(`  ${plan.id}  ${plan.area.padEnd(24)} ${plan.relative}`);
if (!selection.plans.length) {
  console.log('  none — this area has no durable plan. Creating one is part of the task.');
}

console.log('');
console.log(`SCENARIOS_TO_RERUN (${selection.scenarios.length})`);
for (const scenario of selection.scenarios) {
  console.log(
    `  ${scenario.id.padEnd(16)} ${scenario.type.padEnd(14)} ${scenario.risk.padEnd(8)} ${scenario.automation.padEnd(24)} ${scenario.title}`,
  );
}
if (!selection.scenarios.length) console.log('  none recorded yet');

if (selection.mandatory.length) {
  console.log('');
  console.log(`MANDATORY (${selection.mandatory.length}) — security and CRITICAL risk are never risk-weighted down`);
  for (const scenario of selection.mandatory) console.log(`  ${scenario.id}  ${scenario.title}`);
}

console.log('');
console.log(`REGRESSIONS (${selection.regressions.length}) — docs/qa/regressions/index.md`);
console.log(`  ${selection.regressions.join(', ') || 'none linked'}`);

console.log('');
console.log(`OPEN_RECORDS_HERE (${openHere.length}) — already known to be wrong on this ground`);
for (const record of openHere) console.log(`  ${record.id}  ${record.severity.padEnd(8)} ${record.title}`);
if (!openHere.length) console.log('  none');

console.log('');
console.log(`BUG_PATTERNS (${patterns.length})`);
for (const pattern of patterns) console.log(`  ${pattern}`);
if (!patterns.length) console.log('  none matched — read docs/qa/known-bug-patterns/README.md anyway');

console.log('');
console.log(`COVERAGE_GAPS (${gaps.length})`);
for (const gap of gaps) console.log(`  ${gap.area.padEnd(24)} ${gap.dimension.padEnd(14)} ${gap.status}`);
if (!gaps.length) console.log('  none declared');
else {
  console.log('');
  console.log('  A change touching a GAP or PARTIAL dimension pulls closing it into scope,');
  console.log('  or files a TEST_GAP backlog item when that is too large for this task.');
}

console.log('');
console.log('This selection is a starting point, never a boundary. New behaviour still');
console.log('needs new scenarios — and the durable ones get promoted into docs/qa/scenarios/.');
console.log('');
