#!/usr/bin/env node
/**
 * Keep `TASK-0005-inventory.json` in step with the bug and backlog records.
 *
 * The inventory is curated evidence — `current_evidence.verification_scope` is
 * prose somebody wrote and no generator should invent — but a set of its fields
 * is *not* curated at all: `validate-framework.mjs` requires them to equal the
 * canonical record, and fails three checks when they do not. Until now there
 * was no generator, so every new bug or backlog item broke framework validation
 * until someone hand-wrote a row, and the failure named the count rather than
 * the cause.
 *
 * This script does exactly the mechanical part and nothing else:
 *
 *   - adds a row for any canonical record the inventory is missing
 *   - removes a row whose record no longer exists
 *   - refreshes only the fields the validator derives from the record
 *     (type, title, severity, priority, status, disposition, source block,
 *     affected modules, regressions, QA scenarios, test plans)
 *
 * It never edits `current_evidence`, `dependencies`, `related_bugs`,
 * `related_backlog`, `active_session_conflict`, `owner_decision_required` or
 * `verification_result` on a row that already exists. Those are judgements.
 *
 * `--check` reports what would change and exits non-zero, for CI.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'docs/tasks/remediation/TASK-0005-inventory.json');
const CHECK = process.argv.includes('--check');

if (!existsSync(INVENTORY)) {
  console.error(`No inventory at ${INVENTORY}`);
  process.exit(1);
}

const { loadRecords } = await import('./lib/backlog-records.mjs');
const { loadQaRecords } = await import('./lib/qa-records.mjs');

const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
const { records, errors } = loadRecords(ROOT);
const qa = loadQaRecords(ROOT);

if (errors.length) {
  console.error('Backlog records do not load cleanly; fix those first:');
  for (const error of errors.slice(0, 10)) console.error('  x ' + error);
  process.exit(1);
}

/** REG ids per root record, read from the register the same way the validator does. */
const regressionRoots = new Map();
const register = readFileSync(join(ROOT, 'docs/qa/regressions/index.md'), 'utf8');
for (const entry of register.split(/(?=^### REG-)/m)) {
  const regressionId = (/^### (REG-\d{3})/.exec(entry) ?? [])[1];
  if (!regressionId) continue;
  const rootCell = (/^\|\s*\*\*Bug record\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(entry) ?? [])[1] ?? '';
  for (const rootId of rootCell.match(/\b(?:BUG|ITEM)-\d{4}\b/g) ?? []) {
    regressionRoots.set(rootId, [...(regressionRoots.get(rootId) ?? []), regressionId]);
  }
}

const text = (value) => String(value ?? '').trim();

/** The fields the validator derives. Everything else on a row is curated. */
function derivedFields(record) {
  return {
    type: text(record.fields.Type),
    title: text(record.fields.Title),
    severity: record.severity,
    priority: record.priority,
    current_status: record.status,
    architect_disposition: text(record.fields.ArchitectDisposition),
    source: {
      record_path: record.relative,
      provenance: text(record.fields.Source),
      detected_in_sha: text(record.fields.DetectedInSha),
      created_at: text(record.fields.CreatedAt),
      updated_at: text(record.fields.UpdatedAt),
      resolved_at: text(record.fields.ResolvedAt),
    },
    /*
     * Declared order is preserved rather than sorted. `validate-framework.mjs`
     * compares these as sets, so sorting changes nothing it checks — and
     * re-ordering 84 existing rows to no effect turns a fifteen-row addition
     * into an 800-line diff that hides it.
     */
    affected_modules: [...(record.fields.AffectedModules ?? [])],
    regressions: regressionRoots.get(record.id) ?? [],
    qa_scenarios: qa.scenarios
      .filter((scenario) => scenario.bugs.includes(record.id))
      .map((scenario) => scenario.id),
    test_plan: qa.plans
      .filter((plan) => plan.bugs.includes(record.id))
      .map((plan) => plan.id),
  };
}

/** Set equality, matching how the validator compares these fields. */
function sameIds(a, b) {
  return (
    JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())
  );
}

/** Fields compared as sets, not as ordered lists. */
const SET_FIELDS = new Set(['affected_modules', 'regressions', 'qa_scenarios', 'test_plan']);

const byId = new Map((inventory.records ?? []).map((row) => [row.record_id, row]));
const canonicalIds = new Set(records.map((record) => record.id));
const added = [];
const updated = new Set();

for (const record of records) {
  const derived = derivedFields(record);
  const existing = byId.get(record.id);

  if (!existing) {
    byId.set(record.id, {
      record_id: record.id,
      ...derived,
      /*
       * Deliberately not prose. A generator inventing a verification scope
       * would put words in an engineer's mouth, and the record itself already
       * carries the real evidence — this points at it rather than paraphrasing.
       */
      current_evidence: {
        paths: [...(record.fields.AffectedModules ?? [])],
        verification_scope: `See ${record.relative} — Evidence, Reproduction and Acceptance Criteria.`,
      },
      dependencies: { record_ids: [], note: '' },
      related_bugs: [],
      related_backlog: [],
      active_session_conflict: 'NONE',
      owner_decision_required: 'NO',
      verification_result: 'NOT_VERIFIED',
    });
    added.push(record.id);
    continue;
  }

  for (const [field, value] of Object.entries(derived)) {
    const equal = SET_FIELDS.has(field)
      ? sameIds(existing[field], value)
      : JSON.stringify(existing[field]) === JSON.stringify(value);
    if (!equal) {
      existing[field] = value;
      updated.add(record.id);
    }
  }
}

const removed = [...byId.keys()].filter((id) => !canonicalIds.has(id));
for (const id of removed) byId.delete(id);

// Stable order, so a diff shows the change rather than a reshuffle.
inventory.records = [...byId.values()].sort((a, b) => a.record_id.localeCompare(b.record_id));

if (inventory.inventory_summary && typeof inventory.inventory_summary === 'object') {
  inventory.inventory_summary.total_records = inventory.records.length;
}

const changed = added.length > 0 || updated.size > 0 || removed.length > 0;

if (CHECK) {
  if (!changed) {
    console.log(`Remediation inventory is current — ${inventory.records.length} row(s).`);
    process.exit(0);
  }
  console.error('Remediation inventory is stale — run `node scripts/sync-remediation-inventory.mjs`:');
  if (added.length) console.error(`  x missing ${added.length} row(s): ${added.join(', ')}`);
  if (updated.size) console.error(`  x drifted ${updated.size} row(s): ${[...updated].slice(0, 8).join(', ')}`);
  if (removed.length) console.error(`  x orphaned ${removed.length} row(s): ${removed.join(', ')}`);
  process.exit(1);
}

writeFileSync(INVENTORY, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Remediation inventory synced — ${inventory.records.length} row(s); ` +
    `${added.length} added, ${updated.size} refreshed, ${removed.length} removed.`,
);
