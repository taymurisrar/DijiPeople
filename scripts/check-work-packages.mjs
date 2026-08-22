#!/usr/bin/env node
/*
 * Validate durable work-package state, and compute what is READY next.
 *
 *   node scripts/check-work-packages.mjs            # validate every task
 *   node scripts/check-work-packages.mjs --json     # machine-readable
 *   node scripts/check-work-packages.mjs --task TASK-0012
 *   node scripts/check-work-packages.mjs --root <dir>   # sandbox, for simulations
 *
 * Two things are checked, and the second is the one that matters.
 *
 * 1. Each package file is well formed: required fields, required sections, a
 *    context manifest that actually declares something, no terminal status
 *    without evidence behind it.
 *
 * 2. The package files and the parent record's Work Packages table agree. Each
 *    artefact can look healthy on its own while the pair disagrees about what is
 *    finished — and a resuming session reads the table for "what is left" and
 *    the file for "how to do it". Drift between them is how a package gets
 *    silently skipped and a program reports done with a hole in it.
 *
 * `NEXT_READY_WORK_PACKAGE` is recomputed rather than trusted. A declared value
 * that disagrees with the dependency graph is a failure, because continuation
 * follows the declaration: a stale pointer sends the next session to a package
 * whose dependencies are not met, or — worse — to nothing at all while work
 * remains.
 *
 * Exit codes: 0 valid · 1 problems found · 2 usage error
 *
 * No dependencies.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTasks } from './lib/task-records.mjs';
import { loadWorkPackages, reconcileWithParent, readyPackages } from './lib/work-package-records.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);

function option(name, fallback = '') {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
}

if (argv.includes('--help')) {
  console.error('Usage: node scripts/check-work-packages.mjs [--task TASK-nnnn] [--json] [--root <dir>]');
  process.exit(2);
}

const ROOT = option('root') ? resolve(option('root')) : DEFAULT_ROOT;
const wantJson = argv.includes('--json');
const only = option('task').trim();

const { tasks, errors: taskErrors } = loadTasks(ROOT);

const problems = [];
const report = [];

/*
 * Exemptions are printed, never swallowed. A rule that quietly does not apply
 * to five records is a rule nobody knows the shape of.
 */
const grandfathered = [];

/*
 * A malformed task record is reported but does not stop the package check —
 * the two failures have different owners, and hiding one behind the other is
 * how a single bad frontmatter line masks a whole program's drift.
 */
for (const error of taskErrors) problems.push(error);

for (const task of tasks) {
  if (only && task.id !== only) continue;

  const loaded = loadWorkPackages(ROOT, task.relative);
  for (const error of loaded.errors) problems.push(error);

  for (const error of reconcileWithParent(task, loaded, grandfathered)) problems.push(error);

  const rows = task.packages ?? [];
  const ready = readyPackages(rows);
  /*
   * Frontmatter is the canonical home: this is machine state a resuming session
   * reads before it reads anything else. The body form is accepted as a
   * fallback so a record that spells it out in prose is not punished for it.
   */
  const declared = String(
    task.fields?.NEXT_READY_WORK_PACKAGE ??
      (/NEXT_READY_WORK_PACKAGE:\s*(\S+)/.exec(task.body ?? '') ?? [])[1] ??
      '',
  ).trim();
  const computed = ready[0]?.id ?? 'NONE';

  const terminal = ['COMPLETE', 'ABANDONED'].includes(task.status);

  /*
   * Only live programs need a continuation pointer. A COMPLETE task has nothing
   * to continue, and demanding the field there would turn every finished record
   * into a permanent warning nobody reads.
   */
  if (!terminal && rows.length > 0) {
    if (!declared) {
      problems.push(
        `${task.relative}: no NEXT_READY_WORK_PACKAGE — a resuming session has nothing to start from (computed: ${computed})`,
      );
    } else if (declared.replace(/[`.,]/g, '') !== computed) {
      problems.push(
        `${task.relative}: NEXT_READY_WORK_PACKAGE says ${declared} but the dependency graph computes ${computed}`,
      );
    }
  }

  report.push({
    task: task.id,
    title: task.title,
    status: task.status,
    size: task.size,
    packageFiles: loaded.packages.length,
    tableRows: rows.length,
    done: rows.filter((row) => row.status === 'DONE').map((row) => row.id),
    ready: ready.map((row) => row.id),
    blocked: rows.filter((row) => row.status === 'BLOCKED').map((row) => row.id),
    waitingUser: rows.filter((row) => row.status === 'WAITING_USER').map((row) => row.id),
    nextReady: computed,
  });
}

if (only && report.length === 0) {
  console.error(`No task record found for ${only}.`);
  process.exit(2);
}

if (wantJson) {
  console.log(
    JSON.stringify({ ok: problems.length === 0, problems, grandfathered, tasks: report }, null, 2),
  );
  process.exit(problems.length === 0 ? 0 : 1);
}

for (const entry of report) {
  if (entry.tableRows === 0) continue;
  console.log(
    `${entry.task}  ${entry.status.padEnd(12)} ${entry.done.length}/${entry.tableRows} done` +
      `  ·  ${entry.packageFiles} package file(s)`,
  );
  if (entry.ready.length) console.log(`    READY         ${entry.ready.join(', ')}`);
  if (entry.blocked.length) console.log(`    BLOCKED       ${entry.blocked.join(', ')}`);
  if (entry.waitingUser.length) console.log(`    WAITING_USER  ${entry.waitingUser.join(', ')}`);
  console.log(`    NEXT_READY_WORK_PACKAGE  ${entry.nextReady}`);
}

if (grandfathered.length) {
  console.log('');
  console.log(`Predating the work-package file convention — table-only state retained:`);
  for (const entry of grandfathered) console.log(`  - ${entry}`);
}

if (problems.length) {
  console.error('');
  console.error(`Work-package validation FAILED — ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  x ${problem}`);
  process.exit(1);
}

console.log('');
console.log(`Work-package state valid — ${report.length} task(s) inspected.`);
