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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_MAPPINGS } from './lib/obsidian-mappings.mjs';

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

// ------------------------------------------------------- the generated graph

/*
 * Why bug and backlog records grow a generated `## Related` block.
 *
 * `rebuild-qa.mjs` has projected frontmatter relationships into wikilinks since
 * 2026-08-18, when 82 of 95 QA scenarios were measured as isolated dots in the
 * Obsidian graph. Bugs and backlog items never got the same treatment, and the
 * result was exactly what you would expect: measured on 2026-08-22, **102 of 125
 * bug records and 50 of 80 items declared a related record in frontmatter that
 * appeared nowhere in the body**, so the relationship existed as data and not as
 * an edge. 66 bugs had no link to the module they were in.
 *
 * The graph view is how a person actually navigates this vault, and a bug that
 * is a loose dot beside its module and its item is a bug nobody finds from
 * either. The user's words for it were "my obsidian graph/nodes look horrible",
 * and the count above is what that looks like from inside.
 *
 * This INVENTS NOTHING. Every edge is a relationship the record already
 * declares:
 *   - RelatedBacklogItem / RelatedBug → that record. Both directions are
 *     emitted, so a bug reaches its item and the item reaches its bug.
 *   - AffectedModules → a module knowledge note, on an EXACT match only. The
 *     entries are paths ("services/api/src/modules/leave", "api:billing",
 *     "apps/web"), so the last path segment is what is matched. Fuzzy matching
 *     is refused for the same reason rebuild-qa refuses it: a plausible-looking
 *     wrong edge is worse than an absent one.
 *   - RelatedADR, RelatedImplementation, RelatedQA → those notes.
 *   - BlockedBy → the records that block this one.
 *   - RegressionId → PLAIN TEXT, never a wikilink. The register is one file with
 *     a heading per regression, so `[[REG-220]]` resolves to nothing. Two agents
 *     have now made that mistake; validate-framework.mjs fails on it.
 *
 * Everything outside the markers is hand-authored and is never touched.
 */
const GRAPH_BEGIN =
  '<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->';
const GRAPH_END = '<!-- GRAPH:END -->';

/*
 * Both knowledge folders, not just modules.
 *
 * A first version of this looked only in docs/knowledge/modules, which left the
 * four product surfaces unlinked: 57 records named `apps/admin`, 38 named
 * `apps/landing`, 28 `apps/web`, 17 `services/api` — and every one of those
 * notes already existed, in docs/knowledge/architecture. The relationships were
 * not missing and the notes were not missing; the lookup was simply pointed at
 * one of the two folders that hold them.
 */
const moduleNoteNames = new Set(
  ['docs/knowledge/modules', 'docs/knowledge/architecture']
    .filter((dir) => existsSync(join(ROOT, dir)))
    .flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => name.replace(/\.md$/, '')),
    ),
);

const recordIds = new Set(records.map((record) => record.id));

/*
 * Where a code directory and its knowledge note disagree on the name.
 *
 * This is a DECLARED table, not fuzzy matching, and the difference matters. A
 * fuzzy match would pair "contracts" with "contracts-and-agreements" and also
 * pair "commercial-onboarding" with "commercial-onboarding-lifecycle" — one of
 * those is right and the other is a different subject, and neither the matcher
 * nor the reader can tell which. Every entry here was checked by opening the
 * note; anything not listed gets no edge rather than a plausible wrong one.
 *
 * The right-hand side must be a real note in docs/knowledge/modules. A typo
 * here produces a dead link, so `validate-framework.mjs` checks the table
 * resolves.
 */
const MODULE_NOTE_ALIASES = new Map([
  /* Directory                    Note that documents it */
  ['contracts', 'contracts-and-agreements'],
  ['tenant-settings', 'settings'],
  ['settings-runtime', 'settings'],
  ['tenant-domains', 'workspace-routing-and-domains'],
  ['partner-experience', 'partners'],
  ['platform-events', 'audit-and-events'],
  ['audit', 'audit-and-events'],
  ['super-admin', 'super-admin'],
  ['tenants', 'tenant-control-plane'],

  /* The product surfaces. Each note is the one that documents that surface. */
  ['web', 'tenant-application'],
  ['admin', 'platform-admin'],
  ['landing', 'landing-architecture'],
  ['agent-desktop', 'desktop-agent-architecture'],
  ['api', 'api-architecture'],
  ['prisma', 'database-architecture'],
  ['gateway', 'desktop-api-gateway-relationship'],
  ['e2e', 'qa-and-ci-architecture'],
  ['ci', 'ci-architecture'],
  ['config', 'deployment-architecture'],
]);

/** The note name for a declared module, or null when there is no exact match. */
function moduleNoteFor(entry) {
  const cleaned = String(entry).trim().replace(/^(api|web|admin|pkg):/, '');
  const leaf = cleaned.split('/').filter(Boolean).pop() ?? '';
  if (moduleNoteNames.has(leaf)) return leaf;
  if (moduleNoteNames.has(cleaned)) return cleaned;

  const aliased = MODULE_NOTE_ALIASES.get(leaf) ?? MODULE_NOTE_ALIASES.get(cleaned);
  if (aliased && moduleNoteNames.has(aliased)) return aliased;

  return null;
}

