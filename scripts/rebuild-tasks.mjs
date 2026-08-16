#!/usr/bin/env node
/*
 * Regenerate the parent-task indexes under docs/tasks/.
 *
 * The indexes are generated, never hand-maintained — the same rule the bug and
 * backlog indexes follow, for the same reason: a stale index is worse than no
 * index, because people trust it and it is wrong in the direction of "nothing
 * is outstanding".
 *
 *   node scripts/rebuild-tasks.mjs            rewrite the indexes
 *   node scripts/rebuild-tasks.mjs --check    fail if records are invalid or
 *                                             an index is out of date
 *
 * Exit codes: 0 clean · 1 invalid records, or (with --check) a stale index
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

import {
  TASK_DIR,
  GENERATED_BANNER,
  loadTasks,
  bucketOf,
  compareTasks,
  progressOf,
  readyPackages,
  isFullyBlocked,
  writeIfChanged,
} from './lib/task-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const { tasks, errors } = loadTasks(ROOT);

if (errors.length) {
  console.error(`Task records are invalid — ${errors.length} problem(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

// ----------------------------------------------------------------- rendering

function link(task) {
  return `[${task.id}](${task.relative.replace(`${TASK_DIR}/`, '')})`;
}

function row(task) {
  const { done, total } = progressOf(task);
  const progress = total ? `${done}/${total}` : '—';
  const current = task.currentPackage || '—';
  return `| ${link(task)} | ${task.title} | ${task.type} | ${task.size} | ${task.priority} | ${task.status} | ${progress} | ${current} |`;
}

const HEADER = [
  '| ID | Title | Type | Size | Priority | Status | Packages | Current |',
  '|---|---|---|---|---|---|---|---|',
];

function table(rows, empty) {
  if (!rows.length) return `${empty}\n`;
  return [...HEADER, ...rows].join('\n') + '\n';
}

function page(title, intro, rows, empty) {
  return [
    `# ${title}`,
    '',
    GENERATED_BANNER,
    '',
    intro,
    '',
    table(rows, empty),
  ].join('\n');
}

const sorted = [...tasks].sort(compareTasks);
const buckets = { active: [], blocked: [], completed: [] };
for (const task of sorted) buckets[bucketOf(task)].push(task);

const files = new Map();

files.set(
  'active.md',
  page(
    'Active Tasks',
    'Parent tasks currently in flight. `Current` is the work package executing now.',
    buckets.active.map(row),
    'No active parent tasks.',
  ),
);

/*
 * Blocked tasks carry their reason inline. A blocked list that does not say why
 * is a list nobody can act on — and the whole point of the four block reasons is
 * that three of them are things an agent can resolve without the user.
 */
const blockedRows = buckets.blocked.map((task) => {
  const reason = String(task.fields.BLOCKED_PACKAGES ?? '').trim() || '—';
  return `| ${link(task)} | ${task.title} | ${task.priority} | ${reason} |`;
});

files.set(
  'blocked.md',
  [
    '# Blocked Tasks',
    '',
    GENERATED_BANNER,
    '',
    'A task appears here only when **every** remaining work package is blocked.',
    'One blocked package never stops an independent one.',
    '',
    blockedRows.length
      ? ['| ID | Title | Priority | Blocked packages |', '|---|---|---|---|', ...blockedRows].join('\n') + '\n'
      : 'No blocked parent tasks.\n',
  ].join('\n'),
);

files.set(
  'completed.md',
  page(
    'Completed Tasks',
    'Parent tasks that reached a terminal state. `FINAL_STATUS` records how.',
    buckets.completed.map(row),
    'No completed parent tasks.',
  ),
);

/*
 * The index is the one page a human reads first, so it leads with what needs
 * attention rather than with a full listing.
 */
const ownerQuestions = tasks.filter((task) => {
  const declared = Number(task.ownerDecisions);
  return Number.isFinite(declared) && declared > 0;
});

const stalled = tasks.filter((task) => !['COMPLETE', 'ABANDONED'].includes(task.status) && isFullyBlocked(task));

const nextUp = buckets.active
  .flatMap((task) => readyPackages(task).slice(0, 1).map((wp) => `| ${link(task)} | ${wp.id} | ${wp.title} |`))
  .slice(0, 10);

files.set(
  'index.md',
  [
    '# Parent Tasks',
    '',
    GENERATED_BANNER,
    '',
    'Durable state for LARGE and PROGRAM tasks — the decomposition, the dependency',
    'graph and the block reasons. See',
    '[`.agent/context/task-orchestration.md`](../../.agent/context/task-orchestration.md).',
    '',
    '| Bucket | Count |',
    '|---|---|',
    `| [Active](active.md) | ${buckets.active.length} |`,
    `| [Blocked](blocked.md) | ${buckets.blocked.length} |`,
    `| [Completed](completed.md) | ${buckets.completed.length} |`,
    '',
    '## Next ready work package',
    '',
    nextUp.length
      ? ['| Task | WP | Title |', '|---|---|---|', ...nextUp].join('\n')
      : 'Nothing ready.',
    '',
    '## Needs a human',
    '',
    ownerQuestions.length || stalled.length
      ? [
          ...ownerQuestions.map((task) => `- ${link(task)} — ${task.ownerDecisions} owner decision(s) outstanding`),
          ...stalled.map((task) => `- ${link(task)} — every remaining work package is blocked`),
        ].join('\n')
      : 'Nothing. No outstanding owner decisions, no fully blocked tasks.',
    '',
    '## All tasks',
    '',
    table(sorted.map(row), 'No parent tasks recorded.'),
  ].join('\n'),
);

// ------------------------------------------------------------------- writing

const stale = [];
let written = 0;

for (const [name, content] of files) {
  const path = join(ROOT, TASK_DIR, name);
  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content.replace(/\r\n/g, '\n')) stale.push(`${TASK_DIR}/${name}`);
    continue;
  }
  if (writeIfChanged(path, content)) written += 1;
}

if (checkOnly) {
  if (stale.length) {
    console.error(`Task indexes are out of date — run node scripts/rebuild-tasks.mjs`);
    for (const path of stale) console.error(`  x ${path}`);
    process.exit(1);
  }
  console.log(`Task records valid and indexes current — ${tasks.length} task(s).`);
  process.exit(0);
}

console.log(`Rebuilt task indexes — ${tasks.length} task(s), ${written} file(s) changed.`);
