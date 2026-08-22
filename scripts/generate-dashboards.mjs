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
import { loadSessions, compareSessions, isActive as sessionIsActive } from './lib/session-records.mjs';
import { loadTasks, readyPackages, progressOf, isActive as taskIsActive } from './lib/task-records.mjs';
import { COVERAGE_DIMENSIONS, loadQaRecords } from './lib/qa-records.mjs';
import { loadQuestions } from './lib/question-records.mjs';
import { hasMeaningfulContent } from './lib/obsidian-mappings.mjs';

const BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,\n' +
  '> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/knowledge/dashboards');

const CHECK_ONLY = process.argv.includes('--check');

// ------------------------------------------------------------------- helpers

/** Note name as Obsidian resolves it: the filename without its extension. */
const noteName = (path) => basename(path, '.md');

/**
 * A wikilink, but only to a record that will actually reach the vault.
 *
 * The empty-note policy skips sources with no substance, so a stub record never
 * becomes a note — and a dashboard that links to it emits a wikilink Obsidian
 * cannot resolve. SESSION-0023 is a 103-word stub, and the Control Center was
 * its only unresolved link.
 *
 * Resolving that by publishing the stub anyway would defeat the empty-note
 * policy; resolving it by editing another session's record would be reaching
 * into work that is not this one's. So the dashboard degrades to plain text,
 * which is honest: the row still appears, and it simply is not a link.
 */
const wikilink = (path, label) => {
  const name = noteName(path);
  const full = join(ROOT, path);
  if (existsSync(full)) {
    try {
      if (!hasMeaningfulContent(readFileSync(full, 'utf8'))) return label || name;
    } catch {
      /* Unreadable is the caller's problem to report, not this helper's. */
    }
  }
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

// -------------------------------------------------- engineering control center

/*
 * One high-level state view: what is in flight, what is blocked, and whether the
 * branch model is being respected.
 *
 * Generated from **durable records only** — sessions, tasks, backlog, QA. Live
 * state (heartbeats, who holds the schema lease this minute, the integration
 * lock) deliberately stays out: a note regenerated from live state can never
 * pass a `--check` for drift, and a generated file that is always dirty is one
 * nobody regenerates. The live view is `node scripts/session.mjs list`, and this
 * note says so rather than pretending to be it.
 */

const { sessions, errors: sessionErrors } = loadSessions(ROOT);
const { tasks, errors: taskErrors } = loadTasks(ROOT);
const qa = loadQaRecords(ROOT);

for (const [label, list] of [['session', sessionErrors], ['task', taskErrors], ['QA', qa.errors]]) {
  if (list.length) {
    console.error(`Control Center generation FAILED — ${list.length} ${label} record error(s):`);
    for (const error of list.slice(0, 8)) console.error(`  x ${error}`);
    console.error('');
    console.error('Fix the records and re-run the matching rebuild script first.');
    process.exit(1);
  }
}

const activeSessions = sessions.filter(sessionIsActive).sort(compareSessions);
const activeTasks = tasks.filter(taskIsActive);
const schemaWriters = activeSessions.filter((session) => session.schemaWrite === 'YES');
const ownerDecisions = buckets['product-decisions'];

const coverageGaps = qa.plans.flatMap((plan) =>
  Object.keys(COVERAGE_DIMENSIONS)
    .filter((dimension) => plan.coverage[dimension] === 'GAP')
    .map((dimension) => ({ area: plan.area, dimension, relative: plan.relative })),
);

const blockedScenarios = qa.scenarios.filter((s) => s.automation === 'BLOCKED_INFRASTRUCTURE');

const activeWorkPackages = activeTasks.flatMap((task) =>
  task.packages.filter((wp) => ['READY', 'IN_PROGRESS', 'QA', 'CI', 'MERGING'].includes(wp.status)),
);
const blockedWorkPackages = activeTasks.flatMap((task) =>
  task.packages.filter((wp) => wp.status === 'BLOCKED'),
);

const sessionTable = activeSessions.length
  ? [
      '| Session | Task | Title | Status | Branch | Target | Leases | Schema |',
      '|---|---|---|---|---|---|---|---|',
      ...activeSessions.map(
        (s) =>
          `| ${wikilink(s.relative, s.id)} | ${s.taskId || '—'} | ${s.title} | ${s.status} | ` +
          `\`${s.taskBranch}\` | \`${s.targetBranch}\` | ${s.leases.join(', ') || '—'} | ${s.schemaWrite} |`,
      ),
    ].join('\n')
  : '_No session is currently registered as active._';

const taskTable = activeTasks.length
  ? [
      '| Task | Title | Type | Size | Progress | Current | Ready next | Blocked |',
      '|---|---|---|---|---|---|---|---|',
      ...activeTasks.map((task) => {
        const { done, total } = progressOf(task);
        const ready = readyPackages(task).map((wp) => wp.id);
        const blocked = task.packages.filter((wp) => wp.status === 'BLOCKED').map((wp) => wp.id);
        return (
          `| ${wikilink(task.relative, task.id)} | ${task.title} | ${task.type} | ${task.size} | ` +
          `${done}/${total} | ${task.currentPackage || '—'} | ${ready.join(', ') || '—'} | ${blocked.join(', ') || '—'} |`
        );
      }),
    ].join('\n')
  : '_No parent task is active._';

/*
 * ------------------------------------------------------------------ stewardship
 *
 * The Product & Backlog Steward's signals, derived here rather than restated.
 * A dashboard that repeats a number somebody typed is a second source of truth,
 * which is the thing it exists to prevent.
 *
 * Only what the records can actually support is published. Obsidian parity, the
 * develop queue, test-resource cleanup and branch SHAs are all *live* state:
 * they change between one command and the next, so a number here would be a
 * claim that is already stale. Those get a command instead, which is the same
 * stance this note already takes about heartbeats and leases.
 */
/*
 * Scoped to the open bucket, the same population the severity counters above
 * use. Health measured over a different set than the counts beside it would
 * invite exactly the arithmetic nobody can reproduce.
 */
const activeRecords = openRecords;
const SETTLED_DISPOSITIONS = new Set(['ACCEPTED_RISK', 'DUPLICATE', 'NOT_A_BUG']);

const field = (record, name) => String(record.fields[name] ?? '').trim();
const hasField = (record, name) => {
  const value = record.fields[name];
  return Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? '').trim());
};

