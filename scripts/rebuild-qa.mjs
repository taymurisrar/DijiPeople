#!/usr/bin/env node
/*
 * Validate the durable QA records and regenerate their indexes.
 *
 *   node scripts/rebuild-qa.mjs           rewrite the indexes and the coverage matrix
 *   node scripts/rebuild-qa.mjs --check   fail if a record is invalid or an index is stale
 *
 * The coverage matrix is generated from what each plan **declares**, not from a
 * count of scenario files. A generated count would happily report GOOD coverage
 * for an area with fifty shallow scenarios and none for an area with three that
 * matter. What the generator does instead is refuse to publish a declaration its
 * scenarios contradict — see the cross-checks in scripts/lib/qa-records.mjs.
 *
 * Exit codes: 0 success · 1 a record is invalid, or --check found drift
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './lib/backlog-records.mjs';
import {
  COVERAGE_DIMENSIONS,
  GENERATED_BANNER,
  PLAN_DIR,
  SCENARIO_DIR,
  loadQaRecords,
  writeIfChanged,
} from './lib/qa-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

/* Bug and item ids, so a plan cannot link to a record that does not exist. */
let knownRecordIds = null;
try {
  const { records } = loadRecords(ROOT);
  knownRecordIds = new Set(records.map((record) => record.id).filter(Boolean));
} catch {
  /* Backlog problems are rebuild-backlog's to report, not this script's. */
}

const { plans, scenarios, errors } = loadQaRecords(ROOT, { knownRecordIds });

if (errors.length) {
  console.error(`QA records FAILED validation — ${errors.length} error(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

const byArea = new Map();
for (const scenario of scenarios) {
  if (!byArea.has(scenario.area)) byArea.set(scenario.area, []);
  byArea.get(scenario.area).push(scenario);
}

const sortedPlans = plans.slice().sort((a, b) => a.area.localeCompare(b.area));
const sortedScenarios = scenarios.slice().sort((a, b) => a.id.localeCompare(b.id));

const link = (relative, label, fromDir) => {
  const depth = fromDir.split('/').filter(Boolean).length;
  return `[${label}](${'../'.repeat(depth)}${relative})`;
};

// ------------------------------------------------------------ coverage matrix

const DIMENSIONS = Object.keys(COVERAGE_DIMENSIONS);

const MARK = { GOOD: 'GOOD', PARTIAL: 'PARTIAL', GAP: '**GAP**', NOT_APPLICABLE: 'n/a' };

const matrixRows = sortedPlans.map((plan) => {
  const cells = DIMENSIONS.map((dimension) => MARK[plan.coverage[dimension]] ?? '?');
  return `| ${link(plan.relative, plan.area, 'docs/qa')} | ${cells.join(' | ')} |`;
});

const gapCount = sortedPlans.reduce(
  (total, plan) => total + DIMENSIONS.filter((d) => plan.coverage[d] === 'GAP').length,
  0,
);
const partialCount = sortedPlans.reduce(
  (total, plan) => total + DIMENSIONS.filter((d) => plan.coverage[d] === 'PARTIAL').length,
  0,
);

const blocked = scenarios.filter((scenario) => scenario.automation === 'BLOCKED_INFRASTRUCTURE');
const automated = scenarios.filter((scenario) => scenario.automation === 'AUTOMATED');

const coverageMatrix = [
  '# QA Coverage Matrix',
  '',
  GENERATED_BANNER,
  '',
  'What each product area is actually covered by, per dimension. Every cell is',
  '**declared by the area\'s test plan** and cross-checked against its scenarios:',
  'a plan claiming `GOOD` on a dimension with no scenario of that type, or with',
  'only scenarios that cannot run here, fails `node scripts/rebuild-qa.mjs`.',
  '',
  '`GAP` and `PARTIAL` are the useful entries. **When a task touches an area with a**',
  '`GAP` **or** `PARTIAL` **cell on a dimension the change affects, closing it becomes**',
  '**part of that task\'s scope** — or, when that is too large, a `TEST_GAP` backlog',
  'item. See [`README.md`](README.md).',
  '',
  `**Areas: ${sortedPlans.length}** · scenarios: ${scenarios.length} · automated: ${automated.length} · blocked by infrastructure: ${blocked.length}`,
  '',
  `**Open gaps: ${gapCount}** · partial: ${partialCount}`,
  '',
  `| Area | ${DIMENSIONS.join(' | ')} |`,
  `|---|${DIMENSIONS.map(() => '---').join('|')}|`,
  ...matrixRows,
  '',
  '## Dimensions',
  '',
  '| Dimension | Evidenced by scenarios of type |',
  '|---|---|',
  ...Object.entries(COVERAGE_DIMENSIONS).map(([dimension, type]) => `| ${dimension} | \`${type}\` |`),
  '',
  '## Statuses',
  '',
  '| Status | Means |',
  '|---|---|',
  '| `GOOD` | The dimension is covered by scenarios that run, and a regression would be caught |',
  '| `PARTIAL` | Some cases covered; named holes remain, stated in the plan |',
  '| `GAP` | Not covered. A change here is not protected by anything |',
  '| `NOT_APPLICABLE` | The dimension does not apply — say why in the plan |',
  '',
  '`BLOCKED_INFRASTRUCTURE` scenarios count towards `PARTIAL` and never towards',
  '`GOOD`. Coverage that cannot execute is a plan, not a test.',
  '',
].join('\n');

