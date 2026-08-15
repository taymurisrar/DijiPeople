#!/usr/bin/env node
/*
 * Scaffold an engineering-history record from what Git already knows.
 *
 * It fills the mechanical fields — date, branches, base, SHAs, commit list,
 * worktree, changed files — because those are facts a script reads more
 * reliably than an agent recalls them, and a mistyped SHA makes the whole
 * record untrustworthy.
 *
 * It deliberately leaves Conflicts, Conflict Resolutions and Post-Merge
 * Validation empty. Those are the Integrator's judgement and the record's whole
 * reason for existing in prose; a script that pre-filled them would be
 * inventing the one part nobody can reconstruct later.
 *
 *   node scripts/new-engineering-history.mjs tenant-erasure-hardening
 *   node scripts/new-engineering-history.mjs my-task --base main --target main
 *
 * Exit codes: 0 created · 1 refused · 2 usage error
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'docs/engineering-history/tasks';

const argv = process.argv.slice(2);
const slug = argv.find((arg) => !arg.startsWith('--'));

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

if (!slug || argv.includes('--help')) {
  console.error('Usage: node scripts/new-engineering-history.mjs <task-slug> [options]');
  console.error('');
  console.error('  --base    base branch the task started from   (default: origin/main, else main)');
  console.error('  --target  branch the work merges into          (default: main)');
  console.error('  --title   human task title                     (default: derived from the slug)');
  console.error('  --type    FEATURE | BUGFIX | FRAMEWORK | REFACTOR | MIGRATION | INFRA');
  process.exit(2);
}

/**
 * Git that never throws. A missing upstream or a shallow clone is a fact to
 * record, not a reason to refuse to scaffold the document.
 */
function git(args, fallback = 'UNKNOWN') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const today = new Date().toISOString().slice(0, 10);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const headSha = git(['rev-parse', 'HEAD']);
const shortSha = git(['rev-parse', '--short', 'HEAD']);

const target = option('target', 'main');
const base =
  option('base') ||
  (git(['rev-parse', '--verify', `origin/${target}`], '') ? `origin/${target}` : target);

const mergeBase = git(['merge-base', 'HEAD', base]);
const range = mergeBase === 'UNKNOWN' ? '' : `${mergeBase}..HEAD`;

const commits = range
  ? git(['log', '--reverse', '--format=%h %s', range], '')
  : '';
const changedFiles = range ? git(['diff', '--name-status', range], '') : '';
const changedCount = changedFiles ? changedFiles.split('\n').filter(Boolean).length : 0;

/* `git worktree list --porcelain` is the only stable machine format here. */
const worktrees = git(['worktree', 'list'], '');

const title =
  option('title') ||
  slug
    .split('-')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');

const filename = `${today}-${slug}-${shortSha}.md`;
const path = join(ROOT, OUT_DIR, filename);

if (existsSync(path)) {
  console.error(`${OUT_DIR}/${filename} already exists — refusing to overwrite.`);
  console.error('History records are never edited to look tidier. Write a new one.');
  process.exit(1);
}

const block = (value, empty = '_None._') => (value && value.trim() ? value.trim() : empty);

const content = `# Engineering History — ${title}

| | |
|---|---|
| **Task Title** | ${title} |
| **Task Type** | ${option('type', 'TODO — FEATURE / BUGFIX / FRAMEWORK / REFACTOR / MIGRATION / INFRA')} |
| **Date** | ${today} |
| **Architect Plan** | TODO — path to the ExecPlan, or NOT_APPLICABLE with a reason |
| **Agents Used** | TODO — and which were deliberately not used |

## Git

| | |
|---|---|
| **Base Branch** | \`${base}\` |
| **Task Branch** | \`${branch}\` |
| **Base SHA** | \`${mergeBase}\` |
| **Final Task SHA** | \`${headSha}\` |
| **Target Branch** | \`${target}\` |
| **Merge Commit** | TODO — filled after the merge |
| **Final Target SHA** | TODO — filled after the target is pushed |

### Commits

\`\`\`
${block(commits, '(none — the branch has no commits beyond its base)')}
\`\`\`

### Worktrees

\`\`\`
${block(worktrees)}
\`\`\`

### Files Changed

${changedCount} file(s) against \`${base}\`.

\`\`\`
${block(changedFiles, '(no differences against the base)')}
\`\`\`

## Conflicts

TODO — Integrator. For each conflict: the files, the type from the nine-type
taxonomy in [\`.agent/agents/integrator.md\`](../../../.agent/agents/integrator.md),
and what each side intended.

Write \`None.\` if the merge was clean. Do not omit the section.

## Conflict Resolutions

TODO — Integrator. For each conflict above: what was chosen, and **what would
have been lost by choosing the other side**. This is the field a script cannot
fill and the reason this record is prose.

## QA

| | |
|---|---|
| **QA Report** | TODO — \`docs/qa/runs/…\` and the verdict |
| **Bug IDs** | TODO — \`BUG-nnnn\` records created or closed by this task |
| **Backlog Items** | TODO — \`ITEM-nnnn\` records created, advanced or closed |

## CI

| | |
|---|---|
| **CI Run ID** | TODO — the run whose \`CI required gate\` verdict authorised the merge |
| **CI Result** | TODO — PASS / FAILED / PENDING / BLOCKED_BY_ACCESS / UNAVAILABLE |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

TODO — QA. The commands actually run against the **merged** SHA, and their
results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

TODO — Release/DevOps. Whether this reaches an environment, the rollback class,
and the release record if one exists. \`None — not deployed.\` is a complete
answer.

## Knowledge Capture

TODO — which \`docs/knowledge/\` files were written or updated, and their
categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

TODO — whether \`node scripts/sync-obsidian.mjs\` ran, and which \`Generated/\`
folders changed.

## Cleanup

TODO — worktree removed, local branch deleted, or the reason neither was.
`;

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, content, 'utf8');

console.log(`Created ${OUT_DIR}/${filename}`);
console.log('');
console.log(`Derived from Git: base ${base} (${mergeBase.slice(0, 7)}), branch ${branch},`);
console.log(`head ${shortSha}, ${changedCount} changed file(s).`);
console.log('');
console.log('Every TODO must be resolved before the task reports COMPLETE.');
console.log('Conflicts and Conflict Resolutions are the Integrator\'s, and no script can fill them.');