const ownerlessActionable = activeRecords.filter(
  (record) => !field(record, 'OwnerAgent') && !SETTLED_DISPOSITIONS.has(record.disposition),
);
const withoutAcceptance = activeRecords.filter((record) => !hasField(record, 'AcceptanceCriteria'));
const withoutNextAction = activeRecords.filter((record) => !hasField(record, 'NextAction'));

const ageInDays = (record) => {
  const at = Date.parse(String(record.fields.CreatedAt ?? record.fields.DetectedDate ?? ''));
  if (Number.isNaN(at)) return null;
  return Math.floor((Date.now() - at) / 86_400_000);
};
const aging = (threshold) =>
  activeRecords.filter((record) => (ageInDays(record) ?? 0) >= threshold).length;

const architectureDebt = activeRecords.filter((record) =>
  ['ARCHITECTURE', 'TECH_DEBT'].includes(record.type),
);
const securityGaps = activeRecords.filter((record) =>
  ['SECURITY', 'AUTHORIZATION', 'TENANT_ISOLATION'].includes(record.type),
);
const databaseGaps = activeRecords.filter((record) =>
  ['DATABASE', 'DATA_INTEGRITY', 'DATA_MIGRATION'].includes(record.type),
);

const { questions } = loadQuestions(ROOT);
const openQuestions = questions.filter((question) => question.status === 'OPEN');

