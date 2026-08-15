#!/usr/bin/env node
/*
 * Generate the two Obsidian dashboards from repository state.
 *
 * Written into docs/knowledge/dashboards/ — in Git, reviewable in a diff — and
 * published to `00 - Home/Generated/` by scripts/sync-obsidian.mjs. Agents never
 * write into the vault directly; the sync is the only writer.
 *
 * Every count is derived at generation time. A dashboard with a number typed
 * into its prose is a dashboard that is wrong within two tasks, and wrong in the
 * most damaging way: confidently, in the place people look first.
 *
 * Links are `[[wikilinks]]`, not relative paths. These two notes are read in the
 * vault, where notes resolve by name and a repository-relative path resolves to
 * nothing. The backlog indexes under docs/backlog/ use relative Markdown links
 * for the opposite reason — they are read on GitHub.
 *
 *   node scripts/generate-dashboards.mjs [--check]
 *
 * Exit codes: 0 success · 1 a record is malformed, or --check found drift
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords, bucketOf, compareRecords, writeIfChanged } from './lib/backlog-records.mjs';

const BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,\n' +
  '> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/knowledge/dashboards');

const CHECK_ONLY = process.argv.includes('--check');

// ------------------------------------------------------------------- helpers

/** Note name as Obsidian resolves it: the filename without its extension. */
const noteName = (path) => basename(path, '.md');

