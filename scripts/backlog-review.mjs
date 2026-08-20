#!/usr/bin/env node
/*
 * Backlog aging and revalidation — what the Architect must look at before and
 * after a task.
 *
 * The backlog is only useful if its entries are still true. A record written
 * three months ago may describe code that has since been rewritten, a defect
 * somebody fixed incidentally, or a decision that was taken and never written
 * back. Every one of those is a *zombie*: it costs attention on every precheck
 * and returns nothing.
 *
 *   node scripts/backlog-review.mjs                       everything due
 *   node scripts/backlog-review.mjs --modules services/api/src/modules/auth
 *   node scripts/backlog-review.mjs --json
 *   node scripts/backlog-review.mjs --untriaged           the blocking set only
 *
 * It **reports only**. Closing a record is a judgement about evidence, and a
 * script that closed records on an age threshold would close the ones nobody had
 * looked at — which is the opposite of the intent.
 *
 * Exit codes: 0 always, except --untriaged with untriaged ordinary records (1),
 *             which makes it usable as a gate.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords, isActive, isTerminal } from './lib/backlog-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const untriagedOnly = argv.includes('--untriaged');
const modulesIndex = argv.indexOf('--modules');
const modules = modulesIndex === -1
  ? []
  : String(argv[modulesIndex + 1] ?? '').split(',').map((m) => m.trim()).filter(Boolean);

/*
 * Revalidation policy.
 *
 * Deliberately expressed in days rather than "periodically": a policy nobody can
 * evaluate is a policy nobody follows. CRITICAL is 0 because a critical record
 * is reverified by every substantial task that goes near it, not on a timer.
 */
const REVALIDATE_AFTER_DAYS = {
  CRITICAL: 0,
  HIGH: 14,
  MEDIUM: 45,
  LOW: 90,
  '': 45,
};

const TODAY = new Date();
const days = (iso) => {
  const at = Date.parse(String(iso ?? ''));
  if (Number.isNaN(at)) return null;
  return Math.floor((TODAY - at) / 86_400_000);
};

const { records, errors } = loadRecords(ROOT);

if (errors.length) {
  console.error(`Backlog records are invalid — fix with \`node scripts/rebuild-backlog.mjs\` first:`);
  for (const error of errors.slice(0, 10)) console.error(`  x ${error}`);
  process.exit(1);
}

const touches = (record) =>
  !modules.length ||
  record.modules.some((module) =>
    modules.some((wanted) => module.startsWith(wanted) || wanted.startsWith(module)),
  );

const scoped = records.filter(touches);

const enrich = (record) => {
  const created = String(record.fields.CreatedAt ?? record.fields.DetectedDate ?? '').trim();
  const lastVerified = String(record.fields.LastVerified ?? '').trim() || record.updatedAt;
  const ageDays = days(created);
  const sinceVerified = days(lastVerified);
  const threshold = REVALIDATE_AFTER_DAYS[record.severity] ?? 45;
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    severity: record.severity || '—',
    priority: record.priority,
    status: record.status,
    disposition: record.disposition,
    modules: record.modules,
    path: record.relative,
    createdAt: created,
    lastVerified,
    ageDays,
    daysSinceVerified: sinceVerified,
    revalidateAfterDays: threshold,
    due: sinceVerified === null ? true : sinceVerified >= threshold,
  };
};

const active = scoped.filter(isActive).map(enrich);
const untriaged = scoped
  .filter((record) => record.disposition === 'TRIAGE_REQUIRED' && !isTerminal(record))
  .map(enrich);

const dueForRevalidation = active
  .filter((record) => record.due)
  .sort((a, b) => (b.daysSinceVerified ?? 1e9) - (a.daysSinceVerified ?? 1e9));

const criticalOpen = active.filter((record) => record.severity === 'CRITICAL');
const highOpen = active.filter((record) => record.severity === 'HIGH');
const oldestHigh = highOpen.slice().sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))[0] ?? null;

/*
 * Likely duplicates, by title similarity on significant words. Reported as
 * candidates only — merging two records is a decision about whether they are the
 * same defect, which needs somebody to read both.
 */
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'and', 'or', 'of', 'to', 'in', 'for', 'no', 'not', 'on', 'by', 'with', 'that', 'has', 'have']);
const significant = (title) =>
  new Set(
    String(title).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !STOP.has(word)),
  );

