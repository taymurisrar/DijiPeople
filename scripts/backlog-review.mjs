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

const report = {
  scope: modules.length ? modules : 'all',
  totals: {
    active: active.length,
    untriaged: untriaged.length,
    dueForRevalidation: dueForRevalidation.length,
    openCritical: criticalOpen.length,
    openHigh: highOpen.length,
  },
  untriaged,
  dueForRevalidation,
  openCritical: criticalOpen,
  oldestHigh,
  duplicateCandidates,
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