const wikilink = (path, label) => {
  const name = noteName(path);
  return label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`;
};

function markdownFilesIn(relativeDir, { recursive = false } = {}) {
  const dir = join(ROOT, relativeDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (recursive) out.push(...markdownFilesIn(join(relativeDir, entry), { recursive }));
      continue;
    }
    if (entry.endsWith('.md') && entry !== 'README.md') {
      out.push(join(relativeDir, entry).replace(/\\/g, '/'));
    }
  }
  return out;
}

/** First H1, which is what a reader recognises the note by. */
function titleOf(relativePath) {
  try {
    const body = readFileSync(join(ROOT, relativePath), 'utf8');
    return (body.match(/^#\s+(.+)$/m) ?? [])[1]?.trim() ?? noteName(relativePath);
  } catch {
    return noteName(relativePath);
  }
}

/*
 * Date-prefixed history files sort newest-first by name alone. Anything else
 * falls back to name order, which is at least stable.
 */
const newestFirst = (a, b) => b.localeCompare(a);

function recentList(files, limit, { empty = '_None yet._' } = {}) {
  const shown = files.slice().sort(newestFirst).slice(0, limit);
  if (!shown.length) return empty;
  return shown.map((file) => `- ${wikilink(file, titleOf(file))}`).join('\n');
}

// -------------------------------------------------------------------- tables

const RECORD_COLUMNS = '| ID | Title | Type | Severity | Status | Affected | Architect |';
const RECORD_DIVIDER = '|---|---|---|---|---|---|---|';

const shortModule = (value) =>
  value
    .replace(/^services\/api\/src\/modules\//, 'api:')
    .replace(/^apps\/([a-z-]+)\/.*$/, 'app:$1')
    .replace(/^packages\/([a-z-]+).*$/, 'pkg:$1');

function recordRow(record) {
  const modules = record.modules.length ? record.modules.map(shortModule).join(', ') : '—';
  return `| ${wikilink(record.relative, record.id)} | ${record.title} | ${record.type} | ${record.severity || '—'} | ${record.status} | ${modules} | ${record.disposition} |`;
}

function recordTable(records, empty = '_None._') {
  if (!records.length) return empty;
  return [RECORD_COLUMNS, RECORD_DIVIDER, ...records.slice().sort(compareRecords).map(recordRow)].join('\n');
}

function page(title, sections) {
  const lines = [`# ${title}`, '', BANNER, ''];
  for (const [heading, body] of sections) {
    if (body === null) continue;
    lines.push(`## ${heading}`, '', body, '');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// --------------------------------------------------------------------- state

const { records, errors } = loadRecords(ROOT);

if (errors.length) {
  console.error(`Dashboard generation FAILED — ${errors.length} record error(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  console.error('');
  console.error('Fix the records and run `node scripts/rebuild-backlog.mjs` first.');
  process.exit(1);
}

const buckets = { open: [], blocked: [], deferred: [], 'product-decisions': [], completed: [] };
for (const record of records) buckets[bucketOf(record)].push(record);

const openRecords = buckets.open;
const bySeverity = (severity) => openRecords.filter((record) => record.severity === severity);
const byType = (type) => openRecords.filter((record) => record.type === type);

const untriaged = records.filter((record) => record.disposition === 'TRIAGE_REQUIRED');

/* Fixed but not yet retested, plus verified — the two halves of "recently fixed". */
const recentlyFixed = records.filter(
  (record) => record.kind === 'bug' && ['FIXED', 'VERIFIED'].includes(record.status),
);

const qaRuns = markdownFilesIn('docs/qa/runs');
const implementations = markdownFilesIn('docs/knowledge/implementations');
const releases = markdownFilesIn('docs/deployment/release-history');
const engineeringHistory = markdownFilesIn('docs/engineering-history/tasks');
const adrs = markdownFilesIn('docs/decisions');
const generatedDecisions = markdownFilesIn('docs/knowledge/decisions');
const moduleNotes = markdownFilesIn('docs/knowledge/modules');
const productNotes = markdownFilesIn('docs/knowledge/product');
const architectureNotes = markdownFilesIn('docs/knowledge/architecture');
const requirementNotes = markdownFilesIn('docs/knowledge/requirements');
const patterns = markdownFilesIn('docs/qa/known-bug-patterns');

// ---------------------------------------------------- engineering dashboard

const knowledgeHealth = [
  '| Knowledge | Count |',
  '|---|---|',
  `| Bug records | ${records.filter((r) => r.kind === 'bug').length} |`,
  `| Backlog items | ${records.filter((r) => r.kind === 'item').length} |`,
  `| Known bug patterns | ${patterns.length} |`,
  `| QA runs | ${qaRuns.length} |`,
  `| Engineering history records | ${engineeringHistory.length} |`,
  `| Release records | ${releases.length} |`,
  `| Module notes | ${moduleNotes.length} |`,
  `| Architecture notes | ${architectureNotes.length} |`,
  `| Decision notes (ADR + generated) | ${adrs.length + generatedDecisions.length} |`,
  `| Implementation records | ${implementations.length} |`,
  '',
  `**Awaiting Architect triage: ${untriaged.length}.** A record nobody has`,
  'triaged is work nobody has decided about — the number that should stay near',
  'zero between tasks.',
  '',
  releases.length === 0
    ? '**No release records exist.** Nothing has been deployed through the release process yet; this is a true statement about the repository, not a gap in the dashboard.'
    : null,
  engineeringHistory.length === 0
    ? '**No engineering-history records exist yet.** The system was introduced with this framework; records accumulate from the next task onwards.'
    : null,
]
  .filter((line) => line !== null)
  .join('\n');

const engineering = page('DijiPeople Engineering Dashboard', [
  [
    'At a glance',
    [
      '| | |',
      '|---|---|',
      `| Open CRITICAL | **${bySeverity('CRITICAL').length}** |`,
      `| Open HIGH | **${bySeverity('HIGH').length}** |`,
      `| Open total | ${openRecords.length} |`,
      `| Blocked | ${buckets.blocked.length} |`,
      `| Awaiting a product decision | ${buckets['product-decisions'].length} |`,
      `| Deferred | ${buckets.deferred.length} |`,
      `| Completed | ${buckets.completed.length} |`,
      `| Awaiting Architect triage | ${untriaged.length} |`,
    ].join('\n'),
  ],
  ['Open Critical Bugs', recordTable(bySeverity('CRITICAL'), '_None. Nothing open at CRITICAL._')],
  ['Open High Bugs', recordTable(bySeverity('HIGH'))],
  [
    'Product Decisions Needed',
    recordTable(
      buckets['product-decisions'],
      '_None. Every known question has an answer._',
    ),
  ],
  ['Blocked Items', recordTable(buckets.blocked)],
  ['Current Test Gaps', recordTable(byType('TEST_GAP'))],
  ['Current Infrastructure Gaps', recordTable(byType('INFRA'))],
  ['Recently Fixed Bugs', recordTable(recentlyFixed)],
  ['Recent QA Runs', recentList(qaRuns, 8)],
  ['Recent Implementations', recentList(implementations, 8)],
  [
    'Recent Engineering History',
    recentList(
      engineeringHistory,
      8,
      { empty: '_None yet — records begin with the next task._' },
    ),
  ],
  [
    'Recent Releases',
    recentList(releases, 5, { empty: '_None. Nothing has been deployed through the release process._' }),
  ],
  [
    'Active / Recent Backlog',
    recordTable(
      openRecords.filter((record) => !['CRITICAL', 'HIGH'].includes(record.severity)),
    ),
  ],
  [
    'Key Architecture Decisions',
    [...adrs, ...generatedDecisions].length
      ? [...adrs, ...generatedDecisions]
          .sort()
          .map((file) => `- ${wikilink(file, titleOf(file))}`)
          .join('\n')
      : '_None recorded._',
  ],
  ['Knowledge Health', knowledgeHealth],
  [
    'How this is maintained',
    [
      'Regenerate with:',
      '',
      '```bash',
      'node scripts/rebuild-backlog.mjs',
      'node scripts/generate-dashboards.mjs',
      'node scripts/sync-obsidian.mjs',
      '```',
      '',
      'Every count above is derived from the records at generation time. Nothing',
      'here is maintained by hand, and editing this note in the vault only means',
      'losing the edit on the next sync — change the record instead.',
    ].join('\n'),
  ],
]);