const duplicateCandidates = [];
for (let i = 0; i < active.length; i += 1) {
  for (let j = i + 1; j < active.length; j += 1) {
    const a = significant(active[i].title);
    const b = significant(active[j].title);
    if (a.size < 3 || b.size < 3) continue;
    const shared = [...a].filter((word) => b.has(word));
    const overlap = shared.length / Math.min(a.size, b.size);
    if (overlap >= 0.6) {
      duplicateCandidates.push({ a: active[i].id, b: active[j].id, overlap: Number(overlap.toFixed(2)), shared });
    }
  }
}

/*
 * ---------------------------------------------------------------- steward view
 *
 * Everything above answers "is this record still true?". Everything below
 * answers the Product & Backlog Steward's question: "is this record actionable,
 * and is it the right thing to do next?"
 *
 * A record can be perfectly valid and still useless — nobody owns it, nothing
 * says what done looks like, and no next step is written down. Those are the
 * records that survive every review by being unfalsifiable.
 */

const scopedActive = scoped.filter(isActive);
const byId = new Map(scoped.map((record) => [record.id, record]));

/* Who is blocked by whom, so blast radius is counted rather than asserted. */
const blocks = new Map();
for (const record of scoped) {
  const raw = record.fields.BlockedBy;
  const entries = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  for (const blocker of entries
    .map((entry) => String(entry).trim())
    .filter((entry) => /^(BUG|ITEM)-\d{4}$/.test(entry))) {
    blocks.set(blocker, (blocks.get(blocker) ?? 0) + 1);
  }
}

const field = (record, name) => String(record.fields[name] ?? '').trim();
const hasField = (record, name) => {
  const value = record.fields[name];
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value ?? '').trim());
};

/*
 * The conditions that make a record unactionable. Reported, never a build
 * failure: 155 records predate every one of these fields, and failing on them
 * would make this a detector people disable rather than one they act on.
 */
const HEALTH = [
  ['OWNERLESS', (record) => !field(record, 'OwnerAgent')],
  ['NO_ACCEPTANCE_CRITERIA', (record) => !hasField(record, 'AcceptanceCriteria')],
  ['NO_NEXT_ACTION', (record) => !hasField(record, 'NextAction')],
  ['NO_MODULE_LINK', (record) => record.modules.length === 0],
  [
    'NO_QA_RELATIONSHIP',
    (record) => record.kind === 'bug' && !field(record, 'RegressionId') && !field(record, 'QAReport'),
  ],
  ['NO_LAST_REVIEWED', (record) => !hasField(record, 'LastReviewed')],
  ['STALE_DEFERRED', (record) => record.disposition === 'DEFER' && (days(record.updatedAt) ?? 0) > 60],
];

const health = {};
for (const [name] of HEALTH) health[name] = [];
for (const record of scopedActive) {
  for (const [name, test] of HEALTH) {
    if (test(record)) health[name].push(record.id);
  }
}

const AGING = { AGING_7D: [], AGING_30D: [], AGING_90D: [] };
for (const record of active) {
  const age = record.ageDays ?? 0;
  if (age >= 90) AGING.AGING_90D.push(record.id);
  else if (age >= 30) AGING.AGING_30D.push(record.id);
  else if (age >= 7) AGING.AGING_7D.push(record.id);
}

/*
 * NEXT_BEST_ACTIONS.
 *
 * Severity alone does not decide order, and that is the whole reason this
 * exists. A MEDIUM test-infrastructure defect making ninety tests unreliable
 * outranks a standalone HIGH cosmetic one: the first costs every task that runs
 * afterwards, the second costs one screen.
 *
 * Blast radius is counted from what the records actually say — how many others
 * name this one as a blocker, how many modules it spans — rather than from a
 * judgement somebody typed into a priority field.
 *
 * The score is deliberately explainable. Every contribution is printed beside
 * the record so a human can disagree with the ranking on the evidence rather
 * than argue with a number.
 */