/*
 * Work packages waiting on a user answer, across every live program. This is
 * the number that says whether the framework is blocked on the user or on
 * itself — and WAITING_USER is deliberately not counted as BLOCKED, because one
 * unanswered question must not read as a stalled program.
 */
const waitingUserPackages = activeTasks.flatMap((task) =>
  (task.packages ?? [])
    .filter((entry) => entry.status === 'WAITING_USER')
    .map((entry) => `${task.id} ${entry.id}`),
);

const controlCenter = page('Engineering Control Center', [
  [
    'State',
    [
      '| | |',
      '|---|---|',
      `| Active sessions | **${activeSessions.length}** |`,
      `| Active parent tasks | ${activeTasks.length} |`,
      `| Active work packages | ${activeWorkPackages.length} |`,
      `| Blocked work packages | ${blockedWorkPackages.length} |`,
      `| Work packages waiting on the user | ${waitingUserPackages.length}${waitingUserPackages.length ? ` — ${waitingUserPackages.join(', ')}` : ''} |`,
      `| Open questions | ${openQuestions.length} |`,
      `| Sessions declaring a schema write | ${schemaWriters.length}${schemaWriters.length > 1 ? ' — **the database is single-writer across all sessions; this must be at most 1**' : ''} |`,
      `| Open CRITICAL | **${bySeverity('CRITICAL').length}** |`,
      `| Open HIGH | ${bySeverity('HIGH').length} |`,
      `| Awaiting Architect triage | ${untriaged.length} |`,
      `| Owner decisions pending | ${ownerDecisions.length} |`,
      `| QA coverage gaps | ${coverageGaps.length} |`,
      `| Scenarios blocked by infrastructure | ${blockedScenarios.length} |`,
    ].join('\n'),
  ],
  [
    'Backlog health',
    [
      'Whether the outstanding work is *actionable*, as opposed to merely valid.',
      'A record nobody owns, with no acceptance criteria and no next action,',
      'survives every review by being unfalsifiable.',
      '',
      '| | |',
      '|---|---|',
      `| Ownerless actionable records | ${ownerlessActionable.length}${ownerlessActionable.length ? ` — ${ownerlessActionable.map((record) => record.id).slice(0, 8).join(', ')}` : ''} |`,
      `| No acceptance criteria | ${withoutAcceptance.length} |`,
      `| No next action | ${withoutNextAction.length} |`,
      `| Aging — 7d / 30d / 90d | ${aging(7)} / ${aging(30)} / ${aging(90)} |`,
      `| Architecture and technical debt | ${architectureDebt.length} |`,
      `| Security gaps | ${securityGaps.length} |`,
      `| Database gaps | ${databaseGaps.length} |`,
      '',
      'Ranked next-best actions weigh blast radius rather than severity alone, and',
      'are computed on demand so the reasons travel with the ranking:',
      '',
      '```bash',
      'node scripts/backlog-review.mjs        # health detectors and NEXT_BEST_ACTIONS',
      'node scripts/agent-health.mjs          # AGENT_HEALTH_REGRESSIONS',
      '```',
    ].join('\n'),
  ],
  ['Active Sessions', sessionTable],
  ['Active Tasks and Work Packages', taskTable],
  [
    'Branch model',
    [
      '```',
      'main        production deployment branch   ← RELEASE / DEPLOY / HOTFIX_PRODUCTION only',
      '  ↑',
      'develop     autonomous integration branch  ← every ordinary task',
      '  ↑',
      'agent/*     isolated implementation branches',
      '```',
      '',
      'An ordinary task finishes with `MAIN_CHANGE_STATUS = UNTOUCHED` and',
      '`DEVELOP_SYNC_STATUS = SYNCED`. Branch state is read from the repository',
      'rather than published here, because a note cannot be evidence about a ref:',
      '',
      '```bash',
      'node scripts/repo-health.mjs --main-baseline <sha-at-task-start>',
      '```',
    ].join('\n'),
  ],
  [
    'Live state is deliberately not in this note',
    [
      'Heartbeats, the write leases held this minute, `DATABASE_WRITER` and the',
      'develop merge queue live in the repository\'s shared Git directory, not in',
      'Git. They change between one command and the next, so publishing them here',
      'would produce a note that is never current and can never pass a drift check.',
      '',
      '```bash',
      'node scripts/session.mjs list                    # sessions, leases, DATABASE_WRITER, queue',
      'node scripts/session.mjs check --paths <paths>   # classify proposed work',
      'node scripts/repo-health.mjs                     # branches, worktrees, integration lock',
      'node scripts/backlog-review.mjs                  # aging, revalidation, duplicates',
      'node scripts/db-preflight.mjs                    # schema, migrations, client, local database',
      'node scripts/sync-obsidian.mjs --verify           # source orphans, graph orphans, links, parity',
      'node scripts/ci-metrics.mjs collect               # CI durations, cancellations, regression triggers',
      '```',
      '',
      'What this note carries is the durable half: which sessions and tasks exist,',
      'what they own, and what the backlog and QA systems currently say.',
    ].join('\n'),
  ],
  ['Open Critical', recordTable(bySeverity('CRITICAL'), '_None. Nothing open at CRITICAL._')],
  [
    'Owner Decisions Pending',
    ownerDecisions.length
      ? [
          'Questions where the engineering is understood and the **product answer is**',
          '**not**. No agent may resolve one by implementing a side of it.',
          '',
          ...ownerDecisions
            .slice()
            .sort(compareRecords)
            .map((record) => `- ${wikilink(record.relative, record.id)} — **${record.title}**`),
        ].join('\n')
      : '_None outstanding._',
  ],
  [
    'QA Coverage Gaps',
    coverageGaps.length
      ? [
          'A task touching one of these areas on the named dimension pulls closing the',
          'gap into scope — or files a `TEST_GAP` item and says so.',
          '',
          '| Area | Dimension |',
          '|---|---|',
          ...coverageGaps.map((gap) => `| ${wikilink(gap.relative, gap.area)} | ${gap.dimension} |`),
        ].join('\n')
      : '_None declared._',
  ],
  [
    'Backlog Health',
    [
      '| | |',
      '|---|---|',
      `| Open total | ${openRecords.length} |`,
      `| Blocked | ${buckets.blocked.length} |`,
      `| Deferred | ${buckets.deferred.length} |`,
      `| Awaiting a product decision | ${ownerDecisions.length} |`,
      `| Awaiting Architect triage | ${untriaged.length} |`,
      '',
      untriaged.length
        ? '**A record nobody has triaged is work nobody has decided about.** No ordinary record may stay `TRIAGE_REQUIRED` at the end of a task.'
        : 'Every ordinary record carries a disposition.',
    ].join('\n'),
  ],
  [
    'Deployment',
    [
      'Deployment state is **not** derivable from Git. A merge is Git state; what is',
      'running is a separate fact with separate evidence, recorded per release under',
      '`docs/deployment/release-history/`.',
      '',
      releases.length === 0
        ? '_No release has been recorded. Nothing has been deployed through the release process._'
        : recentList(releases, 5),
    ].join('\n'),
  ],
  [
    'How this is maintained',
    [
      'Regenerate with:',
      '',
      '```bash',
      'node scripts/rebuild-sessions.mjs',
      'node scripts/rebuild-tasks.mjs',
      'node scripts/rebuild-backlog.mjs',
      'node scripts/rebuild-qa.mjs',
      'node scripts/generate-dashboards.mjs',
      'node scripts/sync-obsidian.mjs',
      '```',
      '',
      'Every number is derived from the records at generation time. Editing this note',
      'in the vault only loses the edit on the next sync — change the record instead.',
    ].join('\n'),
  ],
]);

// ------------------------------------------------------------------- writing

const pages = {
  'DijiPeople Engineering Dashboard.md': engineering,
  'DijiPeople Product Dashboard.md': productDashboard,
  'Engineering Control Center.md': controlCenter,
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
