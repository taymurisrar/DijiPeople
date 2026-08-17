#!/usr/bin/env node
/*
 * Regenerate the Backlog indexes from the Bug and Backlog records.
 *
 * The records under docs/bugs/ and docs/backlog/items/ are the source of
 * truth. Every index file in docs/backlog/ is derived, and any hand edit to one
 * is overwritten on the next run — that is the point. A hand-maintained index
 * is an index that is wrong within two tasks, and a wrong index is worse than
 * none because people trust it.
 *
 *   node scripts/rebuild-backlog.mjs             write
 *   node scripts/rebuild-backlog.mjs --check     verify indexes are current
 *   node scripts/rebuild-backlog.mjs --json      machine-readable summary
 *
 * Exit codes: 0 success
 *             1 structural error in a record, or --check found drift
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRecords,
  bucketOf,
  compareRecords,
  isActive,
  writeIfChanged,
  linkTo,
  GENERATED_BANNER,
  SEVERITIES,
  BUG_STATUSES,
  ITEM_STATUSES,
} from './lib/backlog-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'docs/backlog';

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const AS_JSON = argv.includes('--json');

// ------------------------------------------------------------------- rendering

function row(record) {
  const link = `[${record.id}](${linkTo(record, OUT_DIR)})`;
  const modules = record.modules.length ? record.modules.map(shortModule).join(', ') : '—';
  return `| ${link} | ${record.title} | ${record.type} | ${record.severity || '—'} | ${record.priority} | ${record.status} | ${modules} | ${record.disposition} |`;
}

const HEADER = [
  '| ID | Title | Type | Severity | Priority | Status | Affected | Architect |',
  '|---|---|---|---|---|---|---|---|',
].join('\n');

/* `services/api/src/modules/leads` reads as `api:leads` in a table cell. */
function shortModule(value) {
  return value
    .replace(/^services\/api\/src\/modules\//, 'api:')
    .replace(/^apps\/([a-z-]+)\/.*$/, 'app:$1')
    .replace(/^packages\/([a-z-]+).*$/, 'pkg:$1');
}

function table(records) {
  if (!records.length) return '_None._';
  return [HEADER, ...records.slice().sort(compareRecords).map(row)].join('\n');
}

function countBy(records, key) {
  const counts = new Map();
  for (const record of records) {
    const value = record[key] || '—';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countTable(counts, label, order) {
  const keys = order
    ? order.filter((key) => counts.has(key))
    : [...counts.keys()].sort();
  if (!keys.length) return '_None._';
  return [
    `| ${label} | Count |`,
    '|---|---|',
    ...keys.map((key) => `| ${key} | ${counts.get(key)} |`),
  ].join('\n');
}

function page({ title, intro, sections }) {
  const out = [`# ${title}`, '', GENERATED_BANNER, '', intro, ''];
  for (const [heading, content] of sections) {
    out.push(`## ${heading}`, '', content, '');
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// ------------------------------------------------------------------------ main

const { records, errors } = loadRecords(ROOT);

if (errors.length) {
  console.error(`Backlog rebuild FAILED — ${errors.length} structural error(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  console.error('');
  console.error('Fix the records; the indexes were not regenerated.');
  process.exit(1);
}

const buckets = { open: [], blocked: [], deferred: [], 'product-decisions': [], completed: [] };
for (const record of records) buckets[bucketOf(record)].push(record);

const bugs = records.filter((record) => record.kind === 'bug');
const items = records.filter((record) => record.kind === 'item');
const openRecords = buckets.open;
const untriaged = records.filter(
  (record) => record.disposition === 'TRIAGE_REQUIRED' || record.status === 'TRIAGE_REQUIRED',
);
const criticalOpen = openRecords.filter((record) => record.severity === 'CRITICAL');
const highOpen = openRecords.filter((record) => record.severity === 'HIGH');

const pages = {
  'index.md': page({
    title: 'Backlog Index',
    intro: [
      'Every durable Bug and Backlog record in the repository, whatever its state.',
      '',
      `**${records.length} records** — ${bugs.length} bug${bugs.length === 1 ? '' : 's'} under [\`docs/bugs/\`](../bugs/), ${items.length} non-bug item${items.length === 1 ? '' : 's'} under [\`items/\`](items/).`,
      '',
      'A bug record **is** its own backlog entry. There is no parallel item for it —',
      'see [`README.md`](README.md) for why.',
    ].join('\n'),
    sections: [
      [
        'At a glance',
        [
          '| | Count |',
          '|---|---|',
          `| Open (active work) | ${buckets.open.length} |`,
          `| Blocked | ${buckets.blocked.length} |`,
          `| Deferred | ${buckets.deferred.length} |`,
          `| Awaiting a product decision | ${buckets['product-decisions'].length} |`,
          `| Completed / closed | ${buckets.completed.length} |`,
          `| **Open CRITICAL** | **${criticalOpen.length}** |`,
          `| **Open HIGH** | **${highOpen.length}** |`,
          `| **Awaiting Architect triage** | **${untriaged.length}** |`,
        ].join('\n'),
      ],
      ['Open by severity', countTable(countBy(openRecords, 'severity'), 'Severity', SEVERITIES)],
      ['Open by type', countTable(countBy(openRecords, 'type'), 'Type')],
      [
        'All records by status',
        countTable(
          countBy(records, 'status'),
          'Status',
          [...new Set([...BUG_STATUSES, ...ITEM_STATUSES])],
        ),
      ],
      ['All records', table(records)],
      [
        'Views',
        [
          '- [Open](open.md) — active work',
          '- [Blocked](blocked.md) — waiting on something external',
          '- [Deferred](deferred.md) — deliberately not now',
          '- [Product decisions](product-decisions.md) — waiting on a human product call',
          '- [Completed](completed.md) — fixed, verified, closed, cancelled or accepted',
        ].join('\n'),
      ],
    ],
  }),

  'open.md': page({
    title: 'Open Backlog',
    intro: [
      'Active work: bugs that are `OPEN` / `IN_PROGRESS` / `FIXED` (fixed but not yet',
      'QA-verified), and items that are `NEW` / `TRIAGE_REQUIRED` / `READY` /',
      '`IN_PROGRESS` / `VALIDATING`.',
      '',
      'The Architect reads this before planning any substantial change —',
      '`BACKLOG_PRECHECK` in [`.agent/agents/architect.md`](../../.agent/agents/architect.md).',
    ].join('\n'),
    sections: [
      ['Awaiting Architect triage', table(untriaged.filter(isActive))],
      ['CRITICAL', table(criticalOpen)],
      ['HIGH', table(highOpen)],
      ['MEDIUM', table(openRecords.filter((record) => record.severity === 'MEDIUM'))],
      [
        'LOW and unrated',
        table(openRecords.filter((record) => !['CRITICAL', 'HIGH', 'MEDIUM'].includes(record.severity))),
      ],
    ],
  }),

  'blocked.md': page({
    title: 'Blocked',
    intro: [
      'Work that cannot proceed until something outside it changes — access, an',
      'external dependency, missing infrastructure, or another record.',
      '',
      '**Blocked is not deferred.** A blocked record is wanted now and cannot move;',
      'a deferred one could move and was chosen against. Recording one as the other',
      'loses the difference between a queue and an obstacle.',
    ].join('\n'),
    sections: [['Blocked records', table(buckets.blocked)]],
  }),

  'deferred.md': page({
    title: 'Deferred',
    intro: [
      'Deliberately not now, with a reason. Deferring is a legitimate disposition —',
      'silently dropping is not.',
      '',
      'A `CRITICAL` record may never appear here: the Architect must choose `FIX_NOW`',
      'or `BLOCKED_EXTERNAL` with an explicit reason. See',
      '[`.agent/agents/architect.md`](../../.agent/agents/architect.md).',
    ].join('\n'),
    sections: [['Deferred records', table(buckets.deferred)]],
  }),

  'product-decisions.md': page({
    title: 'Open Product Decisions',
    intro: [
      'Records where the engineering behaviour is understood but the **correct product**',
      '**behaviour is not decided**. These are questions for a human, not tasks for an',
      'agent, and no agent may resolve one by guessing.',
      '',
      'Each states the question, the options and what each option costs.',
    ].join('\n'),
    sections: [['Awaiting a product decision', table(buckets['product-decisions'])]],
  }),

  'completed.md': page({
    title: 'Completed',
    intro: [
      'Terminal records: verified fixes, closed items, duplicates, things that turned',
      'out not to be bugs, and explicitly accepted risks.',
      '',
      'Kept, not deleted. A fixed bug is the evidence a regression test exists for',
      'a real failure — which is what a future agent needs when it is about to write',
      'the same defect again.',
    ].join('\n'),
    sections: [
      [
        'Verified and closed',
        table(buckets.completed.filter((record) => ['VERIFIED', 'CLOSED', 'DONE'].includes(record.status))),
      ],
      [
        'Accepted risk',
        table(buckets.completed.filter((record) => record.status === 'ACCEPTED_RISK')),
      ],
      [
        'Not a bug, duplicate or cancelled',
        table(
          buckets.completed.filter((record) =>
            ['NOT_A_BUG', 'DUPLICATE', 'CANCELLED'].includes(record.status),
          ),
        ),
      ],
    ],
  }),
};

let changed = 0;
const drift = [];

for (const [name, content] of Object.entries(pages)) {
  const path = join(ROOT, OUT_DIR, name);
  if (CHECK_ONLY) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content.replace(/\r\n/g, '\n')) drift.push(`${OUT_DIR}/${name}`);
    continue;
  }
  if (writeIfChanged(path, content)) {
    changed += 1;
    console.log(`  rewrote  ${OUT_DIR}/${name}`);
  }
}

const summary = {
  records: records.length,
  bugs: bugs.length,
  items: items.length,
  open: buckets.open.length,
  blocked: buckets.blocked.length,
  deferred: buckets.deferred.length,
  productDecisions: buckets['product-decisions'].length,
  completed: buckets.completed.length,
  openCritical: criticalOpen.length,
  openHigh: highOpen.length,
  awaitingTriage: untriaged.length,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else if (CHECK_ONLY) {
  if (drift.length) {
    console.error('Backlog indexes are stale — run `node scripts/rebuild-backlog.mjs`:');
    for (const file of drift) console.error(`  x ${file}`);
    process.exit(1);
  }
  console.log(`Backlog indexes are current — ${records.length} record(s), 0 structural errors.`);
} else {
  console.log('');
  console.log(
    `Backlog rebuilt — ${records.length} record(s) (${bugs.length} bug, ${items.length} item); ` +
      `${changed} index file(s) rewritten, ${Object.keys(pages).length - changed} already current.`,
  );
  console.log(
    `Open ${summary.open} (CRITICAL ${summary.openCritical}, HIGH ${summary.openHigh}) · ` +
      `blocked ${summary.blocked} · deferred ${summary.deferred} · ` +
      `product decisions ${summary.productDecisions} · completed ${summary.completed} · ` +
      `awaiting triage ${summary.awaitingTriage}`,
  );
}