const SEVERITY_WEIGHT = { CRITICAL: 50, HIGH: 30, MEDIUM: 15, LOW: 5 };
const SECURITY_TYPES = new Set(['SECURITY', 'AUTHORIZATION', 'TENANT_ISOLATION']);
/* A broken test surface silently lowers confidence in everything measured through it. */
const CONFIDENCE_TYPES = new Set(['TEST_GAP', 'INFRA']);

function score(record) {
  const reasons = [];
  let total = 0;

  const add = (points, why) => {
    if (points <= 0) return;
    total += points;
    reasons.push(`${why} +${points}`);
  };

  add(SEVERITY_WEIGHT[record.severity] ?? 10, `severity ${record.severity || 'unset'}`);
  if (SECURITY_TYPES.has(record.type)) add(20, `${record.type} exposure`);
  if (CONFIDENCE_TYPES.has(record.type)) add(12, `${record.type} undermines later evidence`);

  const blocking = blocks.get(record.id) ?? 0;
  if (blocking) add(Math.min(blocking * 15, 45), `blocks ${blocking} record(s)`);

  if (record.modules.length > 1) {
    add(Math.min(record.modules.length * 3, 15), `spans ${record.modules.length} modules`);
  }

  const age = days(String(record.fields.CreatedAt ?? record.fields.DetectedDate ?? ''));
  if (age !== null && age >= 7) add(Math.min(Math.floor(age / 10), 15), `${age} days old`);

  if (record.disposition === 'FIX_NOW') add(10, 'disposition FIX_NOW');
  if (record.disposition === 'TRIAGE_REQUIRED') add(8, 'never triaged');
  if (!field(record, 'OwnerAgent')) add(5, 'ownerless');

  return { total, reasons };
}

const SETTLED = new Set(['ACCEPTED_RISK', 'DUPLICATE', 'NOT_A_BUG']);

