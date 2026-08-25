#!/usr/bin/env node
/*
 * Generate `.agent/context/component-index.md` — the shared frontend kits, as
 * an agent can retrieve them.
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN
 *
 * The component knowledge in this repository is already excellent, and it is
 * already in the right place: above the export, as a doc-comment, next to the
 * code it describes. `module-action-bar.tsx` explains why the command bar sits
 * at `z-10`; `standard-record-commands.ts` explains which five detail pages
 * inherit registry defaults they do not implement. None of that is missing.
 *
 * What was missing is any way to *find* it without reading a 4,771-line
 * registry first. An agent asked to change the admin command bar had two
 * options: guess, or read everything. This harvests the comments that already
 * exist into one searchable document, so a third option exists.
 *
 * Hand-authoring that document was the obvious alternative and is the wrong
 * one. A prose catalogue of 292 files is stale within a fortnight — the
 * `doc-code-drift` bug pattern, applied to the very document meant to prevent
 * it. AGENTS.md carries two provenance lines for the same reason. This script
 * stamps them automatically, so the index cannot claim a freshness it does not
 * have.
 *
 * WHAT IT DELIBERATELY LEAVES OUT
 *
 * Exports with no doc-comment. A list of 830 identifiers is a table of
 * contents, not knowledge — `retrieve-knowledge.mjs` says so in its own source
 * and filters generated indexes out of results for exactly this reason. An
 * undocumented export contributes a name and nothing else, and would dilute
 * the entries that carry meaning. The count of what was skipped is reported in
 * the index itself rather than hidden, because "this kit is 40% undocumented"
 * is itself knowledge a UI/UX agent should have.
 *
 *   node scripts/generate-component-index.mjs
 *   node scripts/generate-component-index.mjs --check   # CI: fails on drift
 *
 * Exit codes: 0 written (or up to date under --check)
 *             1 --check found the committed index out of date
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { indexIsCurrent } from './lib/index-drift.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = '.agent/context/component-index.md';
const CHECK = process.argv.includes('--check');

/*
 * The shared kits, in the order AGENTS.md introduces them. `packages/ui` is
 * included precisely because it is NOT the design system — an agent that finds
 * it first and imports from it has made the mistake `ui-design-system.md`
 * warns about, and the index should say so where the agent is looking.
 */
const SCOPES = [
  {
    app: 'apps/admin',
    title: 'Platform admin kit',
    dirs: ['apps/admin/app/_components', 'apps/admin/lib/runtime'],
    note: '`ProDataTable` (`crm/data-table.tsx`) is the required table for every production admin screen. A hand-rolled table here is a review failure.',
  },
  {
    app: 'apps/web',
    title: 'Tenant product kit',
    dirs: ['apps/web/app/components', 'apps/web/lib/runtime'],
    note: 'Metadata-driven UI is the default. New modules are declared through `lib/runtime/` and rendered by the standard runtime pages; a bespoke page needs a stated reason in the plan.',
  },
  {
    app: 'packages/ui',
    title: 'Shared package — NOT the design system',
    dirs: ['packages/ui/src'],
    note: 'Button, card and code only. This is not the design system and importing from it in an app is almost always wrong — use the app kit above.',
  },
];

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const trackedFiles = git(['ls-files'])
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const sourceFiles = trackedFiles.filter((file) => /\.(tsx|ts)$/.test(file) && !/\.spec\.tsx?$/.test(file));

/* ------------------------------------------------------------------ parsing */

/*
 * Strip a block comment down to its prose. Handles both `/** … *\/` and the
 * plain `/* … *\/` this codebase uses interchangeably — `module-action-bar.tsx`
 * uses the latter for its z-index note, and dropping it would lose the single
 * most useful sentence in the file.
 */
function commentProse(raw) {
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    /*
     * Strip a stray comment terminator. Some blocks in these kits close on the
     * same line as their last sentence rather than on a line of their own, so
     * the `*\/` survives the line-by-line pass above and lands in the summary
     * as a dangling slash.
     */
    .replace(/[\s*/]+$/, '')
    .trim();
}