// -------------------------------------------------------------- plan index

const planIndex = [
  '# QA Test Plans',
  '',
  GENERATED_BANNER,
  '',
  'One evergreen plan per product area: scope, risks, the cases that must always',
  'be covered, and the declared coverage per dimension. QA loads the plan for',
  'every area a change touches **before** designing anything new.',
  '',
  `**Plans: ${sortedPlans.length}** · scenarios across them: ${scenarios.length}`,
  '',
  '| Plan | Area | Risk | Status | Scenarios | Related bugs | Verified against |',
  '|---|---|---|---|---|---|---|',
  ...sortedPlans.map((plan) => {
    const owned = byArea.get(plan.area) ?? [];
    return (
      `| ${link(plan.relative, plan.id, PLAN_DIR)} | ${plan.area} | ${plan.risk} | ${plan.status} | ` +
      `${owned.length} | ${plan.bugs.join(', ') || '—'} | \`${plan.verifiedAgainstSha || '—'}\` |`
    );
  }),
  '',
].join('\n');

// ---------------------------------------------------------- scenario index

const scenarioIndex = [
  '# QA Scenario Registry',
  '',
  GENERATED_BANNER,
  '',
  'Reusable, id\'d tests. A scenario outlives the run that invented it, so QA can',
  '**select and re-run** the cases an area already learned rather than thinking of',
  'them again. Select with:',
  '',
  '```bash',
  'node scripts/qa-select.mjs services/api/src/modules/auth',
  '```',
  '',
  `**Scenarios: ${scenarios.length}** · automated: ${automated.length} · ` +
    `manual: ${scenarios.filter((s) => s.automation === 'MANUAL').length} · ` +
    `blocked by infrastructure: ${blocked.length}`,
  '',
  '| Scenario | Title | Area | Type | Risk | Automation | Test | Bugs | Regressions |',
  '|---|---|---|---|---|---|---|---|---|',
  ...sortedScenarios.map(
    (scenario) =>
      `| ${link(scenario.relative, scenario.id, SCENARIO_DIR)} | ${scenario.title} | ${scenario.area} | ` +
      `${scenario.type} | ${scenario.risk} | ${scenario.automation} | ` +
      `${scenario.testReference ? `\`${scenario.testReference.split(/\s+/)[0]}\`` : '—'} | ` +
      `${scenario.bugs.join(', ') || '—'} | ${scenario.regressions.join(', ') || '—'} |`,
  ),
  '',
].join('\n');

// ------------------------------------------------------------------- writing

const pages = {
  'docs/qa/coverage-matrix.md': coverageMatrix,
  [`${PLAN_DIR}/index.md`]: planIndex,
  [`${SCENARIO_DIR}/index.md`]: scenarioIndex,
};

let changed = 0;
const drift = [];

for (const [relative, content] of Object.entries(pages)) {
  const path = join(ROOT, relative);
  if (CHECK_ONLY) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content.replace(/\r\n/g, '\n')) drift.push(relative);
    continue;
  }
  if (writeIfChanged(path, content)) {
    changed += 1;
    console.log(`  rewrote  ${relative}`);
  }
}

// ------------------------------------------------------- the generated graph

/*
 * GRAPH_ORPHANS, and why this block exists.
 *
 * A generated note can have a perfectly valid canonical source and still be an
 * isolated dot in the Obsidian graph — no inbound link, no outbound link,
 * unreachable by anything except search. Measured on 2026-08-18, 82 of 95 QA
 * scenarios were exactly that, and so were every plan and the regression index:
 * 102 isolated nodes out of 294 generated ones.
 *
 * The relationships were not missing. They were sitting in frontmatter — AREA,
 * RELATED_BUGS, RELATED_REGRESSIONS — where Obsidian cannot see them, because a
 * YAML value is not a wikilink.
 *
 * So this projects the relationships that ALREADY EXIST into links. It invents
 * nothing:
 *   - every scenario belongs to the plan covering its AREA. That mapping is
 *     already validated — `loadQaRecords` refuses a scenario whose AREA has no
 *     plan — so the edge is guaranteed to resolve.
 *   - RELATED_BUGS and RELATED_REGRESSIONS become links to those records.
 *   - AREA becomes a module link only on an EXACT match with a module note.
 *     Fuzzy matching was rejected: "commercial-onboarding" is not
 *     "commercial-onboarding-lifecycle", and a plausible-looking wrong edge is
 *     worse than an absent one.
 *
 * The block is delimited and rewritten in place. Everything outside the markers
 * is hand-authored and never touched.
 */
const GRAPH_BEGIN = '<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->';
const GRAPH_END = '<!-- GRAPH:END -->';

const moduleNoteNames = new Set(
  existsSync(join(ROOT, 'docs/knowledge/modules'))
    ? readdirSync(join(ROOT, 'docs/knowledge/modules'))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => name.replace(/\.md$/, ''))
    : [],
);

const planByArea = new Map(sortedPlans.map((plan) => [plan.area, plan]));

function graphBlockFor(record, kind) {
  const lines = [GRAPH_BEGIN, '', '## Related', ''];
  const rows = [];

  if (kind === 'scenario') {
    const plan = planByArea.get(record.area);
    if (plan) rows.push(`- Test plan — [[${plan.id}]]`);
  } else {
    const owned = (byArea.get(record.area) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    if (owned.length) {
      rows.push(`- Scenarios — ${owned.map((scenario) => `[[${scenario.id}]]`).join(', ')}`);
    }
  }

  if (moduleNoteNames.has(record.area)) rows.push(`- Module — [[${record.area}]]`);
  if (record.bugs?.length) rows.push(`- Bugs — ${record.bugs.map((id) => `[[${id}]]`).join(', ')}`);
  if (record.regressions?.length) {
    rows.push(`- Regressions — ${record.regressions.map((id) => `[[${id}]]`).join(', ')}`);
  }

  if (!rows.length) {
    rows.push(
      '- `STANDALONE_ALLOWED` — no plan, module, bug or regression relationship is',
      '  declared in this record\'s frontmatter. Declare one rather than adding a',
      '  link here by hand.',
    );
  }

  lines.push(...rows, '', GRAPH_END);
  return lines.join('\n');
}

function withGraphBlock(body, block) {
  const start = body.indexOf(GRAPH_BEGIN);
  if (start === -1) return `${body.replace(/\s*$/, '')}\n\n${block}\n`;
  const end = body.indexOf(GRAPH_END, start);
  if (end === -1) return `${body.slice(0, start).replace(/\s*$/, '')}\n\n${block}\n`;
  return `${body.slice(0, start)}${block}${body.slice(end + GRAPH_END.length)}`;
}

const graphTargets = [
  ...sortedScenarios.map((record) => ({ record, kind: 'scenario' })),
  ...sortedPlans.map((record) => ({ record, kind: 'plan' })),
];

for (const { record, kind } of graphTargets) {
  const current = readFileSync(record.path, 'utf8');
  const normalised = current.replace(/\r\n/g, '\n');
  const next = withGraphBlock(normalised, graphBlockFor(record, kind));
  if (next === normalised) continue;
  if (CHECK_ONLY) {
    drift.push(record.relative);
    continue;
  }
  writeFileSync(record.path, current.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  changed += 1;
  console.log(`  rewrote  ${record.relative} (graph block)`);
}

if (CHECK_ONLY) {
  if (drift.length) {
    console.error('QA indexes are stale — run `node scripts/rebuild-qa.mjs`:');
    for (const name of drift) console.error(`  x ${name}`);
    process.exit(1);
  }
  console.log(
    `QA records valid and indexes current — ${plans.length} plan(s), ${scenarios.length} scenario(s), ${gapCount} declared gap(s).`,
  );
} else {
  console.log('');
  console.log(
    `QA rebuilt — ${plans.length} plan(s), ${scenarios.length} scenario(s), ${changed} index(es) rewritten.`,
  );
  console.log(`Declared coverage gaps: ${gapCount} · partial: ${partialCount} · blocked scenarios: ${blocked.length}`);
}