const nextBestActions = scopedActive
  .filter((record) => !SETTLED.has(record.disposition))
  .map((record) => {
    const { total, reasons } = score(record);
    return {
      id: record.id,
      title: record.title,
      severity: record.severity || '—',
      type: record.type,
      owner: field(record, 'OwnerAgent') || 'UNOWNED',
      disposition: record.disposition,
      score: total,
      reasons,
    };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

const ownerlessActionable = health.OWNERLESS.filter((id) => {
  const record = byId.get(id);
  return record && !SETTLED.has(record.disposition);
});

const report = {
  scope: modules.length ? modules : 'all',
  totals: {
    active: active.length,
    untriaged: untriaged.length,
    dueForRevalidation: dueForRevalidation.length,
    openCritical: criticalOpen.length,
    openHigh: highOpen.length,
    ownerlessActionable: ownerlessActionable.length,
  },
  untriaged,
  dueForRevalidation,
  openCritical: criticalOpen,
  oldestHigh,
  duplicateCandidates,
  health,
  aging: AGING,
  ownerlessActionable,
  nextBestActions,
  policy: REVALIDATE_AFTER_DAYS,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(untriagedOnly && untriaged.length ? 1 : 0);
}

if (untriagedOnly) {
  if (!untriaged.length) {
    console.log('No ordinary record is TRIAGE_REQUIRED.');
    process.exit(0);
  }
  console.error(`${untriaged.length} record(s) still TRIAGE_REQUIRED — the Architect must dispose of each:`);
  for (const record of untriaged) {
    console.error(`  ${record.id}  ${record.severity.padEnd(8)} ${record.title}`);
  }
  console.error('');
  console.error('Dispositions: FIX_NOW · PLAN_REQUIRED · DEFER · BLOCKED_EXTERNAL ·');
  console.error('              ACCEPTED_RISK · DUPLICATE · NOT_A_BUG · PRODUCT_DECISION');
  process.exit(1);
}

console.log('');
console.log(`Backlog review — ${modules.length ? modules.join(', ') : 'whole backlog'}`);
console.log('');
console.log(`  ACTIVE                 ${active.length}`);
console.log(`  TRIAGE_REQUIRED        ${untriaged.length}`);
console.log(`  DUE_FOR_REVALIDATION   ${dueForRevalidation.length}`);
console.log(`  OPEN_CRITICAL          ${criticalOpen.length}`);
console.log(`  OPEN_HIGH              ${highOpen.length}`);
console.log(`  OLDEST_HIGH            ${oldestHigh ? `${oldestHigh.id} — ${oldestHigh.ageDays} days` : 'none'}`);
console.log('');

if (untriaged.length) {
  console.log('TRIAGE_REQUIRED — no ordinary record may stay here:');
  for (const record of untriaged) console.log(`  ${record.id}  ${record.severity.padEnd(8)} ${record.title}`);
  console.log('');
}

if (criticalOpen.length) {
  console.log('OPEN CRITICAL — reverified by every substantial task that goes near them:');
  for (const record of criticalOpen) {
    console.log(`  ${record.id}  ${record.status.padEnd(12)} ${record.title}`);
  }
  console.log('');
}

if (dueForRevalidation.length) {
  console.log('DUE FOR REVALIDATION — still true, or already resolved by later code?');
  for (const record of dueForRevalidation.slice(0, 20)) {
    console.log(
      `  ${record.id}  ${record.severity.padEnd(8)} ${String(record.daysSinceVerified ?? '?').padStart(4)}d  ${record.title}`,
    );
  }
  if (dueForRevalidation.length > 20) console.log(`  … and ${dueForRevalidation.length - 20} more`);
  console.log('');
  console.log('  Revalidating means reading the current code, not re-reading the record.');
  console.log('  A record the code has already resolved is closed with the evidence that');
  console.log('  resolved it — that is the cheapest backlog reduction available.');
  console.log('');
}

if (ownerlessActionable.length) {
  console.log(`OWNERLESS — ${ownerlessActionable.length} actionable record(s) nobody owns:`);
  console.log(`  ${ownerlessActionable.slice(0, 20).join(', ')}`);
  if (ownerlessActionable.length > 20) console.log(`  … and ${ownerlessActionable.length - 20} more`);
  console.log('');
  console.log('  An actionable record with no owner is work the framework has agreed to');
  console.log('  do and assigned to nobody. Set OwnerAgent, or dispose of it.');
  console.log('');
}

const unhealthy = Object.entries(health).filter(([, ids]) => ids.length);
if (unhealthy.length) {
  console.log('RECORD HEALTH — active records missing what makes them actionable:');
  for (const [name, ids] of unhealthy) {
    console.log(`  ${name.padEnd(24)} ${String(ids.length).padStart(4)}`);
  }
  console.log('');
  console.log(`  AGING_7D ${AGING.AGING_7D.length} · AGING_30D ${AGING.AGING_30D.length} · AGING_90D ${AGING.AGING_90D.length}`);
  console.log('');
}

if (nextBestActions.length) {
  console.log('NEXT_BEST_ACTIONS — ranked by blast radius, not by severity alone:');
  for (const entry of nextBestActions) {
    console.log(`  ${String(entry.score).padStart(3)}  ${entry.id}  ${entry.severity.padEnd(8)} ${entry.title}`);
    console.log(`       ${entry.owner} · ${entry.reasons.join(' · ')}`);
  }
  console.log('');
  console.log('  The ranking is explainable on purpose: disagree with the reasons, not');
  console.log('  the number. A MEDIUM defect that blocks four others outranks a');
  console.log('  standalone HIGH, because it is costing every task that comes after it.');
  console.log('');
}

if (duplicateCandidates.length) {
  console.log('POSSIBLE DUPLICATES — candidates only; read both before merging:');
  for (const pair of duplicateCandidates) {
    console.log(`  ${pair.a} ~ ${pair.b}   overlap ${pair.overlap}   (${pair.shared.slice(0, 5).join(', ')})`);
  }
  console.log('');
}

console.log('Revalidation policy, in days since last verification:');
for (const [severity, threshold] of Object.entries(REVALIDATE_AFTER_DAYS)) {
  if (!severity) continue;
  console.log(`  ${severity.padEnd(10)} ${threshold === 0 ? 'every substantial task touching it' : `${threshold} days`}`);
}
console.log('');
console.log('This command reports. Closing a record is a judgement about evidence, and');
console.log('an age threshold would close exactly the ones nobody had looked at.');
console.log('');