/*
 * The first sentence, as a summary.
 *
 * Sentence splitting on ". " alone breaks on the abbreviations and file paths
 * this codebase is full of (`e.g.`, `i.e.`, `apps/web/lib/runtime/`), producing
 * summaries that stop mid-clause. Requiring a capital or a backtick after the
 * boundary costs nothing and fixes every case observed in these two kits.
 */
function firstSentence(prose) {
  if (!prose) return '';
  const match = prose.match(/^(.{20,400}?[.!?])(\s+[A-Z`*]|$)/);
  const sentence = (match ? match[1] : prose).trim();
  return sentence.length > 400 ? `${sentence.slice(0, 397)}…` : sentence;
}

/*
 * Find the doc-comment immediately above a line, allowing blank lines and
 * decorators between. Returns null when the nearest comment is separated by
 * real code — a comment three functions up is not documentation of this one.
 */
function docCommentAbove(lines, index) {
  let cursor = index - 1;
  while (cursor >= 0 && lines[cursor].trim() === '') cursor -= 1;
  if (cursor < 0) return null;
  if (!lines[cursor].trim().endsWith('*/')) return null;
  const end = cursor;
  while (cursor >= 0 && !/^\s*\/\*/.test(lines[cursor])) cursor -= 1;
  if (cursor < 0) return null;
  return commentProse(lines.slice(cursor, end + 1).join('\n'));
}

const EXPORT_PATTERN =
  /^export\s+(?:default\s+)?(?:async\s+)?(function|const|class|type|interface)\s+([A-Za-z0-9_]+)/;

function kindOf(keyword, name, body) {
  if (keyword === 'type' || keyword === 'interface') return 'type';
  /*
   * A React component is an uppercase export that returns JSX. Checking the
   * name alone would file `COMMAND_ORDER` and `MODULE_CAPABILITIES` as
   * components; checking for JSX alone would miss the ones that delegate
   * entirely to another component.
   */
  if (/^[A-Z]/.test(name)) {
    if (keyword === 'const' && /^[A-Z0-9_]+$/.test(name)) return 'constant';
    return body.includes(`<`) ? 'component' : 'value';
  }
  return keyword === 'function' ? 'function' : 'value';
}

const entries = [];
const skipped = new Map();

for (const scope of SCOPES) {
  for (const file of sourceFiles) {
    if (!scope.dirs.some((dir) => file.startsWith(`${dir}/`))) continue;
    const body = readFileSync(join(ROOT, file), 'utf8');
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(EXPORT_PATTERN);
      if (!match) continue;
      const [, keyword, name] = match;
      const doc = docCommentAbove(lines, i);
      const kind = kindOf(keyword, name, body);
      if (!doc) {
        skipped.set(scope.app, (skipped.get(scope.app) ?? 0) + 1);
        continue;
      }
      entries.push({ app: scope.app, file, line: i + 1, name, kind, summary: firstSentence(doc) });
    }
  }
}

/* -------------------------------------------------------------- importers */

/*
 * How many other tracked files import each name. This is the signal that tells
 * an agent which entry is load-bearing: `ui-design-system.md` already leans on
 * it by hand ("5 files, 75 importers"), and by hand is how it goes stale.
 *
 * Counted from named-import clauses across every tracked source file, so a
 * component used once and a component used seventy times are distinguishable
 * before deciding whether changing it is local or repository-wide.
 */
const importers = new Map();
for (const file of sourceFiles) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  for (const clause of body.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const raw of clause[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      const key = `${name}`;
      if (!importers.has(key)) importers.set(key, new Set());
      importers.get(key).add(file);
    }
  }
}

const importerCount = (name, ownFile) => {
  const set = importers.get(name);
  if (!set) return 0;
  return [...set].filter((file) => file !== ownFile).length;
};

/* ---------------------------------------------------------------- rendering */

const headSha = git(['rev-parse', '--short', 'HEAD']).trim();
const today = git(['show', '-s', '--format=%cs', 'HEAD']).trim();

const KIND_ORDER = { component: 0, function: 1, value: 2, constant: 3, type: 4 };

function renderScope(scope) {
  const mine = entries
    .filter((entry) => entry.app === scope.app)
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
        importerCount(b.name, b.file) - importerCount(a.name, a.file) ||
        a.name.localeCompare(b.name),
    );
  const out = [`### ${scope.title} — \`${scope.app}\``, '', scope.note, ''];
  if (!mine.length) {
    out.push('_No documented exports found._', '');
    return out.join('\n');
  }
  out.push(
    `${mine.length} documented export(s); ${skipped.get(scope.app) ?? 0} undocumented export(s) omitted.`,
    '',
    '| Export | Kind | Used by | Where | What it is |',
    '|---|---|---|---|---|',
  );
  for (const entry of mine) {
    const used = importerCount(entry.name, entry.file);
    const summary = entry.summary.replace(/\|/g, '\\|');
    out.push(
      `| \`${entry.name}\` | ${entry.kind} | ${used} | \`${entry.file}\`:${entry.line} | ${summary} |`,
    );
  }
  out.push('');
  return out.join('\n');
}

const totalDocumented = entries.length;
const totalSkipped = [...skipped.values()].reduce((sum, n) => sum + n, 0);

const document = `# Component Index

> **Last verified:** ${today}
> **Verified against commit:** ${headSha}
>
> **This file is generated. Do not hand-edit it.**
> \`node scripts/generate-component-index.mjs\` rebuilds it;
> \`--check\` fails when the committed copy has drifted from the source.
> To change an entry, change the doc-comment above the export it describes.

The shared frontend kits, harvested from the doc-comments that sit above their
exports. This exists so that "what does this component already do" is a
question an agent can answer by retrieval rather than by reading a directory.

**It is an index, not the truth.** The code is implementation truth and the
comment beside it is the reasoning; this document is a route to both. Every row
carries \`file\`:\`line\` for that reason — read the source before changing it.

**An export missing from here is undocumented, not absent.** ${totalSkipped} of
${totalDocumented + totalSkipped} exports across these kits carry no
doc-comment and are omitted rather than listed as bare names. That ratio is
itself worth knowing: it is where a UI/UX or Frontend agent is working without
stated rationale, and where adding one is worth more than a new abstraction.

**Used by** counts tracked files importing the name, excluding the file that
declares it. A high count means a change is repository-wide, not local.

## CURRENT

What follows is measured from the tree at the commit stamped above, not
described from memory. Every count, every path and every line number is
re-derived on each run.

## What to search here

- A component name in any spelling — \`ModuleActionBar\`, \`module-action-bar\`,
  \`command bar\`. Retrieval normalises between them; this document does not
  have to repeat itself.
- A behaviour — "empty state", "confirm", "overflow", "responsive".
- A kit, when the question is which component to reuse rather than which to read.

## The kits

${SCOPES.map(renderScope).join('\n')}
## Where this does not reach

- **Runtime registries are declarations, not components.** The admin command
  bar's contents come from \`platform-module-registry.ts\`, not from
  \`ModuleActionBar\` — the component renders what the registry declares. See
  \`.agent/context/runtime-module-system.md\` for that contract.
- **Bespoke screens are not kit.** A page component under a route group is
  outside these directories by design; this indexes what is meant to be reused.
- **Styling tokens are not here.** \`.agent/context/ui-design-system.md\` holds
  the theming boundary, the Tailwind v4 setup and the known exceptions.
`;

const target = join(ROOT, OUTPUT);
const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';

/*
 * What counts as drift lives in `lib/index-drift.mjs`, under test — the
 * provenance stamp and the checkout's line endings are both ignored, and both
 * for the same reason. BUG-1208 is what a byte comparison cost.
 */
if (CHECK) {
  if (indexIsCurrent(existing, document)) {
    console.log(`${OUTPUT} is up to date (${totalDocumented} documented exports).`);
    process.exit(0);
  }
  console.error(`${OUTPUT} is out of date.`);
  console.error('Run: node scripts/generate-component-index.mjs');
  process.exit(1);
}

writeFileSync(target, document, 'utf8');
console.log(
  `Wrote ${OUTPUT} — ${totalDocumented} documented export(s), ${totalSkipped} undocumented omitted.`,
);
