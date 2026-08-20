#!/usr/bin/env node
/*
 * Regenerate the session indexes from the records under docs/sessions/.
 *
 *   node scripts/rebuild-sessions.mjs           rewrite the indexes
 *   node scripts/rebuild-sessions.mjs --check   fail if a record is invalid or an index is stale
 *
 * Same contract as rebuild-backlog.mjs and rebuild-tasks.mjs: the record files
 * are the source of truth, every index is generated, and `--check` is what CI
 * runs so a hand-edited index cannot drift away from the records it claims to
 * summarise.
 *
 * Exit codes: 0 success · 1 a record is invalid, or --check found drift
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENERATED_BANNER,
  SESSION_DIR,
  bucketOf,
  compareSessions,
  loadSessions,
  writeIfChanged,
} from './lib/session-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const { sessions, errors } = loadSessions(ROOT);

if (errors.length) {
  console.error(`Session records FAILED validation — ${errors.length} error(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

const buckets = { active: [], completed: [] };
for (const session of sessions) buckets[bucketOf(session)].push(session);

const COLUMNS = '| Session | Task | Title | Status | Branch | Target | Leases | Heartbeat |';
const DIVIDER = '|---|---|---|---|---|---|---|---|';

function row(session, fromDir) {
  const depth = fromDir.split('/').filter(Boolean).length;
  const link = `${'../'.repeat(depth)}${session.relative}`;
  return (
    `| [${session.id}](${link}) | ${session.taskId || '—'} | ${session.title} | ${session.status} | ` +
    `\`${session.taskBranch}\` | \`${session.targetBranch}\` | ${session.leases.join(', ') || '—'} | ` +
    `${session.lastHeartbeat || '—'} |`
  );
}

function table(entries, empty) {
  if (!entries.length) return empty;
  return [COLUMNS, DIVIDER, ...entries.slice().sort(compareSessions).map((s) => row(s, SESSION_DIR))].join('\n');
}

function page(title, intro, body) {
  return `# ${title}\n\n${GENERATED_BANNER}\n\n${intro}\n\n${body}\n`;
}

const pages = {
  'index.md': page(
    'Sessions',
    [
      'Every Architect session that has run against this repository, and what it',
      'owned while it ran. Multiple sessions are expected to be active at once —',
      'see [`README.md`](README.md) for how they stay out of each other\'s way.',
      '',
      `**Active: ${buckets.active.length}** · completed: ${buckets.completed.length}`,
    ].join('\n'),
    [
      '## Active',
      '',
      table(buckets.active, '_None. No session is currently running._'),
      '',
      '## Completed',
      '',
      table(buckets.completed, '_None yet._'),
    ].join('\n'),
  ),
  'active.md': page(
    'Active Sessions',
    [
      'What is running **now**. The Architect reads this before planning, so that',
      'two sessions do not plan work over the same ground.',
      '',
      'This file is durable state committed to Git. The *live* view — heartbeats,',
      'leases actually held this minute, the develop merge queue — comes from',
      '`node scripts/session.mjs list`, which reads the shared Git directory and',
      'therefore sees sibling worktrees without anybody having pushed.',
    ].join('\n'),
    table(buckets.active, '_None. No session is currently running._'),
  ),
  'completed.md': page(
    'Completed Sessions',
    'Sessions that reached a terminal state. Kept as history: the branch, the base it was cut from, and what it held.',
    table(buckets.completed, '_None yet._'),
  ),
};

let changed = 0;
const drift = [];

for (const [name, content] of Object.entries(pages)) {
  const path = join(ROOT, SESSION_DIR, name);
  if (CHECK_ONLY) {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content.replace(/\r\n/g, '\n')) drift.push(name);
    continue;
  }
  if (writeIfChanged(path, content)) {
    changed += 1;
    console.log(`  rewrote  ${SESSION_DIR}/${name}`);
  }
}

if (CHECK_ONLY) {
  if (drift.length) {
    console.error('Session indexes are stale — run `node scripts/rebuild-sessions.mjs`:');
    for (const name of drift) console.error(`  x ${name}`);
    process.exit(1);
  }
  console.log(`Session records valid and indexes current — ${sessions.length} record(s).`);
} else {
  console.log('');
  console.log(
    `Sessions rebuilt — ${sessions.length} record(s), ${buckets.active.length} active, ${changed} index(es) rewritten.`,
  );
}