// -------------------------------------------------------- product dashboard

const productDashboard = page('DijiPeople Product Dashboard', [
  [
    'What DijiPeople is',
    [
      'A multi-tenant SaaS HRM and business platform: one codebase, one database,',
      'many tenants, built as a configurable product rather than a per-client build.',
      '',
      'Four surfaces — the tenant product, the platform admin console, an Electron',
      'attendance agent, and the public marketing site.',
      '',
      productNotes.length
        ? `See ${wikilink('dijipeople-platform-overview.md', 'DijiPeople Platform Overview')} for the full picture.`
        : '_Product notes have not been generated yet._',
    ].join('\n'),
  ],
  [
    'Product Areas',
    productNotes.length
      ? productNotes.sort().map((file) => `- ${wikilink(file, titleOf(file))}`).join('\n')
      : '_None generated._',
  ],
  [
    'Main Modules',
    moduleNotes.length
      ? moduleNotes.sort().map((file) => `- ${wikilink(file, titleOf(file))}`).join('\n')
      : '_None generated._',
  ],
  [
    'Requirements',
    requirementNotes.length
      ? requirementNotes.sort().map((file) => `- ${wikilink(file, titleOf(file))}`).join('\n')
      : '_None generated._',
  ],
  [
    'Open Product Decisions',
    buckets['product-decisions'].length
      ? [
          'Questions where the engineering is understood and the **product answer**',
          '**is not**. No agent may resolve one by implementing a side of it.',
          '',
          buckets['product-decisions']
            .slice()
            .sort(compareRecords)
            .map(
              (record) =>
                `- ${wikilink(record.relative, record.id)} — **${record.title}** (${record.severity || 'unrated'})`,
            )
            .join('\n'),
        ].join('\n')
      : '_None outstanding._',
  ],
  [
    'Recent Product Changes',
    recentList(implementations, 6, { empty: '_None recorded._' }),
  ],
  [
    'Known Product-Visible Defects',
    recordTable(
      openRecords.filter((record) => ['UX', 'DATA_INTEGRITY', 'STATE_MACHINE'].includes(record.type)),
      '_None open._',
    ),
  ],
  [
    'How to read this',
    [
      'Generated from what the repository can actually evidence — source code,',
      'architecture documents, QA runs and decision records. **Nothing here is',
      'product intent that was not implemented.** Intent, meeting notes and client',
      'feedback live in the hand-written folders of this vault, which no agent',
      'writes to.',
      '',
      'Where a generated note and a hand-written one disagree, the hand-written one',
      'records what was *wanted* and this one records what was *built*. Both are',
      'worth having; neither overwrites the other.',
    ].join('\n'),
  ],
]);

// ------------------------------------------------------------------- writing

const pages = {
  'DijiPeople Engineering Dashboard.md': engineering,
  'DijiPeople Product Dashboard.md': productDashboard,
};

let changed = 0;
const drift = [];

for (const [name, content] of Object.entries(pages)) {
  const path = join(OUT_DIR, name);
  if (CHECK_ONLY) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content.replace(/\r\n/g, '\n')) drift.push(name);
    continue;
  }
  if (writeIfChanged(path, content)) {
    changed += 1;
    console.log(`  rewrote  docs/knowledge/dashboards/${name}`);
  }
}

if (CHECK_ONLY) {
  if (drift.length) {
    console.error('Dashboards are stale — run `node scripts/generate-dashboards.mjs`:');
    for (const name of drift) console.error(`  x ${name}`);
    process.exit(1);
  }
  console.log('Dashboards are current.');
} else {
  console.log('');
  console.log(
    `Dashboards generated — ${changed} rewritten, ${Object.keys(pages).length - changed} already current.`,
  );
  console.log(
    `Open CRITICAL ${bySeverity('CRITICAL').length} · HIGH ${bySeverity('HIGH').length} · ` +
      `product decisions ${buckets['product-decisions'].length} · blocked ${buckets.blocked.length} · ` +
      `awaiting triage ${untriaged.length}`,
  );
}
