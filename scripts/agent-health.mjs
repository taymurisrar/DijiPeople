#!/usr/bin/env node
/*
 * Evidence-based agent health.
 *
 *   node scripts/agent-health.mjs
 *   node scripts/agent-health.mjs --json
 *   node scripts/agent-health.mjs --root <dir>
 *
 * The purpose is to detect a *systemic* role weakness — a role that keeps
 * producing the same class of rework — so the response can be a role
 * improvement rather than another individual correction.
 *
 * It is not a scoreboard. Nothing here ranks agents, and no decision is made
 * from a count alone: a single incident is noise, and the chain from signal to
 * rule change runs through root cause, simulation and review.
 *
 * Two design rules matter more than the numbers.
 *
 * Everything is derived from durable records. A self-reported metric measures
 * willingness to report, which is the one thing nobody needs measured.
 *
 * Signals the records cannot support are reported as NOT_DERIVABLE with the
 * reason, never estimated. FIRST_PASS_SUCCESS, HANDOFF_REJECTIONS,
 * FALSE_PASS_COUNT, CI_FAILURES_CAUSED and CONTEXT_OVERFLOW are all in that
 * category today, because nothing in this repository records a rejected handoff
 * or a context overflow as a fact. A number invented to fill a column is worse
 * than an empty column: it gets trusted.
 *
 * Exit code is always 0 — this reports, it does not gate.
 *
 * No dependencies.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords, isActive } from './lib/backlog-records.mjs';
import { loadTasks } from './lib/task-records.mjs';
import { loadQuestions } from './lib/question-records.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const rootIndex = argv.indexOf('--root');
const ROOT = rootIndex === -1 ? DEFAULT_ROOT : resolve(argv[rootIndex + 1] ?? '.');

/*
 * Signals nothing in this repository currently records as a fact.
 *
 * Listed explicitly rather than omitted, so the gap is visible and can be closed
 * deliberately — an absent row reads as "measured and zero".
 */
const NOT_DERIVABLE = {
  FIRST_PASS_SUCCESS: 'no record captures whether a handoff was accepted on the first attempt',
  HANDOFF_REJECTIONS: 'handoff rejections are reported in chat and never written to a record',
  FALSE_PASS_COUNT: 'a PASS later shown to be wrong is not linked back to the handoff that claimed it',
  REWORK_COUNT: 'rework is not distinguished from ordinary iteration in any durable artefact',
  STALE_CONTEXT_FAILURES: 'FAILURE_CLASS is not yet recorded on a durable record',
  CONTEXT_OVERFLOW: 'not observable from the repository at all',
  CI_FAILURES_CAUSED: 'CI runs are not attributed to the role whose change caused them',
};

const { records, errors } = loadRecords(ROOT);
const { tasks } = loadTasks(ROOT);
const { questions } = loadQuestions(ROOT);

/*
 * Role names are spelled inconsistently across the record tree — `release-devops`
 * and `release/devops`, `ui-ux` and `ui/ux`, `backend-api` and `backend/api` all
 * occur. Left alone, one role appears twice with its history split in half, and
 * every derived signal is wrong in a way that looks plausible.
 *
 * Canonicalised to the role file's own slug, which is the only name the
 * framework actually validates. The aliases seen are reported, because the
 * underlying inconsistency is a real records defect that normalising here hides
 * rather than fixes.
 */
const ROLE_ALIASES = {
  'release/devops': 'release-devops',
  'release devops': 'release-devops',
  'ui/ux': 'ui-ux',
  'ui ux': 'ui-ux',
  'backend/api': 'backend-api',
  'backend api': 'backend-api',
  'product & backlog steward': 'product-backlog-steward',
  'product and backlog steward': 'product-backlog-steward',
  'knowledge & graph': 'knowledge-graph',
  'knowledge and graph': 'knowledge-graph',
  'knowledge capture': 'knowledge-graph',
};

const aliasesSeen = new Map();

const roles = new Map();
const role = (name) => {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return null;
  const key = ROLE_ALIASES[raw] ?? raw;
  if (key !== raw) {
    if (!aliasesSeen.has(raw)) aliasesSeen.set(raw, key);
  }
  if (!roles.has(key)) {
    roles.set(key, {
      role: key,
      TASKS_ASSIGNED: 0,
      BUGS_OWNED: 0,
      BUGS_OWNED_OPEN: 0,
      BUGS_CAUGHT: 0,
      USER_QUESTIONS: 0,
      WITHDRAWN_QUESTIONS: 0,
      ADAPTATIONS_CREATED: 0,
      defectTypes: {},
    });
  }
  return roles.get(key);
};

for (const task of tasks) {
  for (const name of Array.isArray(task.fields.AGENTS) ? task.fields.AGENTS : []) {
    const entry = role(name);
    if (entry) entry.TASKS_ASSIGNED += 1;
  }
}