/**
 * A note name from a docs path, e.g. docs/knowledge/... → the basename, but
 * ONLY when that file actually exists.
 *
 * The existence check is the whole point. A first version of this emitted the
 * basename unconditionally, and `RelatedImplementation` fields naming ExecPlans
 * that were never written as notes — landing-uiux-remediation,
 * admin-landing-ux-program and a dozen more — became 53 dead wikilinks across
 * the vault in one run.
 *
 * A generator that manufactures broken links to fix broken links is worse than
 * one that does nothing, and a dead wikilink renders as ordinary text, so
 * nothing would have announced it. `rebuild-qa.mjs` learned the same lesson
 * about REG ids; this is the same rule applied to a different field.
 */
function noteFromPath(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !trimmed.includes('/')) return null;
  const withExtension = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
  if (!existsSync(join(ROOT, withExtension))) return null;

  /*
   * Existing is not the same as being reachable.
   *
   * `docs/development/execplan-platform-authorization-boundary.md` exists and is
   * a perfectly good document — and `docs/development` is not in the sync
   * mappings, so it never reaches the vault. A link to it is dead there and
   * nowhere else, which is the most confusing kind: the repo looks fine and the
   * graph is broken.
   *
   * DEFAULT_MAPPINGS is the single source of truth for what publishes, so the
   * question is asked of it rather than of a second list that could drift.
   */
  const published = DEFAULT_MAPPINGS.some((mapping) =>
    withExtension.startsWith(`${mapping.from}/`),
  );
  if (!published) return null;

  return withExtension.split('/').pop().replace(/\.md$/, '');
}

function listField(record, key) {
  const value = record.fields[key];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  const single = String(value ?? '').trim();
  return single ? [single] : [];
}

/* Reverse edges: which bugs name this item, and which items name this bug. */
const inbound = new Map();
for (const record of records) {
  for (const key of ['RelatedBacklogItem', 'RelatedBug']) {
    for (const target of listField(record, key)) {
      if (!recordIds.has(target)) continue;
      if (!inbound.has(target)) inbound.set(target, new Set());
      inbound.get(target).add(record.id);
    }
  }
}

function graphBlockFor(record) {
  const rows = [];
  const seenLink = new Set();

  const linkRow = (label, ids) => {
    const unique = [...new Set(ids)].filter((id) => id && !seenLink.has(id));
    if (!unique.length) return;
    for (const id of unique) seenLink.add(id);
    rows.push(`- ${label} — ${unique.map((id) => `[[${id}]]`).join(', ')}`);
  };

  linkRow(
    'Backlog item',
    listField(record, 'RelatedBacklogItem').filter((id) => recordIds.has(id)),
  );
  linkRow('Bug', listField(record, 'RelatedBug').filter((id) => recordIds.has(id)));
  linkRow('Referenced by', [...(inbound.get(record.id) ?? [])]);
  linkRow('Blocked by', listField(record, 'BlockedBy').filter((id) => recordIds.has(id)));

  const modules = record.modules.map(moduleNoteFor).filter(Boolean);
  linkRow('Modules', modules);

  for (const [key, label] of [
    ['RelatedADR', 'Decision'],
    ['RelatedImplementation', 'Implementation'],
    ['RelatedQA', 'QA run'],
  ]) {
    linkRow(label, listField(record, key).map(noteFromPath).filter(Boolean));
  }

  const regression = String(record.fields.RegressionId ?? '').trim();
  if (regression) {
    rows.push(`- Regression — ${regression} (see the regression register)`);
  }

  if (!rows.length) {
    rows.push(
      '- No related record, module or decision is declared in this record\'s',
      '  frontmatter. Declare one rather than adding a link here by hand — this',
      '  block is regenerated and a hand-written link inside it is lost.',
    );
  }

  return [GRAPH_BEGIN, '', '## Related', '', ...rows, '', GRAPH_END].join('\n');
}

function withGraphBlock(body, block) {
  const start = body.indexOf(GRAPH_BEGIN);
  if (start === -1) return `${body.replace(/\s*$/, '')}\n\n${block}\n`;
  const end = body.indexOf(GRAPH_END, start);
  if (end === -1) return `${body.slice(0, start).replace(/\s*$/, '')}\n\n${block}\n`;
  return `${body.slice(0, start)}${block}${body.slice(end + GRAPH_END.length)}`;
}

let graphChanged = 0;
for (const record of records) {
  const current = readFileSync(record.path, 'utf8');
  const normalised = current.replace(/\r\n/g, '\n');
  const next = withGraphBlock(normalised, graphBlockFor(record));
  if (next === normalised) continue;
  if (CHECK_ONLY) {
    drift.push(record.relative);
    continue;
  }
  writeFileSync(record.path, current.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  graphChanged += 1;
}

if (!CHECK_ONLY && !AS_JSON && graphChanged) {
  console.log(`  rewrote  ${graphChanged} record graph block(s)`);
}

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