for (const record of records) {
  const owner = role(record.fields.OwnerAgent);
  if (owner) {
    owner.BUGS_OWNED += 1;
    /*
     * Only *active* records feed the repeat signal. A closed defect is a lesson
     * the framework already absorbed — counting it forever means every role
     * looks worse the longer it has been working, which is precisely backwards.
     * The question is "is this role still producing this class of defect", not
     * "has it ever".
     */
    if (isActive(record)) {
      owner.BUGS_OWNED_OPEN += 1;
      if (record.type) {
        owner.defectTypes[record.type] = (owner.defectTypes[record.type] ?? 0) + 1;
      }
    }
    /* A record that produced a regression guard taught the framework something. */
    if (String(record.fields.RegressionId ?? '').trim()) owner.ADAPTATIONS_CREATED += 1;
  }

  /*
   * Source names the discipline that found it. Mapped onto a role name where the
   * vocabularies line up; where they do not, the finder is simply not counted
   * rather than guessed at.
   */
  const source = String(record.fields.Source ?? '').trim().toLowerCase();
  const finder = { qa: 'qa', security: 'security', reviewer: 'reviewer', review: 'reviewer' }[source];
  if (finder) role(finder).BUGS_CAUGHT += 1;
}

for (const question of questions) {
  const asker = role(question.askedBy);
  if (!asker) continue;
  asker.USER_QUESTIONS += 1;
  if (question.status === 'WITHDRAWN') asker.WITHDRAWN_QUESTIONS += 1;
}

/*
 * A repeated defect type against one owner is the signal this whole file exists
 * for: three AUTHORIZATION bugs owned by the same role is a role gap, where one
 * is an incident. Three is the threshold because two is a coincidence and the
 * point is to avoid rewriting instructions after a single bad afternoon.
 */
const REPEAT_THRESHOLD = 3;
const regressions = [];
for (const entry of roles.values()) {
  for (const [type, count] of Object.entries(entry.defectTypes)) {
    if (count >= REPEAT_THRESHOLD) {
      regressions.push({
        role: entry.role,
        type,
        count,
        signal: 'REPEATED_DEFECT_TYPE',
        next: 'root cause → role improvement → behavioural simulation → Reviewer → framework validation',
      });
    }
  }
}

const ownerless = records.filter((record) => isActive(record) && !String(record.fields.OwnerAgent ?? '').trim());

const report = {
  ok: true,
  recordErrors: errors.length,
  roles: [...roles.values()].sort((a, b) => b.BUGS_OWNED - a.BUGS_OWNED),
  AGENT_HEALTH_REGRESSIONS: regressions,
  UNOWNED_FINDINGS: ownerless.map((record) => record.id),
  ROLE_NAME_ALIASES: Object.fromEntries(aliasesSeen),
  NOT_DERIVABLE,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('');
console.log('Agent health — derived from durable records, never self-reported');
console.log('');
console.log(
  `  ${'ROLE'.padEnd(24)} ${'TASKS'.padStart(6)} ${'OWNED'.padStart(6)} ${'OPEN'.padStart(5)} ` +
    `${'CAUGHT'.padStart(7)} ${'ASKED'.padStart(6)} ${'ADAPT'.padStart(6)}`,
);
for (const entry of report.roles) {
  console.log(
    `  ${entry.role.padEnd(24)} ${String(entry.TASKS_ASSIGNED).padStart(6)} ` +
      `${String(entry.BUGS_OWNED).padStart(6)} ${String(entry.BUGS_OWNED_OPEN).padStart(5)} ` +
      `${String(entry.BUGS_CAUGHT).padStart(7)} ${String(entry.USER_QUESTIONS).padStart(6)} ` +
      `${String(entry.ADAPTATIONS_CREATED).padStart(6)}`,
  );
}
console.log('');

if (regressions.length) {
  console.log(`AGENT_HEALTH_REGRESSIONS — ${regressions.length}:`);
  for (const entry of regressions) {
    console.log(`  ${entry.role} — ${entry.count} × ${entry.type}`);
    console.log(`    ${entry.next}`);
  }
  console.log('');
  console.log('  A pattern, not an incident. One failure never rewrites a permanent role');
  console.log('  instruction; a systemic change needs evidence, a simulation and review.');
  console.log('');
} else {
  console.log(`AGENT_HEALTH_REGRESSIONS  0  (threshold: ${REPEAT_THRESHOLD} of one defect type per owner)`);
  console.log('');
}

if (aliasesSeen.size) {
  console.log(`ROLE_NAME_ALIASES — ${aliasesSeen.size} spelling(s) normalised to reach these numbers:`);
  for (const [seen, canonical] of aliasesSeen) console.log(`  "${seen}" → ${canonical}`);
  console.log('');
  console.log('  Normalising here makes the metric right and leaves the records wrong.');
  console.log('  One role spelled two ways splits its history in half, and every derived');
  console.log('  signal is then plausible and false. This belongs in the backlog.');
  console.log('');
}

if (report.UNOWNED_FINDINGS.length) {
  console.log(`UNOWNED_FINDINGS  ${report.UNOWNED_FINDINGS.length}: ${report.UNOWNED_FINDINGS.slice(0, 15).join(', ')}`);
  console.log('');
}

console.log('NOT_DERIVABLE — reported rather than estimated:');
for (const [name, reason] of Object.entries(NOT_DERIVABLE)) {
  console.log(`  ${name.padEnd(24)} ${reason}`);
}
console.log('');
console.log('  These are gaps in what the framework records, not scores of zero.');
console.log('  Closing one means recording the fact, not inventing the number.');
console.log('');
